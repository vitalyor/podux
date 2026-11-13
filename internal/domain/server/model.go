package server

type ServerStatus string

const (
	ServerStatusRunning ServerStatus = "running"
	ServerStatusStopped ServerStatus = "stopped"
	// ServerStatusError: the client process is enabled but its tunnels cannot work (server unreachable, login failed).
	ServerStatusError ServerStatus = "error"
)

// ServerRecord is a lightweight struct for DB scanning operations.
type ServerRecord struct {
	ID         string `db:"id"`
	ServerName string `db:"serverName"`
}
