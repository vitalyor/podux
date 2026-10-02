# Podux + external FRPC

One Compose project, two independently built containers. Existing panel accounts and profiles stay in `podux-local_podux-data`. One connection profile can run at a time; its tunnels are configured through the panel.

## First start

From the repository root:

```sh
umask 077
printf 'FRPC_API_USER=podux\nFRPC_API_PASSWORD=%s\n' "$(openssl rand -hex 32)" > deploy/.env.external.local
docker compose -f deploy/docker-compose.local.yaml up -d --build
```

Open http://127.0.0.1:17402/. Keep the generated credential file: recreating it does not rotate credentials in an existing runtime JSON. Never commit it or publish FRPC port 7400. The existing panel volume is preserved. Docker socket access is unnecessary.

## Upgrade FRPC without rebuilding Podux

The default binary is official FRP 0.71.0, downloaded with SHA-256 verification (ARM64 and AMD64). For another release, obtain its Linux archive checksum from the official release and use the checksum for your host architecture:

```sh
export FRP_VERSION=YOUR_VERSION
export FRP_SHA256=OFFICIAL_ARCHIVE_SHA256
docker compose -f deploy/docker-compose.local.yaml build frpc
docker compose -f deploy/docker-compose.local.yaml up -d --no-deps frpc
# Refresh the panel's configured version label; this does not rebuild it.
docker compose -f deploy/docker-compose.local.yaml up -d --no-deps podux
```

Keep version variables in the shell for both commands, or persist them in the project Compose `.env`. Client recreation briefly interrupts tunnels. Verify `docker exec podux-frpc frpc --version`, panel proxy status and a real request. New configuration fields or changed API contracts still need panel compatibility work. The panel uses older FRP configuration types, but runs no embedded FRP client.

## Backup and rollback

Back up the complete named volume (database, runtime config, certificates and logs) with the panel stopped. Keep backups private: they contain credentials. Retain previous images and the Compose/environment files. To roll back a runtime upgrade, recreate only FRPC with the previous version/image and verify its tunnels. Do not delete the data volume.

Strict configuration reload saves `pb_data/runtime/frpc.previous.json` and restores it on validation failure. The saved panel record remains edited; correct it before reapplying. Restart-time rollback restores the file but cannot forcibly restart an unhealthy process without an operator. Server start/stop controls park or reconnect the external client; stopping the panel leaves working tunnels running.

This Compose is a local test deployment. Docker service names resolve inside its network; `127.0.0.1` in a tunnel target refers to the FRPC container. LAN services should use their LAN address. It is not yet connected to the production homelab FRPC.

## Prebuilt GitHub Packages

The fork publishes two images for Linux AMD64 and ARM64:

- `ghcr.io/vitalyor/podux:0.2.0`
- `ghcr.io/vitalyor/podux-frpc:0.71.0-podux.0.2.0`

The second tag contains the FRP binary version and the Podux integration release. These can be upgraded independently. Both packages also provide `latest` and `sha-<full commit>` tags. Production deployments should pin a release or digest.

Generate `deploy/.env.external.local` as described above, then run:

```sh
docker compose -f deploy/docker-compose.yml pull
docker compose -f deploy/docker-compose.yml up -d
```

The packaged Compose uses the same `podux-local` project and data volume as the local build. Stop the local build before switching; do not delete its volume. The panel stays bound to localhost port 17402; FRPC's administration port is private. On Linux, add an explicitly chosen LAN binding only when remote access is intended.

Override image tags with `PODUX_VERSION` and `FRPC_IMAGE_VERSION`. Keep `FRP_VERSION` equal to the binary version to display the correct client label. `deploy/docker-compose.local.yaml` remains available for development builds.

Publishing is defined in `.github/workflows/packages.yml`: pushes to `main` update `latest` and commit tags; a `podux-v0.2.0` Git tag publishes the two release tags above. Package visibility must be Public for unauthenticated pulls. No local credential file or runtime data is included in the build context.

For Linux host networking, configure `FRPC_API_BIND=127.0.0.1`, `FRPC_API_PORT=7401`, and `FRPC_API_URL=http://127.0.0.1:7401` consistently. Use host networking for both containers. Override the panel listen command and healthcheck to the chosen LAN address/port. Never bind the client admin API to a LAN/public address in host mode. The entrypoint restores a verified previous runtime config if the current file is invalid; it exits if neither is valid.
