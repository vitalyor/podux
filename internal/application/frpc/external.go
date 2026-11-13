package frpc

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/pocketbase/pocketbase/core"
	proxydomain "podux/internal/domain/proxy"
	serverdomain "podux/internal/domain/server"
)

// Service owns configuration, not the external frpc processes. The supervisor in the
// podux-frpc container runs one frpc per directory runtime/clients/<serverId>/ that has
// an "enabled" file; this service only writes those files and talks to each admin API.
type Service struct {
	mu         sync.Mutex
	app        core.App
	serverRepo serverdomain.Repository
	proxyRepo  proxydomain.Repository
	client     *http.Client
	username   string
	password   string
	runtimeDir string
	basePort   int
	apiHost    string // where podux reaches the admin APIs (host part of FRPC_API_URL)
	bindAddr   string // where each frpc admin API listens (FRPC_API_BIND)
	// endpointFor overrides the admin API address (tests).
	endpointFor func(id string) string
}

func NewService(app core.App, servers serverdomain.Repository, proxies proxydomain.Repository) *Service {
	base := 7401
	if v, err := strconv.Atoi(os.Getenv("FRPC_API_PORT")); err == nil && v > 0 && v < 65535 {
		base = v
	}
	// Host networking (homelab): both stay 127.0.0.1. Bridge networking: URL host is the
	// frpc service name and FRPC_API_BIND is 0.0.0.0 inside the private compose network.
	host, bind := "127.0.0.1", "127.0.0.1"
	if u, err := url.Parse(os.Getenv("FRPC_API_URL")); err == nil && u.Hostname() != "" {
		host = u.Hostname()
	}
	if v := os.Getenv("FRPC_API_BIND"); net.ParseIP(v) != nil {
		bind = v
	}
	return &Service{app: app, serverRepo: servers, proxyRepo: proxies,
		client:   &http.Client{Timeout: 5 * time.Second},
		username: os.Getenv("FRPC_API_USER"), password: os.Getenv("FRPC_API_PASSWORD"),
		runtimeDir: filepath.Join("pb_data", "runtime"), basePort: base, apiHost: host, bindAddr: bind,
	}
}

func (fs *Service) clientsDir() string         { return filepath.Join(fs.runtimeDir, "clients") }
func (fs *Service) clientDir(id string) string { return filepath.Join(fs.clientsDir(), id) }

// IsServerRunning reports whether the connection is enabled (its process is supervised).
func (fs *Service) IsServerRunning(id string) bool {
	if !validServerID.MatchString(id) {
		return false
	}
	_, err := os.Stat(filepath.Join(fs.clientDir(id), "enabled"))
	return err == nil
}

func (fs *Service) enabledIDs() []string {
	entries, _ := os.ReadDir(fs.clientsDir())
	var ids []string
	for _, e := range entries {
		if e.IsDir() && fs.IsServerRunning(e.Name()) {
			ids = append(ids, e.Name())
		}
	}
	return ids
}

func readPort(dir string) int {
	data, _ := os.ReadFile(filepath.Join(dir, "port"))
	p, _ := strconv.Atoi(strings.TrimSpace(string(data)))
	return p
}

// port returns the connection's admin API port; it is allocated once and then kept in
// runtime/clients/<id>/port so it survives restarts (and is what the supervisor healthcheck reads).
func (fs *Service) port(id string) (int, error) {
	if p := readPort(fs.clientDir(id)); p > 0 {
		return p, nil
	}
	used := map[int]bool{}
	entries, _ := os.ReadDir(fs.clientsDir())
	for _, e := range entries {
		if p := readPort(filepath.Join(fs.clientsDir(), e.Name())); p > 0 {
			used[p] = true
		}
	}
	p := fs.basePort
	for used[p] {
		p++
	}
	if p > 65535 {
		return 0, errors.New("no free admin API port")
	}
	if err := os.MkdirAll(fs.clientDir(id), 0700); err != nil {
		return 0, err
	}
	return p, writeFile(filepath.Join(fs.clientDir(id), "port"), []byte(strconv.Itoa(p)))
}

