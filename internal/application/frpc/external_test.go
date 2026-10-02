package frpc

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func adapter(t *testing.T, initial string, reject bool) (*Service, *string, *int) {
	t.Helper()
	content := initial
	stops := 0
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user, pass, ok := r.BasicAuth()
		if !ok || user != "podux" || pass != "secret" {
			w.WriteHeader(401)
			return
		}
		switch r.URL.Path {
		case "/api/config":
			if r.Method == http.MethodGet {
				w.Write([]byte(content))
				return
			}
			var config map[string]any
			if err := json.NewDecoder(r.Body).Decode(&config); err != nil {
				w.WriteHeader(400)
				return
			}
			body, _ := json.Marshal(config)
			content = string(body)
		case "/api/reload":
			if reject && strings.Contains(content, "invalid") {
				w.WriteHeader(400)
				w.Write([]byte("secret token detail"))
			}
		case "/api/stop":
			stops++
		case "/api/status":
			w.Write([]byte(`{}`))
		default:
			w.WriteHeader(404)
		}
	}))
	t.Cleanup(api.Close)
	fs := &Service{client: api.Client(), endpoint: api.URL, username: "podux", password: "secret", runtimeDir: t.TempDir()}
	return fs, &content, &stops
}

func TestProxyUpdateDoesNotRestartClient(t *testing.T) {
	fs, content, stops := adapter(t, `{"serverAddr":"example.com","proxies":[]}`, false)
	err := fs.applyConfig([]byte(`{"serverAddr":"example.com","proxies":[{"name":"web"}]}`))
	if err != nil {
		t.Fatal(err)
	}
	if *stops != 0 {
		t.Fatal("proxy-only update restarted client")
	}
	if !strings.Contains(*content, "web") {
		t.Fatal("configuration not saved")
	}
}

func TestConnectionChangeRestartsOnlyExternalClient(t *testing.T) {
	fs, _, stops := adapter(t, `{"user":"old","proxies":[]}`, false)
	if err := fs.applyConfig([]byte(`{"user":"new","proxies":[]}`)); err != nil {
		t.Fatal(err)
	}
	if *stops != 1 {
		t.Fatalf("expected one client restart, got %d", *stops)
	}
}

func TestRejectedConfigRollsBackAndDoesNotExposeSecret(t *testing.T) {
	before := `{"user":"home","proxies":[]}`
	fs, content, stops := adapter(t, before, true)
	err := fs.applyConfig([]byte(`{"user":"home","proxies":[{"name":"invalid"}]}`))
	if err == nil {
		t.Fatal("accepted invalid config")
	}
	if strings.Contains(err.Error(), "secret") {
		t.Fatal("secret exposed in error")
	}
	a, _ := commonConfig([]byte(*content))
	b, _ := commonConfig([]byte(before))
	if string(a) != string(b) || strings.Contains(*content, "invalid") {
		t.Fatal("rollback failed")
	}
	if *stops != 0 {
		t.Fatal("failed update restarted client")
	}
	backup, err := os.ReadFile(filepath.Join(fs.runtimeDir, "frpc.previous.json"))
	if err != nil || string(backup) != before {
		t.Fatal("last working config not backed up")
	}
}

func TestActiveProfileSurvivesPanelRecreation(t *testing.T) {
	fs, _, _ := adapter(t, `{}`, false)
	id := "abcdefghijklmno"
	if err := fs.writeActive(id); err != nil {
		t.Fatal(err)
	}
	other := &Service{runtimeDir: fs.runtimeDir}
	if !other.IsServerRunning(id) {
		t.Fatal("lost persisted active profile")
	}
	if err := other.writeActive(""); err != nil {
		t.Fatal(err)
	}
	if fs.IsServerRunning(id) {
		t.Fatal("stopped profile still active")
	}
}
