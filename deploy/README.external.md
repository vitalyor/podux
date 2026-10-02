# Podux + official FRPC

One Compose project, two independently versioned containers:

- `ghcr.io/vitalyor/podux:0.2.2` — this fork's panel.
- `ghcr.io/fatedier/frpc:v0.71.0` — the unmodified official FRPC image.

The old `vitalyor/podux-frpc` package is deprecated and no longer built or used.

## First start

Generate private API credentials once, then use the packaged Compose:

```sh
umask 077
printf 'FRPC_API_USER=podux\nFRPC_API_PASSWORD=%s\n' "$(openssl rand -hex 32)" > deploy/.env.external.local
docker compose -f deploy/docker-compose.yml up -d
```

Open http://127.0.0.1:17402/. Keep the credential file and shared named volume. Never publish port 7400. The panel creates an initial private config atomically; the official client waits for it. Existing runtime configuration is never replaced by bootstrap. Stopping the panel leaves tunnels running. Only one saved connection profile is active at a time.

## Update the official client independently

Change only `FRP_VERSION` in the project Compose `.env` or shell:

```sh
export FRP_VERSION=NEW_FRP_VERSION
docker compose -f deploy/docker-compose.yml pull frpc
docker compose -f deploy/docker-compose.yml up -d --no-deps frpc
# Update the panel's displayed version; no panel build is required.
docker compose -f deploy/docker-compose.yml up -d --no-deps podux
```

Panel code and images are unchanged. API/config changes in a future FRP release still require compatibility verification; independent versioning does not guarantee arbitrary future compatibility. Verify client logs, panel statuses and real service requests. Back up private data and retain the previous image before updates.

The Compose command is a small startup guard: wait for persistent config, validate it, restore a valid previous copy if needed, then run the official binary. It lives in Compose, not a custom client image. No Docker socket is shared with either container. The client uses UID/GID 1000 to access the shared data.

`deploy/docker-compose.local.yaml` builds only the panel for development and uses the same official client. `.github/workflows/packages.yml` publishes only Podux for AMD64/ARM64, with `latest`, commit and `podux-v*` release tags.

For Linux host networking, configure `FRPC_API_BIND=127.0.0.1`, `FRPC_API_PORT=7401`, and `FRPC_API_URL=http://127.0.0.1:7401` consistently. Both containers need host networking. Override panel listen and both healthchecks accordingly. `127.0.0.1` tunnel targets then retain their host meaning. Never bind the client admin API to a LAN/public address in host mode.
