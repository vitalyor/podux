package frpc

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	v1 "github.com/fatedier/frp/pkg/config/v1"
	"github.com/pocketbase/pocketbase/core"
	proxydomain "podux/internal/domain/proxy"
	serverdomain "podux/internal/domain/server"
)

// Service owns configuration, not the external frpc process. Docker owns its lifecycle.
type Service struct {
	mu         sync.Mutex
	app        core.App
	serverRepo serverdomain.Repository
	proxyRepo  proxydomain.Repository
	client     *http.Client
	endpoint   string
	username   string
	password   string
	runtimeDir string
}

func NewService(app core.App, servers serverdomain.Repository, proxies proxydomain.Repository) *Service {
	endpoint := os.Getenv("FRPC_API_URL")
	if endpoint == "" {
		endpoint = "http://frpc:7400"
	}
	return &Service{app: app, serverRepo: servers, proxyRepo: proxies,
		client: &http.Client{Timeout: 5 * time.Second}, endpoint: strings.TrimRight(endpoint, "/"),
		username: os.Getenv("FRPC_API_USER"), password: os.Getenv("FRPC_API_PASSWORD"),
		runtimeDir: filepath.Join("pb_data", "runtime"),
	}
}

func (fs *Service) request(method, path string, content []byte) ([]byte, error) {
	req, err := http.NewRequest(method, fs.endpoint+path, bytes.NewReader(content))
	if err != nil {
		return nil, err
	}
	req.SetBasicAuth(fs.username, fs.password)
	req.Header.Set("Content-Type", "application/json")
	resp, err := fs.client.Do(req)
	if err != nil {
		return nil, errors.New("external frpc API is unavailable")
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusOK {
		// Responses may contain credentials from rejected configuration. Do not relay them.
		return nil, fmt.Errorf("external frpc rejected %s (HTTP %d)", path, resp.StatusCode)
	}
	return body, nil
}

func (fs *Service) activeID() string {
	data, _ := os.ReadFile(filepath.Join(fs.runtimeDir, "active-server"))
	return strings.TrimSpace(string(data))
}

func (fs *Service) writeActive(id string) error {
	if err := os.MkdirAll(fs.runtimeDir, 0700); err != nil {
		return err
	}
	tmp := filepath.Join(fs.runtimeDir, "active-server.next")
	if err := os.WriteFile(tmp, []byte(id), 0600); err != nil {
		return err
	}
	return os.Rename(tmp, filepath.Join(fs.runtimeDir, "active-server"))
}

// Config common options require a process restart; proxy-only edits use hot reload.
func commonConfig(data []byte) ([]byte, error) {
	var config map[string]json.RawMessage
	if err := json.Unmarshal(data, &config); err != nil {
		return nil, err
	}
	delete(config, "proxies")
	delete(config, "visitors")
	return json.Marshal(config)
}

func (fs *Service) applyConfig(next []byte) error {
	if fs.password == "" {
		return errors.New("FRPC_API_PASSWORD is required")
	}
	if _, err := commonConfig(next); err != nil {
		return err
	}
	before, err := fs.request(http.MethodGet, "/api/config", nil)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(fs.runtimeDir, 0700); err != nil {
		return err
	}
	if err := os.WriteFile(filepath.Join(fs.runtimeDir, "frpc.previous.json"), before, 0600); err != nil {
		return err
	}
	if _, err = fs.request(http.MethodPut, "/api/config", next); err != nil {
		return err
	}
	// frpc validates the entire file before updating live proxies.
	if _, err = fs.request(http.MethodGet, "/api/reload?strictConfig=true", nil); err != nil {
		_, restoreErr := fs.request(http.MethodPut, "/api/config", before)
		if restoreErr == nil {
			_, restoreErr = fs.request(http.MethodGet, "/api/reload?strictConfig=true", nil)
		}
		if restoreErr != nil {
			return fmt.Errorf("configuration rejected; rollback failed: %w", restoreErr)
		}
		return err
	}
	oldCommon, err := commonConfig(before)
	if err != nil {
		return err
	}
	newCommon, _ := commonConfig(next)
	if bytes.Equal(oldCommon, newCommon) {
		return nil
	}
	// POST /api/stop exits only frpc. restart:unless-stopped brings it back with the saved file.
	if _, err = fs.request(http.MethodPost, "/api/stop", nil); err != nil {
		return err
	}
	time.Sleep(500 * time.Millisecond)
	deadline := time.Now().Add(20 * time.Second)
	for time.Now().Before(deadline) {
		if _, err = fs.request(http.MethodGet, "/api/status", nil); err == nil {
			return nil
		}
		time.Sleep(250 * time.Millisecond)
	}
	// Keep a valid persistent configuration if a restart fails.
	if err := os.WriteFile(filepath.Join(fs.runtimeDir, "frpc.json"), before, 0600); err != nil {
		return fmt.Errorf("frpc restart failed; cannot restore previous configuration: %w", err)
	}
	return errors.New("frpc did not return after restart; previous configuration restored")
}

func (fs *Service) adminConfig() (v1.WebServerConfig, error) {
	addr := os.Getenv("FRPC_API_BIND")
	if addr == "" {
		addr = "0.0.0.0"
	}
	port := 7400
	if value := os.Getenv("FRPC_API_PORT"); value != "" {
		parsed, err := strconv.Atoi(value)
		if err != nil || parsed < 1 || parsed > 65535 {
			return v1.WebServerConfig{}, errors.New("invalid FRPC_API_PORT")
		}
		port = parsed
	}
	if net.ParseIP(addr) == nil {
		return v1.WebServerConfig{}, errors.New("invalid FRPC_API_BIND")
	}
	return v1.WebServerConfig{Addr: addr, Port: port, User: fs.username, Password: fs.password}, nil
}

func (fs *Service) profileConfig(id string) ([]byte, error) {
	cfg, err := fs.genCommonCfgs(&id)
	if err != nil {
		return nil, err
	}
	proxies, err := fs.genProxyCfgs(&id)
	if err != nil {
		return nil, err
	}
	fail := false
	cfg.LoginFailExit = &fail
	cfg.WebServer, err = fs.adminConfig()
	if err != nil {
		return nil, err
	}
	cfg.Log.DisablePrintColor = true
	// Preserve the user's visible name; technical proxy names must remain unique.
	common, err := json.Marshal(cfg)
	if err != nil {
		return nil, err
	}
	var full map[string]any
	if err := json.Unmarshal(common, &full); err != nil {
		return nil, err
	}
	full["proxies"] = proxies
	return json.MarshalIndent(full, "", "  ")
}

func (fs *Service) LaunchFrpc(id *string) error {
	fs.mu.Lock()
	defer fs.mu.Unlock()
	if !validServerID.MatchString(*id) {
		return errors.New("invalid server id")
	}
	if active := fs.activeID(); active != "" && active != *id {
		return errors.New("another profile is active; stop it before switching")
	}
	next, err := fs.profileConfig(*id)
	if err != nil {
		return err
	}
	if err := fs.applyConfig(next); err != nil {
		return err
	}
	if err := fs.writeActive(*id); err != nil {
		return err
	}
	return fs.serverRepo.UpdateBootStatus(*id, serverdomain.ServerStatusRunning)
}

func (fs *Service) ReloadFrpc(id *string) error {
	fs.mu.Lock()
	defer fs.mu.Unlock()
	if fs.activeID() != *id {
		return errors.New("profile is not active")
	}
	next, err := fs.profileConfig(*id)
	if err != nil {
		return err
	}
	return fs.applyConfig(next)
}

// Seed the shared config before either container needs to connect. The panel and
// official client can start independently, including when the network is unavailable.
func (fs *Service) EnsureRuntimeConfig() error {
	path := filepath.Join(fs.runtimeDir, "frpc.json")
	if _, err := os.Stat(path); err == nil {
		return nil
	} else if !os.IsNotExist(err) {
		return err
	}
	if fs.password == "" {
		return errors.New("FRPC_API_PASSWORD is required")
	}
	config, err := fs.parkConfig()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(fs.runtimeDir, 0700); err != nil {
		return err
	}
	tmp := path + ".next"
	if err := os.WriteFile(tmp, config, 0600); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

func (fs *Service) parkConfig() ([]byte, error) {
	admin, err := fs.adminConfig()
	if err != nil {
		return nil, err
	}
	return json.Marshal(map[string]any{"serverAddr": "127.0.0.1", "serverPort": 9,
		"loginFailExit": false, "webServer": admin,
		"log": map[string]any{"to": "console", "level": "error", "disablePrintColor": true}})
}

func (fs *Service) TerminateFrpc(id *string) error {
	fs.mu.Lock()
	defer fs.mu.Unlock()
	if fs.activeID() != *id {
		return nil
	}
	// Park the client without tunnels; its private admin API stays reachable for the next start.
	next, err := fs.parkConfig()
	if err != nil {
		return err
	}
	if err := fs.applyConfig(next); err != nil {
		return err
	}
	if err := fs.writeActive(""); err != nil {
		return err
	}
	fs.proxyRepo.UpdateBootStatusByServerID(*id, proxydomain.ProxyBootStatusOffline)
	return fs.serverRepo.UpdateBootStatus(*id, serverdomain.ServerStatusStopped)
}

func (fs *Service) IsServerRunning(id string) bool { return fs.activeID() == id }

type proxyStatus struct {
	Name   string `json:"name"`
	Status string `json:"status"`
}

func (fs *Service) syncStatus() {
	fs.mu.Lock()
	defer fs.mu.Unlock()
	id := fs.activeID()
	if id == "" {
		return
	}
	data, err := fs.request(http.MethodGet, "/api/status", nil)
	serverStatus := serverdomain.ServerStatusRunning
	if err != nil {
		serverStatus = serverdomain.ServerStatusStopped
	}
	fs.serverRepo.UpdateBootStatus(id, serverStatus)
	var statuses map[string][]proxyStatus
	if err == nil {
		err = json.Unmarshal(data, &statuses)
	}
	proxies, repoErr := fs.proxyRepo.FindByServerID(id)
	if repoErr != nil {
		return
	}
	for _, p := range proxies {
		state := proxydomain.ProxyBootStatusOffline
		name := p.Name + "-" + p.Id
		for _, list := range statuses {
			for _, status := range list {
				if (status.Name == name || strings.HasSuffix(status.Name, "."+name)) && status.Status == "running" {
					state = proxydomain.ProxyBootStatusOnline
				}
			}
		}
		fs.proxyRepo.UpdateBootStatus(p.Id, state)
	}
}

// Retry startup while the external API is unavailable. Once started, a manual stop
// stays stopped until the next panel start; the status loop never relaunches it.
func (fs *Service) tryAutoStart() bool {
	records, err := fs.serverRepo.FindAllWithAutoConnect()
	if err != nil {
		return false
	}
	if len(records) == 0 {
		return true
	}
	id := records[0].ID
	if err := fs.LaunchFrpc(&id); err != nil {
		fs.app.Logger().Warn("External frpc auto-start will retry", "error", err)
		return false
	}
	return true
}

// Reconcile persisted status after a panel restart, without restarting healthy tunnels.
func (fs *Service) AutoStartServers() {
	pending := fs.activeID() == ""
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	for {
		fs.syncStatus()
		if pending && fs.tryAutoStart() {
			pending = false
		}
		<-ticker.C
	}
}
