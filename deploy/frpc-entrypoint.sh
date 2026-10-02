#!/bin/sh
set -eu
# Hex credentials are generated locally; never interpolate arbitrary JSON strings.
case "${FRPC_API_PASSWORD:-}" in ""|*[!a-zA-Z0-9]*) echo "Set an alphanumeric FRPC_API_PASSWORD" >&2; exit 1 ;; esac
case "${FRPC_API_USER:-podux}" in *[!a-zA-Z0-9_-]*) exit 1 ;; esac
umask 077
mkdir -p /app/pb_data/runtime
config=/app/pb_data/runtime/frpc.json
if [ ! -f "$config" ]; then
 cat > "$config" <<EOF
{"serverAddr":"127.0.0.1","serverPort":9,"loginFailExit":false,"webServer":{"addr":"0.0.0.0","port":7400,"user":"${FRPC_API_USER:-podux}","password":"$FRPC_API_PASSWORD"},"log":{"to":"console","level":"error","disablePrintColor":true}}
EOF
fi
exec frpc -c "$config"
