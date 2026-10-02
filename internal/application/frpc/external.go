package frpc

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
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
	cfg.WebServer = v1.WebServerConfig{Addr: "0.0.0.0", Port: 7400, User: fs.username, Password: fs.password}
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

func (fs *Service) TerminateFrpc(id *string) error {
	fs.mu.Lock()
	defer fs.mu.Unlock()
	if fs.activeID() != *id {
		return nil
	}
	// Park the client without tunnels; its private admin API stays reachable for the next start.
	next, _ := json.Marshal(map[string]any{"serverAddr": "127.0.0.1", "serverPort": 9,
		"loginFailExit": false, "webServer": map[string]any{"addr": "0.0.0.0", "port": 7400, "user": fs.username, "password": fs.password},
		"log": map[string]any{"to": "console", "level": "error", "disablePrintColor": true}})
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

// Reconcile persisted status after a panel restart, without restarting healthy tunnels.
func (fs *Service) AutoStartServers() {
	fs.syncStatus()
	if fs.activeID() == "" {
		records, err := fs.serverRepo.FindAllWithAutoConnect()
		if err == nil && len(records) > 0 {
			id := records[0].ID
			if err := fs.LaunchFrpc(&id); err != nil {
				fs.app.Logger().Error("External frpc auto-start failed", "error", err)
			}
		}
	}
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	for range ticker.C {
		fs.syncStatus()
	}
}
