package version

import (
	"os"

	"github.com/pocketbase/pocketbase/core"
)

type Service struct {
	app core.App
}

func NewService(app core.App) *Service {
	return &Service{app: app}
}

func (s *Service) GetFrpVersion() string {
	if version := os.Getenv("FRPC_VERSION"); version != "" {
		return version
	}
	return "external"
}