func writeFile(path string, data []byte) error {
	tmp := path + ".next"
	if err := os.WriteFile(tmp, data, 0600); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

func (fs *Service) endpoint(id string) (string, error) {
	if fs.endpointFor != nil {
		return fs.endpointFor(id), nil
	}
	p, err := fs.port(id)
	if err != nil {
		return "", err
	}
	return "http://" + net.JoinHostPort(fs.apiHost, strconv.Itoa(p)), nil
}

func (fs *Service) request(id, method, path string, content []byte) ([]byte, error) {
	endpoint, err := fs.endpoint(id)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequest(method, endpoint+path, bytes.NewReader(content))
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

func (fs *Service) applyConfig(id string, next []byte) error {
	if fs.password == "" {
		return errors.New("FRPC_API_PASSWORD is required")
	}
	if _, err := commonConfig(next); err != nil {
		return err
	}
	dir := fs.clientDir(id)
	before, err := fs.request(id, http.MethodGet, "/api/config", nil)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(dir, 0700); err != nil {
		return err
	}
	if err := writeFile(filepath.Join(dir, "frpc.previous.json"), before); err != nil {
		return err
	}
	if _, err = fs.request(id, http.MethodPut, "/api/config", next); err != nil {
		return err
	}
	// frpc validates the entire file before updating live proxies.
	if _, err = fs.request(id, http.MethodGet, "/api/reload?strictConfig=true", nil); err != nil {
		_, restoreErr := fs.request(id, http.MethodPut, "/api/config", before)
		if restoreErr == nil {
			_, restoreErr = fs.request(id, http.MethodGet, "/api/reload?strictConfig=true", nil)
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
	// POST /api/stop exits only this frpc; the supervisor restarts it with the saved file.
	if _, err = fs.request(id, http.MethodPost, "/api/stop", nil); err != nil {
		return err
	}
	time.Sleep(500 * time.Millisecond)
	if fs.waitAPI(id, 20*time.Second) {
		return nil
	}
	// Keep a valid persistent configuration if a restart fails.
	if err := writeFile(filepath.Join(dir, "frpc.json"), before); err != nil {
		return fmt.Errorf("frpc restart failed; cannot restore previous configuration: %w", err)
	}
	return errors.New("frpc did not return after restart; previous configuration restored")
}

func (fs *Service) waitAPI(id string, d time.Duration) bool {
	deadline := time.Now().Add(d)
	for time.Now().Before(deadline) {
		if _, err := fs.request(id, http.MethodGet, "/api/status", nil); err == nil {
			return true
		}
		time.Sleep(250 * time.Millisecond)
	}
	return false
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
	port, err := fs.port(id)
	if err != nil {
		return nil, err
	}
	cfg.WebServer.Addr, cfg.WebServer.Port = fs.bindAddr, port
	cfg.WebServer.User, cfg.WebServer.Password = fs.username, fs.password
	cfg.Log.DisablePrintColor = true
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

func (fs *Service) setAutoConnection(id string, on bool) {
	rec, err := fs.app.FindRecordById("fh_servers", id)
	if err != nil || rec.GetBool("autoConnection") == on {
		return
	}
	rec.Set("autoConnection", on)
	if err := fs.app.Save(rec); err != nil {
		fs.app.Logger().Warn("cannot persist connection enabled flag", "id", id, "error", err)
	}
}

// LaunchFrpc enables the connection: the supervisor starts its own frpc process.
// Other connections are not touched.
func (fs *Service) LaunchFrpc(id *string) error {
	fs.mu.Lock()
	defer fs.mu.Unlock()
	if !validServerID.MatchString(*id) {
		return errors.New("invalid server id")
	}
	if fs.password == "" {
		return errors.New("FRPC_API_PASSWORD is required")
	}
	next, err := fs.profileConfig(*id)
	if err != nil {
		return err
	}
	if fs.IsServerRunning(*id) {
		if err := fs.applyConfig(*id, next); err != nil {
			return err
		}
	} else {
		dir := fs.clientDir(*id)
		if err := writeFile(filepath.Join(dir, "frpc.json"), next); err != nil {
			return err
		}
		if err := writeFile(filepath.Join(dir, "enabled"), nil); err != nil {
			return err
		}
		if !fs.waitAPI(*id, 20*time.Second) {
			os.Remove(filepath.Join(dir, "enabled"))
			return errors.New("frpc did not start for this connection")
		}
	}
	fs.setAutoConnection(*id, true)
	return fs.serverRepo.UpdateBootStatus(*id, serverdomain.ServerStatusRunning)
}

func (fs *Service) ReloadFrpc(id *string) error {
	fs.mu.Lock()
	defer fs.mu.Unlock()
	if !fs.IsServerRunning(*id) {
		return errors.New("profile is not active")
	}
	next, err := fs.profileConfig(*id)
	if err != nil {
		return err
	}
	return fs.applyConfig(*id, next)
}

// stop disables a connection; the supervisor ends only its process.
func (fs *Service) stop(id string) error {
	if !validServerID.MatchString(id) {
		return errors.New("invalid server id")
	}
	if err := os.Remove(filepath.Join(fs.clientDir(id), "enabled")); err != nil && !os.IsNotExist(err) {
		return err
	}
	fs.proxyRepo.UpdateBootStatusByServerID(id, proxydomain.ProxyBootStatusOffline)
	return fs.serverRepo.UpdateBootStatus(id, serverdomain.ServerStatusStopped)
}

func (fs *Service) TerminateFrpc(id *string) error {
	fs.mu.Lock()
	defer fs.mu.Unlock()
	if err := fs.stop(*id); err != nil {
		return err
	}
	fs.setAutoConnection(*id, false)
	return nil
}

// ForgetServer stops a connection that is being deleted and removes its runtime files.
func (fs *Service) ForgetServer(id string) error {
	fs.mu.Lock()
	defer fs.mu.Unlock()
	if err := fs.stop(id); err != nil {
		return err
	}
	return os.RemoveAll(fs.clientDir(id))
}

type proxyStatus struct {
	Name   string `json:"name"`
	Status string `json:"status"`
	Err    string `json:"err"`
}

// ClientStatus is the per-connection state shown in the UI.
type ClientStatus struct {
	ID         string   `json:"id"`
	State      string   `json:"state"` // running | error | stopped
	LastErrors []string `json:"lastErrors,omitempty"`
}

// probe returns the state of one enabled connection and its tunnels' statuses.
func (fs *Service) probe(id string) (serverdomain.ServerStatus, map[string][]proxyStatus) {
	data, err := fs.request(id, http.MethodGet, "/api/status", nil)
	if err != nil {
		return serverdomain.ServerStatusError, nil // enabled, but the process is down or restarting
	}
	var statuses map[string][]proxyStatus
	if json.Unmarshal(data, &statuses) != nil {
		return serverdomain.ServerStatusRunning, nil
	}
	running, listed := 0, 0
	for _, list := range statuses {
		for _, s := range list {
			listed++
			if s.Status == "running" {
				running++
			}
		}
	}
	// Until login succeeds frpc reports no proxies at all ({}), so an empty status while
	// tunnels are configured means the server is unreachable or rejected the login.
	if running == 0 && (listed > 0 || fs.hasEnabledProxies(id)) {
		return serverdomain.ServerStatusError, statuses
	}
	return serverdomain.ServerStatusRunning, statuses
}

func (fs *Service) hasEnabledProxies(id string) bool {
	proxies, err := fs.proxyRepo.FindByServerID(id)
	if err != nil {
		return false
	}
	for _, p := range proxies {
		if p.Status != string(proxydomain.ProxyStatusDisabled) {
			return true
		}
	}
	return false
}

func (fs *Service) syncStatus() {
	for _, id := range fs.enabledIDs() {
		state, statuses := fs.probe(id)
		fs.serverRepo.UpdateBootStatus(id, state)
		proxies, err := fs.proxyRepo.FindByServerID(id)
		if err != nil {
			continue
		}
		for _, p := range proxies {
			online := proxydomain.ProxyBootStatusOffline
			name := p.Name + "-" + p.Id
			for _, list := range statuses {
				for _, status := range list {
					if (status.Name == name || strings.HasSuffix(status.Name, "."+name)) && status.Status == "running" {
						online = proxydomain.ProxyBootStatusOnline
					}
				}
			}
			fs.proxyRepo.UpdateBootStatus(p.Id, online)
		}
	}
}

// Statuses reports every enabled connection with the last error lines of its own log.
func (fs *Service) Statuses() []ClientStatus {
	ids := fs.enabledIDs()
	sort.Strings(ids)
	out := make([]ClientStatus, 0, len(ids))
	for _, id := range ids {
		state, _ := fs.probe(id)
		out = append(out, ClientStatus{ID: id, State: string(state), LastErrors: fs.lastErrors(id, 5)})
	}
	return out
}

func (fs *Service) lastErrors(id string, n int) []string {
	f, err := os.Open(filepath.Join(fs.getFrpMainPath(&id), "logs", "frpc.log"))
	if err != nil {
		return nil
	}
	defer f.Close()
	var errs []string
	for _, line := range lastLines(f) {
		if strings.Contains(line, "[E]") || strings.Contains(line, "[W]") {
			errs = append(errs, line)
		}
	}
	if len(errs) > n {
		errs = errs[len(errs)-n:]
	}
	return errs
}

// Enable connections flagged autoConnection that are not enabled yet. Returns true when nothing is left to do.
func (fs *Service) autoStartPending() bool {
	records, err := fs.serverRepo.FindAllWithAutoConnect()
	if err != nil {
		return false
	}
	done := true
	for _, r := range records {
		id := r.ID
		if fs.IsServerRunning(id) {
			continue
		}
		if err := fs.LaunchFrpc(&id); err != nil {
			fs.app.Logger().Warn("External frpc auto-start will retry", "id", id, "error", err)
			done = false
		}
	}
	return done
}

// Reconcile persisted state after a panel restart without touching healthy tunnels:
// tunnels run in their own container and keep working while the panel is down.
func (fs *Service) AutoStartServers() {
	pending := true
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	for {
		fs.syncStatus()
		if pending && fs.autoStartPending() {
			pending = false
		}
		<-ticker.C
	}
}
