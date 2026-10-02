package frpc

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"time"

	v1 "github.com/fatedier/frp/pkg/config/v1"
	"podux/pkg/utils"
)

var validServerID = regexp.MustCompile(`^[a-z0-9]{15}$`)

func (fs *Service) genCommonCfgs(id *string) (*v1.ClientCommonConfig, error) {
	if !validServerID.MatchString(*id) {
		return nil, errors.New("invalid server id")
	}
	cfg := &v1.ClientCommonConfig{}

	record, err := fs.app.FindRecordById("fh_servers", *id)
	if err != nil {
		return nil, err
	}
	// basic config
	cfg.ServerAddr = record.GetString("serverAddr")
	cfg.ServerPort = record.GetInt("serverPort")
	cfg.User = record.GetString("user")

	logDirPath := filepath.Join("pb_data", "frpc", *id)
	if err := os.MkdirAll(logDirPath, 0755); err != nil {
		return nil, err
	}

	// log config
	logStr := record.GetString("log")
	mainPath := fs.getFrpMainPath(id)
	var logConfig v1.LogConfig
	err = json.Unmarshal([]byte(logStr), &logConfig)
	if err != nil {
		return nil, err
	}
	logPath := filepath.Join(mainPath, "logs", "frpc.log")
	logConfig.To = logPath
	cfg.Log = logConfig
	if err := os.MkdirAll(filepath.Dir(logPath), 0700); err != nil {
		return nil, err
	}

	// auth config
	authStr := record.GetString("auth")
	var authConfig v1.AuthClientConfig
	err = json.Unmarshal([]byte(authStr), &authConfig)
	if err != nil {
		return nil, err
	}
	if authConfig.Method != "none" && authConfig.Method != "" {
		cfg.Auth = authConfig
	}

	// transport config
	transportStr := record.GetString("transport")
	var transportConfig v1.ClientTransportConfig
	err = json.Unmarshal([]byte(transportStr), &transportConfig)
	if err != nil {
		return nil, err
	}
	cfg.Transport = transportConfig
	if cfg.Transport.TLS.Enable == nil || *cfg.Transport.TLS.Enable {
		certsDir := filepath.Join(mainPath, "certs")
		hasCert := cfg.Transport.TLS.CertFile != "" && cfg.Transport.TLS.KeyFile != ""
		hasCa := cfg.Transport.TLS.TrustedCaFile != ""

		if hasCert || hasCa {
			if err := os.MkdirAll(certsDir, 0700); err != nil {
				return nil, err
			}
		}
		if hasCert {
			tlsCertFile := filepath.Join(certsDir, "cert.pem")
			tlsKeyFile := filepath.Join(certsDir, "key.pem")
			if err := os.WriteFile(tlsCertFile, []byte(cfg.Transport.TLS.CertFile), 0644); err != nil {
				return nil, err
			}
			if err := os.WriteFile(tlsKeyFile, []byte(cfg.Transport.TLS.KeyFile), 0600); err != nil {
				return nil, err
			}
			cfg.Transport.TLS.CertFile = tlsCertFile
			cfg.Transport.TLS.KeyFile = tlsKeyFile
		} else {
			cfg.Transport.TLS.CertFile = ""
			cfg.Transport.TLS.KeyFile = ""
		}
		if hasCa {
			tlsTrustedCaFile := filepath.Join(certsDir, "ca.pem")
			if err := os.WriteFile(tlsTrustedCaFile, []byte(cfg.Transport.TLS.TrustedCaFile), 0644); err != nil {
				return nil, err
			}
			cfg.Transport.TLS.TrustedCaFile = tlsTrustedCaFile
		} else {
			cfg.Transport.TLS.TrustedCaFile = ""
		}
	}

	// metadata config
	metadataStr := record.GetString("metadatas")
	var metadataConfig map[string]string
	err = json.Unmarshal([]byte(metadataStr), &metadataConfig)
	if err != nil {
		return nil, err
	}
	cfg.Metadatas = metadataConfig
	return cfg, nil
}

