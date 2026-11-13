#!/bin/sh
# Обновление и откат podux на лабе одной командой (под root):
#   sh upgrade.sh 0.3.0              бэкап, новый compose и супервизор из тега podux-v0.3.0, запуск
#   sh upgrade.sh rollback <архив>   вернуть данные и compose из архива, сделанного при обновлении
# Бэкап делает /opt/podux/backup.py (SQLite копируется через .backup, панель не останавливается).
set -eu
REPO=https://raw.githubusercontent.com/vitalyor/podux
COMPOSE=/var/lib/casaos/apps/podux/docker-compose.yml
DATA=/DATA/AppData/podux/data
BACKUPS=/root/podux-backups
dc() { docker compose -p podux -f "$COMPOSE" "$@"; }

if [ "${1:-}" = rollback ]; then
  ARCHIVE=${2:?укажите архив: $BACKUPS/pre-*.tar.gz}
  dc down
  mv "$DATA" "$DATA.failed-$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$DATA" && tar -xzf "$ARCHIVE" -C "$DATA" --exclude='deployment/*'
  rmdir "$DATA/deployment" 2>/dev/null || true
  chown -R 1000:1000 "$DATA"
  tar -xzf "$ARCHIVE" -O deployment/compose.yaml >"$COMPOSE"
  cp "$COMPOSE" /opt/podux/compose.yaml
  dc up -d --wait --wait-timeout 150
  echo "Откат выполнен. Неудачные данные сохранены рядом: $DATA.failed-*"
  exit 0
fi

VERSION=${1:?укажите версию, например: sh upgrade.sh 0.3.0}
TAG=podux-v$VERSION
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT

# Сначала скачиваем всё: если тега нет, ничего не меняется.
curl -fsSL -o "$TMP/compose.yml" "$REPO/$TAG/deploy/docker-compose.casaos.yml"
curl -fsSL -o "$TMP/frpc-supervisor.sh" "$REPO/$TAG/deploy/frpc-supervisor.sh"
grep -q "podux:$VERSION" "$TMP/compose.yml" || { echo "compose из $TAG не ссылается на podux:$VERSION" >&2; exit 1; }

/usr/bin/python3 /opt/podux/backup.py
LAST=$(ls -t "$BACKUPS"/*.tgz | head -1)
# .tar.gz: backup.py чистит только *.tgz, этот архив он не удалит.
SAVED=$BACKUPS/pre-$VERSION-$(date +%Y%m%d-%H%M%S).tar.gz
cp -p "$LAST" "$SAVED"

install -m 0644 "$TMP/frpc-supervisor.sh" /opt/podux/frpc-supervisor.sh
install -m 0600 "$TMP/compose.yml" "$COMPOSE"
cp "$COMPOSE" /opt/podux/compose.yaml
dc pull
dc up -d --wait --wait-timeout 150

echo
docker inspect -f '{{.Name}} {{.State.Health.Status}}' podux podux-frpc
for u in https://speed.nolim.cloud/ https://casa.nolim.cloud/ https://mcp.nolim.cloud/mcp/remnawave; do
  printf '%s %s\n' "$(curl -s -m 10 -o /dev/null -w '%{http_code}' "$u")" "$u"
done
echo "Ожидается: 200, 302, 401. Откат: sh $0 rollback $SAVED"
