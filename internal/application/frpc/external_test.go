package frpc

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
	proxydomain "podux/internal/domain/proxy"
	serverdomain "podux/internal/domain/server"
	"podux/internal/infrastructure/persistence"
	_ "podux/migrations"
)

// fakeFrpc imitates one frpc admin API.
type fakeFrpc struct {
	content string
	stops   int
}

func newFake(t *testing.T, initial string, reject bool) (*fakeFrpc, string) {
	t.Helper()
	f := &fakeFrpc{content: initial}
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user, pass, ok := r.BasicAuth()
		if !ok || user != "podux" || pass != "secret" {
			w.WriteHeader(401)
			return
		}
		switch r.URL.Path {
		case "/api/config":
			if r.Method == http.MethodGet {
				w.Write([]byte(f.content))
				return
			}
			var config map[string]any
			if err := json.NewDecoder(r.Body).Decode(&config); err != nil {
				w.WriteHeader(400)
				return
			}
			body, _ := json.Marshal(config)
			f.content = string(body)
		case "/api/reload":
			if reject && strings.Contains(f.content, "invalid") {
				w.WriteHeader(400)
				w.Write([]byte("secret token detail"))
			}
		case "/api/stop":
			f.stops++
		case "/api/status":
			w.Write([]byte(`{}`))
		default:
			w.WriteHeader(404)
		}
	}))
	t.Cleanup(api.Close)
	return f, api.URL
}

// service wires fake admin APIs by connection id.
func service(t *testing.T, apis map[string]string) *Service {
	return &Service{client: http.DefaultClient, username: "podux", password: "secret", runtimeDir: t.TempDir(), basePort: 7401, apiHost: "127.0.0.1", bindAddr: "127.0.0.1",
		endpointFor: func(id string) string { return apis[id] }}
}

const idA, idB = "aaaaaaaaaaaaaaa", "bbbbbbbbbbbbbbb"

func TestProxyUpdateDoesNotRestartClient(t *testing.T) {
	f, url := newFake(t, `{"serverAddr":"example.com","proxies":[]}`, false)
	fs := service(t, map[string]string{idA: url})
	if err := fs.applyConfig(idA, []byte(`{"serverAddr":"example.com","proxies":[{"name":"web"}]}`)); err != nil {
		t.Fatal(err)
	}
	if f.stops != 0 || !strings.Contains(f.content, "web") {
		t.Fatalf("stops=%d content=%s", f.stops, f.content)
	}
}

func TestConnectionChangeRestartsOnlyThatClient(t *testing.T) {
	a, urlA := newFake(t, `{"user":"old","proxies":[]}`, false)
	b, urlB := newFake(t, `{"user":"b","proxies":[]}`, false)
	fs := service(t, map[string]string{idA: urlA, idB: urlB})
	if err := fs.applyConfig(idA, []byte(`{"user":"new","proxies":[]}`)); err != nil {
		t.Fatal(err)
	}
	if a.stops != 1 || b.stops != 0 {
		t.Fatalf("restarts a=%d b=%d", a.stops, b.stops)
	}
}

func TestRejectedConfigRollsBackAndDoesNotAffectOthers(t *testing.T) {
	before := `{"user":"home","proxies":[]}`
	a, urlA := newFake(t, before, true)
	b, urlB := newFake(t, `{"user":"b","proxies":[]}`, true)
	fs := service(t, map[string]string{idA: urlA, idB: urlB})
	err := fs.applyConfig(idA, []byte(`{"user":"home","proxies":[{"name":"invalid"}]}`))
	if err == nil || strings.Contains(err.Error(), "secret") {
		t.Fatalf("want an error without secrets, got %v", err)
	}
	x, _ := commonConfig([]byte(a.content))
	y, _ := commonConfig([]byte(before))
	if string(x) != string(y) || strings.Contains(a.content, "invalid") || a.stops != 0 || b.stops != 0 {
		t.Fatal("rollback failed or touched another client")
	}
	backup, err := os.ReadFile(filepath.Join(fs.clientDir(idA), "frpc.previous.json"))
	if err != nil || string(backup) != before {
		t.Fatal("last working config not backed up in the connection's own directory")
	}
	if _, err := os.Stat(filepath.Join(fs.clientDir(idB), "frpc.previous.json")); err == nil {
		t.Fatal("other connection's files touched")
	}
}

