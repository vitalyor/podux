package frpc

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/pocketbase/dbx"
)

// EnsureRuntimeLayout upgrades a 0.2.x installation (one runtime/frpc.json + active-server)
// to runtime/clients/<id>/. It is idempotent and keeps the legacy files, so rolling back to
// 0.2.2 with the data backup still works. The tree is built aside and renamed into place,
// so the supervisor never sees a half-migrated state.
func (fs *Service) EnsureRuntimeLayout() error {
	if _, err := os.Stat(fs.clientsDir()); err == nil {
		return nil
	} else if !os.IsNotExist(err) {
		return err
	}
	if err := os.MkdirAll(fs.runtimeDir, 0700); err != nil {
		return err
	}
	legacyID := fs.legacyActiveID()
	target := legacyID
	if target == "" {
		target = fs.onlyServerID()
	}
	// DB first: re-running after a crash repeats this harmlessly.
	if target != "" {
		if _, err := fs.app.DB().NewQuery("UPDATE fh_proxies SET serverId = {:id} WHERE serverId = '' OR serverId IS NULL").
			Bind(dbx.Params{"id": target}).Execute(); err != nil {
			return err
		}
	}
	tmp := fs.clientsDir() + ".tmp"
	if err := os.RemoveAll(tmp); err != nil {
		return err
	}
	if err := os.MkdirAll(tmp, 0700); err != nil {
		return err
	}
	if legacyID != "" {
		if err := fs.migrateFiles(legacyID, tmp); err != nil {
			return err
		}
	}
	if err := os.Rename(tmp, fs.clientsDir()); err != nil {
		return err
	}
	if legacyID != "" {
		fs.setAutoConnection(legacyID, true)
	}
	return nil
}

func (fs *Service) legacyActiveID() string {
	data, _ := os.ReadFile(filepath.Join(fs.runtimeDir, "active-server"))
	id := strings.TrimSpace(string(data))
	if !validServerID.MatchString(id) {
		return ""
	}
	if _, err := fs.app.FindRecordById("fh_servers", id); err != nil {
		return ""
	}
	return id
}

func (fs *Service) onlyServerID() string {
	records, err := fs.app.FindAllRecords("fh_servers")
	if err != nil || len(records) != 1 {
		return ""
	}
	return records[0].Id
}

// migrateFiles copies the legacy config of the active connection into <clients>/<id>/ and enables it.
func (fs *Service) migrateFiles(id, clients string) error {
	cfg, err := os.ReadFile(filepath.Join(fs.runtimeDir, "frpc.json"))
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	var parsed struct {
		WebServer struct {
			Port int `json:"port"`
		} `json:"webServer"`
	}
	if err := json.Unmarshal(cfg, &parsed); err != nil {
		return errors.New("legacy frpc.json is not valid JSON")
	}
	port := parsed.WebServer.Port
	if port <= 0 {
		port = fs.basePort
	}
	dir := filepath.Join(clients, id)
	if err := os.MkdirAll(dir, 0700); err != nil {
		return err
	}
	if err := os.WriteFile(filepath.Join(dir, "frpc.json"), cfg, 0600); err != nil {
		return err
	}
	if prev, err := os.ReadFile(filepath.Join(fs.runtimeDir, "frpc.previous.json")); err == nil {
		if err := os.WriteFile(filepath.Join(dir, "frpc.previous.json"), prev, 0600); err != nil {
			return err
		}
	}
	if err := os.WriteFile(filepath.Join(dir, "port"), []byte(strconv.Itoa(port)), 0600); err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(dir, "enabled"), nil, 0600)
}
