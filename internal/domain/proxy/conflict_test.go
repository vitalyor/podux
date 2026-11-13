package proxy

import (
	"testing"

	"podux/pkg/types"
)

func port(n int) types.NullableInt { return types.NullableInt{Int: n, Valid: true} }

func TestCheckConflicts(t *testing.T) {
	base := Proxy{Id: "1", ServerId: "bg", Name: "mcp", ProxyType: "tcp", RemotePort: port(12008), Status: "enabled"}
	web := Proxy{Id: "2", ServerId: "bg", Name: "web", ProxyType: "http", Subdomain: "speed", CustomDomains: types.JSONStringArray{"a.example.com"}, Status: "enabled"}
	others := []Proxy{base, web}
	cases := []struct {
		name string
		p    Proxy
		bad  bool
	}{
		{"same name same connection", Proxy{Id: "3", ServerId: "bg", Name: "MCP", ProxyType: "tcp", RemotePort: port(1)}, true},
		{"same name other connection", Proxy{Id: "3", ServerId: "us", Name: "mcp", ProxyType: "tcp", RemotePort: port(12008)}, false},
		{"same remote port", Proxy{Id: "3", ServerId: "bg", Name: "x", ProxyType: "tcp", RemotePort: port(12008)}, true},
		{"tcp and udp may share a port", Proxy{Id: "3", ServerId: "bg", Name: "x", ProxyType: "udp", RemotePort: port(12008)}, false},
		{"disabled proxy does not collide", Proxy{Id: "3", ServerId: "bg", Name: "x", ProxyType: "tcp", RemotePort: port(12008), Status: "disabled"}, false},
		{"same subdomain", Proxy{Id: "3", ServerId: "bg", Name: "x", ProxyType: "http", Subdomain: "speed"}, true},
		{"same custom domain", Proxy{Id: "3", ServerId: "bg", Name: "x", ProxyType: "http", CustomDomains: types.JSONStringArray{"A.example.com"}}, true},
		{"edit itself", Proxy{Id: "1", ServerId: "bg", Name: "mcp", ProxyType: "tcp", RemotePort: port(12008)}, false},
		{"same local port twice is fine", Proxy{Id: "3", ServerId: "us", Name: "mcp2", ProxyType: "tcp", LocalPort: port(8080), RemotePort: port(12008)}, false},
	}
	for _, c := range cases {
		if err := CheckConflicts(c.p, others); (err != nil) != c.bad {
			t.Errorf("%s: err=%v, want conflict=%v", c.name, err, c.bad)
		}
	}
}
