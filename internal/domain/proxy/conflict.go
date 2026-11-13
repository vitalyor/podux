package proxy

import (
	"fmt"
	"strings"

	"github.com/pocketbase/pocketbase/core"
	"podux/pkg/types"
)

// CheckConflicts validates a proxy against the other proxies of the SAME connection.
// frp needs unique proxy names per client; remote ports and vhost names must not
// collide on one frps. Different connections may reuse names, ports and local ports.
// Disabled proxies never reach frps, so only enabled ones collide on ports/domains.
func CheckConflicts(p Proxy, others []Proxy) error {
	for _, o := range others {
		if o.Id == p.Id || o.ServerId != p.ServerId {
			continue
		}
		if strings.EqualFold(o.Name, p.Name) {
			return fmt.Errorf("proxy name %q is already used on this connection", p.Name)
		}
		if p.Status == string(ProxyStatusDisabled) || o.Status == string(ProxyStatusDisabled) || o.ProxyType != p.ProxyType {
			continue
		}
		switch p.ProxyType {
		case "tcp", "udp":
			if p.RemotePort.Valid && o.RemotePort.Valid && p.RemotePort.Int == o.RemotePort.Int {
				return fmt.Errorf("remote port %d is already used by proxy %q on this connection", p.RemotePort.Int, o.Name)
			}
		case "http", "https":
			if p.Subdomain != "" && p.Subdomain == o.Subdomain {
				return fmt.Errorf("subdomain %q is already used by proxy %q on this connection", p.Subdomain, o.Name)
			}
			for _, d := range p.CustomDomains {
				for _, od := range o.CustomDomains {
					if strings.EqualFold(d, od) {
						return fmt.Errorf("domain %q is already used by proxy %q on this connection", d, o.Name)
					}
				}
			}
		}
	}
	return nil
}

// FromRecord extracts the fields CheckConflicts needs from a fh_proxies record.
func FromRecord(r *core.Record) Proxy {
	p := Proxy{
		Id: r.Id, ServerId: r.GetString("serverId"), ProxyType: r.GetString("proxyType"),
		Name: r.GetString("name"), Subdomain: r.GetString("subdomain"), Status: r.GetString("status"),
	}
	if v := r.Get("remotePort"); v != nil && r.GetString("remotePort") != "" && r.GetInt("remotePort") != 0 {
		p.RemotePort = types.NullableInt{Int: r.GetInt("remotePort"), Valid: true}
	}
	var domains []string
	_ = r.UnmarshalJSONField("customDomains", &domains) // empty/absent => none
	p.CustomDomains = types.JSONStringArray(domains)
	return p
}