func TestAdminPortsStableAndDistinct(t *testing.T) {
	fs := service(t, nil)
	a, _ := fs.port(idA)
	b, _ := fs.port(idB)
	a2, _ := fs.port(idA)
	if a != 7401 || b != 7402 || a2 != a {
		t.Fatalf("ports a=%d b=%d a again=%d", a, b, a2)
	}
	info, _ := os.Stat(filepath.Join(fs.clientDir(idA), "port"))
	if info.Mode().Perm() != 0600 {
		t.Fatal("port file is not private")
	}
}

type memServers struct {
	serverdomain.Repository
	status map[string]serverdomain.ServerStatus
}

func (m *memServers) UpdateBootStatus(id string, s serverdomain.ServerStatus) error {
	m.status[id] = s
	return nil
}

type memProxies struct{ proxydomain.Repository }

func (memProxies) UpdateBootStatusByServerID(string, proxydomain.ProxyBootStatus) error { return nil }

func TestEnabledIsPerConnection(t *testing.T) {
	fs := service(t, nil)
	srv := &memServers{status: map[string]serverdomain.ServerStatus{}}
	fs.serverRepo, fs.proxyRepo = srv, memProxies{}
	for _, id := range []string{idA, idB} {
		os.MkdirAll(fs.clientDir(id), 0700)
		os.WriteFile(filepath.Join(fs.clientDir(id), "enabled"), nil, 0600)
	}
	if err := fs.stop(idA); err != nil {
		t.Fatal(err)
	}
	if fs.IsServerRunning(idA) || !fs.IsServerRunning(idB) {
		t.Fatal("stopping one connection must not stop the other")
	}
	if srv.status[idA] != serverdomain.ServerStatusStopped {
		t.Fatal("status not updated")
	}
	other := &Service{runtimeDir: fs.runtimeDir} // panel recreated
	if !other.IsServerRunning(idB) {
		t.Fatal("enabled state lost with the panel")
	}
}

func TestLegacyFilesMigrateAndMigrationIsIdempotent(t *testing.T) {
	fs := service(t, nil)
	legacy := `{"serverAddr":"bg","webServer":{"addr":"127.0.0.1","port":7401},"proxies":[{"name":"speed"}]}`
	os.MkdirAll(fs.runtimeDir, 0700)
	os.WriteFile(filepath.Join(fs.runtimeDir, "frpc.json"), []byte(legacy), 0600)
	os.WriteFile(filepath.Join(fs.runtimeDir, "frpc.previous.json"), []byte(`{"prev":1}`), 0600)
	for i := 0; i < 2; i++ {
		tmp := t.TempDir()
		if err := fs.migrateFiles(idA, tmp); err != nil {
			t.Fatal(err)
		}
		dir := filepath.Join(tmp, idA)
		got, _ := os.ReadFile(filepath.Join(dir, "frpc.json"))
		prev, _ := os.ReadFile(filepath.Join(dir, "frpc.previous.json"))
		port, _ := os.ReadFile(filepath.Join(dir, "port"))
		if string(got) != legacy || string(prev) != `{"prev":1}` || string(port) != "7401" {
			t.Fatalf("round %d: %s %s %s", i, got, prev, port)
		}
		if _, err := os.Stat(filepath.Join(dir, "enabled")); err != nil {
			t.Fatal("migrated connection not enabled")
		}
	}
	if _, err := os.Stat(filepath.Join(fs.runtimeDir, "frpc.json")); err != nil {
		t.Fatal("legacy file must stay for rollback to 0.2.2")
	}
	// Once runtime/clients exists, the layout is left alone.
	os.MkdirAll(fs.clientsDir(), 0700)
	if err := fs.EnsureRuntimeLayout(); err != nil {
		t.Fatal(err)
	}
}

// newApp returns a PocketBase app with the real collections and two connections.
func newApp(t *testing.T) (*Service, core.App, *core.Record, *core.Record) {
	t.Helper()
	t.Chdir(t.TempDir()) // the service writes pb_data/... relative to the working directory
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(app.Cleanup)
	servers, _ := app.FindCollectionByNameOrId("fh_servers")
	mk := func(name, addr string, port int) *core.Record {
		r := core.NewRecord(servers)
		r.Set("serverName", name)
		r.Set("serverAddr", addr)
		r.Set("serverPort", port)
		r.Set("serverVersion", "x")
		r.Set("bootStatus", "stopped")
		r.Set("auth", `{"method":"token","token":"tok-`+name+`"}`)
		r.Set("transport", `{"tls":{"enable":true}}`)
		r.Set("metadatas", `{}`)
		r.Set("log", `{"level":"info","maxDays":3}`)
		if err := app.Save(r); err != nil {
			t.Fatal(err)
		}
		return r
	}
	bg, us := mk("bg", "bg.example.com", 17000), mk("us", "us.example.com", 7000)
	fs := &Service{app: app, client: http.DefaultClient, username: "podux", password: "secret",
		runtimeDir: filepath.Join("pb_data", "runtime"), basePort: 7401, apiHost: "127.0.0.1", bindAddr: "127.0.0.1"}
	return fs, app, bg, us
}

