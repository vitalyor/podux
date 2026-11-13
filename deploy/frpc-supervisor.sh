#!/bin/sh
# Runs one frpc per enabled connection: $RUNTIME_DIR/clients/<serverId>/{frpc.json,enabled}.
# POSIX sh (busybox in the official frpc image). Mounted read-only; needs no extra privileges.
#   frpc-supervisor.sh          supervise (container entrypoint)
#   frpc-supervisor.sh health   exit 0 when the supervisor and every enabled process are alive
# A connection whose server is unreachable keeps its process running (loginFailExit=false),
# so health never fails because one FRP server is down.
set -u
RUNTIME_DIR=${RUNTIME_DIR:-/app/pb_data/runtime}
CLIENTS=$RUNTIME_DIR/clients
FRPC_BIN=${FRPC_BIN:-frpc}
TICK=${TICK:-2}
MAXDELAY=${MAXDELAY:-60}
STATE=${STATE_DIR:-/tmp/frpc-supervisor}
umask 077

log() { echo "frpc-supervisor: $*"; }

# Directory of a connection id; "legacy" is the 0.2.x layout with a single runtime/frpc.json.
client_dir() { if [ "$1" = legacy ]; then echo "$RUNTIME_DIR"; else echo "$CLIENTS/$1"; fi; }

# Enabled ids, one per line. Without clients/ the legacy file is the only client.
enabled_ids() {
  if [ -d "$CLIENTS" ]; then
    for d in "$CLIENTS"/*/; do
      [ -f "${d}enabled" ] || continue
      id=$(basename "$d")
      case "$id" in *[!A-Za-z0-9]*) continue ;; esac
      echo "$id"
    done
  elif [ -s "$RUNTIME_DIR/frpc.json" ]; then
    echo legacy
  fi
}

is_enabled() { enabled_ids | grep -qx "$1"; }

# Keep frpc.json valid: fall back to frpc.previous.json when it does not verify.
pick_config() {
  dir=$1
  [ -s "$dir/frpc.json" ] && "$FRPC_BIN" verify -c "$dir/frpc.json" >/dev/null 2>&1 && return 0
  [ -s "$dir/frpc.previous.json" ] && "$FRPC_BIN" verify -c "$dir/frpc.previous.json" >/dev/null 2>&1 || return 1
  cp "$dir/frpc.previous.json" "$dir/frpc.json.next" && mv "$dir/frpc.json.next" "$dir/frpc.json" || return 1
  log "[$id] frpc.json is invalid; restored frpc.previous.json"
}

# One wrapper per connection: runs frpc, restarts it with a growing pause, stops it on TERM.
run_client() {
  id=$1; dir=$(client_dir "$id"); delay=1; child=
  trap '[ -n "$child" ] && kill -TERM "$child" 2>/dev/null && wait "$child" 2>/dev/null; rm -f "$STATE/$id.pid" "$STATE/$id.backoff"; exit 0' TERM INT
  while :; do
    if pick_config "$dir"; then
      started=$(date +%s)
      "$FRPC_BIN" -c "$dir/frpc.json" &
      child=$!
      echo "$child" >"$STATE/$id.pid"; rm -f "$STATE/$id.backoff"
      wait "$child"; rc=$?
      child=; rm -f "$STATE/$id.pid"
      [ $(($(date +%s) - started)) -ge 60 ] && delay=1
      log "[$id] frpc exited with code $rc; restarting in ${delay}s"
    else
      log "[$id] no valid configuration; retrying in ${delay}s"
    fi
    : >"$STATE/$id.backoff"
    sleep "$delay" &
    child=$!; wait "$child"; child=
    delay=$((delay * 2)); [ "$delay" -gt "$MAXDELAY" ] && delay=$MAXDELAY
  done
}

stop_client() {
  pid=$(cat "$STATE/$1.wrapper" 2>/dev/null) && kill -TERM "$pid" 2>/dev/null && wait "$pid" 2>/dev/null
  rm -f "$STATE/$1.wrapper"
  log "[$1] stopped"
}

health() {
  now=$(date +%s); beat=$(cat "$STATE/heartbeat" 2>/dev/null || echo 0)
  [ $((now - beat)) -le $((TICK * 5 + 10)) ] || { echo "supervisor loop is not running"; return 1; }
  for id in $(enabled_ids); do
    [ -f "$STATE/$id.backoff" ] && continue # waiting to restart: the supervisor handles it
    pid=$(cat "$STATE/$id.pid" 2>/dev/null) && kill -0 "$pid" 2>/dev/null || { echo "[$id] frpc is not running"; return 1; }
    port=$(cat "$(client_dir "$id")/port" 2>/dev/null) && command -v wget >/dev/null || continue
    wget -q -T 2 -O /dev/null "http://127.0.0.1:$port/healthz" 2>/dev/null || { echo "[$id] /healthz does not answer"; return 1; }
  done
}

[ "${1:-}" = health ] && { health; exit; }

mkdir -p "$STATE" && rm -f "$STATE"/*
shutdown() {
  for f in "$STATE"/*.wrapper; do [ -f "$f" ] && stop_client "$(basename "$f" .wrapper)"; done
  exit 0
}
trap shutdown TERM INT
log "watching $CLIENTS"
while :; do
  date +%s >"$STATE/heartbeat"
  # Stop first: the legacy client and a migrated one may share an admin port.
  for f in "$STATE"/*.wrapper; do
    [ -f "$f" ] || continue
    id=$(basename "$f" .wrapper)
    is_enabled "$id" || stop_client "$id"
  done
  for id in $(enabled_ids); do
    # ponytail: a wrapper killed from outside is not noticed (it never exits on its own).
    [ -f "$STATE/$id.wrapper" ] && continue
    run_client "$id" &
    echo $! >"$STATE/$id.wrapper"
    log "[$id] started"
  done
  sleep "$TICK" &
  wait $!
done