func (fs *Service) genProxyCfgs(serverId *string) ([]v1.ProxyConfigurer, error) {
	proxies, err := fs.proxyRepo.FindEnabledByServerID(*serverId)
	if err != nil {
		fs.app.Logger().Error("genProxyCfgs", "err", err)
		return nil, err
	}

	var proxyCfgs []v1.ProxyConfigurer
	for _, proxyMap := range proxies {
		jsonData, err := json.Marshal(proxyMap)
		if err != nil {
			return nil, err
		}

		// Convert to map to manipulate fields
		var proxyData map[string]interface{}
		if err := json.Unmarshal(jsonData, &proxyData); err != nil {
			return nil, err
		}

		if proxyMap.ProxyType == "http" || proxyMap.ProxyType == "https" {
			delete(proxyData, "remotePort")
		}
		proxyData["type"] = proxyMap.ProxyType
		delete(proxyData, "proxyType")
		proxyData["name"] = proxyMap.Name + "-" + proxyMap.Id

		// Remove empty plugin map so frp doesn't try to parse a typeless plugin
		if plugin, ok := proxyData["plugin"].(map[string]interface{}); ok {
			if _, hasType := plugin["type"]; !hasType {
				delete(proxyData, "plugin")
			}
		}

		jsonData, err = json.Marshal(proxyData)
		if err != nil {
			return nil, err
		}

		switch proxyMap.ProxyType {
		case "tcp":
			var tcpProxy v1.TCPProxyConfig
			if err := json.Unmarshal(jsonData, &tcpProxy); err != nil {
				return nil, err
			}
			proxyCfgs = append(proxyCfgs, &tcpProxy)
		case "udp":
			var udpProxy v1.UDPProxyConfig
			if err := json.Unmarshal(jsonData, &udpProxy); err != nil {
				return nil, err
			}
			proxyCfgs = append(proxyCfgs, &udpProxy)
		case "http":
			var httpProxy v1.HTTPProxyConfig
			if err := json.Unmarshal(jsonData, &httpProxy); err != nil {
				return nil, err
			}
			proxyCfgs = append(proxyCfgs, &httpProxy)
		case "https":
			var httpsProxy v1.HTTPSProxyConfig
			if err := json.Unmarshal(jsonData, &httpsProxy); err != nil {
				return nil, err
			}
			proxyCfgs = append(proxyCfgs, &httpsProxy)
		default:
			return nil, fmt.Errorf("unsupported proxy type: %s", proxyMap.ProxyType)
		}
	}

	return proxyCfgs, nil
}

func (fs *Service) getFrpMainPath(id *string) string {
	return filepath.Join("pb_data", "frpc", *id)
}

// StreamLog streams the frpc log file via SSE.
// It sends the last 50 lines as initial content, then tails new lines every 500ms.
func (fs *Service) StreamLog(serverId string, ctx context.Context, w http.ResponseWriter, flusher http.Flusher) {
	if !validServerID.MatchString(serverId) {
		fmt.Fprintf(w, "data: [invalid server id]\n\n")
		flusher.Flush()
		return
	}
	mainPath := fs.getFrpMainPath(&serverId)
	logPath := filepath.Join(mainPath, "logs", "frpc.log")

	file, err := os.Open(logPath)
	if err != nil {
		fs.app.Logger().Warn("Log file not found", "serverId", serverId, "path", logPath, "error", err)
		fmt.Fprintf(w, "data: [No log file found]\n\n")
		flusher.Flush()
		return
	}
	defer file.Close()

	initialLines := utils.ReadLastNLines(file, 50)
	fs.app.Logger().Info("Streaming log file", "serverId", serverId, "initialLines", len(initialLines))
	for _, line := range initialLines {
		fmt.Fprintf(w, "data: %s\n\n", line)
	}
	flusher.Flush()

	offset, err := file.Seek(0, io.SeekEnd)
	if err != nil {
		return
	}

	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			fi, err := os.Stat(logPath)
			if err != nil {
				continue
			}

			if fi.Size() < offset {
				file.Close()
				file, err = os.Open(logPath)
				if err != nil {
					continue
				}
				offset = 0
			}

			file.Seek(offset, io.SeekStart)
			scanner := bufio.NewScanner(file)
			hasData := false
			for scanner.Scan() {
				line := scanner.Text()
				if line != "" {
					fmt.Fprintf(w, "data: %s\n\n", line)
					hasData = true
				}
			}
			newOffset, _ := file.Seek(0, io.SeekCurrent)
			offset = newOffset

			if hasData {
				flusher.Flush()
			}
		}
	}
}
