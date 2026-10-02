#!/bin/sh
set -eu
# Hex credentials are generated locally; never interpolate arbitrary JSON strings.
case "${FRPC_API_PASSWORD:-}" in ""|*[!a-zA-Z0-9]*) echo "Set an alphanumeric FRPC_API_PASSWORD" >&2; exit 1 ;; esac
case "${FRPC_API_USER:-podux}" in *[!a-zA-Z0-9_-]*) exit 1 ;; esac
addr=${FRPC_API_BIND:-0.0.0.0}
port=${FRPC_API_PORT:-7400}
case "$addr" in ""|*[!0-9.]*) echo "Use an IPv4 FRPC_API_BIND" >&2; exit 1 ;; esac
case "$port" in ""|*[!0-9]*) echo "Invalid FRPC_API_PORT" >&2; exit 1 ;; esac
[ "$port" -ge 1 ] && [ "$port" -le 65535 ] || exit 1
umask 077
mkdir -p /app/pb_data/runtime
config=/app/pb_data/runtime/frpc.json
if [ ! -f "$config" ]; then
 cat > "$config.next" <<EOF
{"serverAddr":"127.0.0.1","serverPort":9,"loginFailExit":false,"webServer":{"addr":"$addr","port":$port,"user":"${FRPC_API_USER:-podux}","password":"$FRPC_API_PASSWORD"},"log":{"to":"console","level":"error","disablePrintColor":true}}
EOF
 mv "$config.next" "$config"
fi
# A torn/invalid config must never silently replace working tunnels with an empty profile.
if ! frpc verify -c "$config" >/dev/null 2>&1; then
 previous=/app/pb_data/runtime/frpc.previous.json
 if [ -f "$previous" ] && frpc verify -c "$previous" >/dev/null 2>&1; then
  cp "$previous" "$config.next"
  mv "$config.next" "$config"
  echo "Restored the previous valid FRPC configuration" >&2
 else
  echo "FRPC configuration invalid; valid backup unavailable" >&2
  exit 1
 fi
fi
exec frpc -c "$config"
