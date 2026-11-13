# Обновление лабы 0.2.2 → 0.3.0 (несколько подключений FRP)

Выполнять только с согласия владельца. Туннели прерываются один раз на несколько секунд, когда пересоздаётся `podux-frpc`.

## Что меняется

- `podux-frpc` остаётся на официальном `ghcr.io/fatedier/frpc:v0.71.0`. Его entrypoint теперь `/supervisor.sh` (файл `/opt/podux/frpc-supervisor.sh`, примонтирован read-only). Супервизор запускает по одному frpc на каждое включённое подключение: `runtime/clients/<serverId>/`.
- Healthcheck `podux-frpc` проверяет, что процессы живы, а не что серверы FRP доступны. Watchdog менять не нужно: если один сервер FRP лежит, контейнер он не перезапустит.
- При первом старте podux 0.3.0 переносит `runtime/frpc.json` (и `frpc.previous.json`) в `runtime/clients/<id>/`, включает этот id и проставляет его туннелям с пустым `serverId`. Старые файлы остаются на месте. Повторный запуск ничего не меняет.

## Выкладка (на 192.168.10.210, под root)

```sh
set -eu
TS=$(date +%Y%m%d-%H%M%S); B=/root/podux-backups/pre-0.3.0-$TS; mkdir -p -m 700 "$B"

# 1. Бэкап. Панель останавливаем, чтобы SQLite (WAL) скопировался целиком; туннели при этом работают.
docker stop podux
cp -a /DATA/AppData/podux/data "$B/data"
cp -a /var/lib/casaos/apps/podux/docker-compose.yml "$B/casaos-compose.yml"
cp -a /opt/podux/compose.yaml "$B/opt-compose.yaml"

# 2. Супервизор (из тега podux-v0.3.0)
curl -fsSL -o /opt/podux/frpc-supervisor.sh \
  https://raw.githubusercontent.com/vitalyor/podux/podux-v0.3.0/deploy/frpc-supervisor.sh
chmod 0644 /opt/podux/frpc-supervisor.sh

# 3. Compose: deploy/docker-compose.casaos.yml из того же тега
curl -fsSL -o /var/lib/casaos/apps/podux/docker-compose.yml \
  https://raw.githubusercontent.com/vitalyor/podux/podux-v0.3.0/deploy/docker-compose.casaos.yml
cp /var/lib/casaos/apps/podux/docker-compose.yml /opt/podux/compose.yaml

# 4. Запуск
docker compose -p podux -f /var/lib/casaos/apps/podux/docker-compose.yml pull
docker compose -p podux -f /var/lib/casaos/apps/podux/docker-compose.yml up -d
```

## Проверка

```sh
docker logs --tail 20 podux-frpc        # "[<id>] started", без перезапусков по кругу
ls /DATA/AppData/podux/data/runtime/clients/*/   # frpc.json, port, enabled
curl -s -o /dev/null -w '%{http_code}\n' https://speed.nolim.cloud/                 # 200
curl -s -o /dev/null -w '%{http_code}\n' https://casa.nolim.cloud/                  # 302
curl -s -o /dev/null -w '%{http_code}\n' https://mcp.nolim.cloud/mcp/remnawave      # 401
docker inspect -f '{{.State.Health.Status}}' podux-frpc podux                       # healthy healthy
```

В UI на странице «Подключения» BG в состоянии «Запущено», все 10 туннелей онлайн.

## Откат

```sh
B=/root/podux-backups/pre-0.3.0-<TS>
docker compose -p podux -f /var/lib/casaos/apps/podux/docker-compose.yml down
rm -rf /DATA/AppData/podux/data && cp -a "$B/data" /DATA/AppData/podux/data
cp -a "$B/casaos-compose.yml" /var/lib/casaos/apps/podux/docker-compose.yml
cp -a "$B/opt-compose.yaml" /opt/podux/compose.yaml
docker compose -p podux -f /var/lib/casaos/apps/podux/docker-compose.yml up -d
```

`down` останавливает и туннели: при откате перерыв длится до конца `up -d`.

## Второе подключение (приёмка, п. 2)

1. «Подключения» → «Добавить подключение»: адрес и порт тестового frps, токен. TLS включён по умолчанию.
2. «Подключиться». В `runtime/clients/` появится второй каталог с портом 7402.
3. Открыть туннель `mcp`, в поле «Подключение» выбрать новый сервер и сохранить. Туннель уйдёт с BG и поднимется на втором сервере без пересоздания.

Лимит памяти `podux-frpc` 128m рассчитан примерно на четыре подключения (frpc занимает около 20–30 МБ). Если подключений станет больше, лимит нужно поднять.