func addProxy(t *testing.T, app core.App, serverID, name string, remote int) {
	t.Helper()
	col, _ := app.FindCollectionByNameOrId("fh_proxies")
	r := core.NewRecord(col)
	r.Set("serverId", serverID)
	r.Set("name", name)
	r.Set("proxyType", "tcp")
	r.Set("localIP", "127.0.0.1")
	r.Set("localPort", 8080)
	r.Set("remotePort", remote)
	r.Set("status", "enabled")
	r.Set("bootStatus", "offline")
	r.Set("transport", `{}`)
	if err := app.Save(r); err != nil {
		t.Fatal(err)
	}
}

func TestConfigsAreGeneratedPerConnection(t *testing.T) {
	fs, app, bg, us := newApp(t)
	fs.proxyRepo = persistence.NewProxyRepository(app)
	addProxy(t, app, bg.Id, "speed", 3004)
	addProxy(t, app, bg.Id, "mcp-old", 12008)
	addProxy(t, app, us.Id, "mcp", 12008) // same remote port on another server is fine
	cfgA, err := fs.profileConfig(bg.Id)
	if err != nil {
		t.Fatal(err)
	}
	cfgB, err := fs.profileConfig(us.Id)
	if err != nil {
		t.Fatal(err)
	}
	var a, b struct {
		ServerAddr string `json:"serverAddr"`
		WebServer  struct {
			Addr string `json:"addr"`
			Port int    `json:"port"`
		} `json:"webServer"`
		Proxies []struct{ Name string } `json:"proxies"`
	}
	json.Unmarshal(cfgA, &a)
	json.Unmarshal(cfgB, &b)
	if a.ServerAddr != "bg.example.com" || b.ServerAddr != "us.example.com" {
		t.Fatalf("wrong servers: %s %s", a.ServerAddr, b.ServerAddr)
	}
	if len(a.Proxies) != 2 || len(b.Proxies) != 1 || !strings.HasPrefix(b.Proxies[0].Name, "mcp-") {
		t.Fatalf("proxies leaked between connections: %+v %+v", a.Proxies, b.Proxies)
	}
	if a.WebServer.Addr != "127.0.0.1" || b.WebServer.Addr != "127.0.0.1" || a.WebServer.Port == b.WebServer.Port {
		t.Fatalf("admin API must be local and distinct: %+v %+v", a.WebServer, b.WebServer)
	}
}

func TestLayoutMigrationFillsEmptyServerAndEnablesActive(t *testing.T) {
	fs, app, bg, _ := newApp(t)
	os.MkdirAll(fs.runtimeDir, 0700)
	os.WriteFile(filepath.Join(fs.runtimeDir, "active-server"), []byte(bg.Id), 0600)
	os.WriteFile(filepath.Join(fs.runtimeDir, "frpc.json"), []byte(`{"serverAddr":"bg","webServer":{"port":7401}}`), 0600)
	for i := 0; i < 2; i++ { // second run must change nothing
		if err := fs.EnsureRuntimeLayout(); err != nil {
			t.Fatal(err)
		}
	}
	if !fs.IsServerRunning(bg.Id) {
		t.Fatal("active server not enabled")
	}
	rec, _ := app.FindRecordById("fh_servers", bg.Id)
	if !rec.GetBool("autoConnection") {
		t.Fatal("enabled flag not stored on the connection")
	}
	if _, err := os.Stat(fs.clientsDir() + ".tmp"); err == nil {
		t.Fatal("temporary directory left behind")
	}
}

// frpc answers {} until it logs in; with tunnels configured that is an unreachable server.
func TestEmptyStatusWithTunnelsIsError(t *testing.T) {
	fs, app, bg, us := newApp(t)
	fs.proxyRepo = persistence.NewProxyRepository(app)
	_, api := newFake(t, `{}`, false)
	fs.endpointFor = func(string) string { return api }
	addProxy(t, app, us.Id, "mcp", 12008)
	if s, _ := fs.probe(us.Id); s != serverdomain.ServerStatusError {
		t.Fatalf("connection with tunnels and no login: %s, want error", s)
	}
	if s, _ := fs.probe(bg.Id); s != serverdomain.ServerStatusRunning {
		t.Fatalf("connection without tunnels: %s, want running", s)
	}
}
