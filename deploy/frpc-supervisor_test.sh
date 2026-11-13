#!/bin/sh
# Check: start, stop, restart of a crashed process, config rollback, SIGTERM. Uses a stub frpc.
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
mkdir -p "$T/clients/a" "$T/clients/b" "$T/bin" "$T/run"
cat >"$T/bin/frpc" <<'STUB'
#!/bin/sh
if [ "$1" = verify ]; then grep -q BAD "$3" && exit 1; exit 0; fi
echo $$ >"$RUN/$(basename "$(dirname "$2")").pid"
echo "$2" >>"$RUN/$(basename "$(dirname "$2")").starts"
exec sleep 300
STUB
chmod +x "$T/bin/frpc"
export RUN="$T/run" RUNTIME_DIR="$T" FRPC_BIN="$T/bin/frpc" TICK=1 STATE_DIR="$T/st" MAXDELAY=2
echo '{}' >"$T/clients/a/frpc.json"; echo '{}' >"$T/clients/b/frpc.json"
touch "$T/clients/a/enabled" "$T/clients/b/enabled"
sh "$(dirname "$0")/frpc-supervisor.sh" >"$T/out.log" 2>&1 &
SUP=$!
fail() { echo "FAIL: $*"; ls -la "$T/st"; tail -40 "$T/out.log"; kill "$SUP" 2>/dev/null; exit 1; }
alive() { [ -f "$RUN/$1.pid" ] && kill -0 "$(cat "$RUN/$1.pid")" 2>/dev/null; }
wait_for() { i=0; while ! "$@"; do i=$((i+1)); [ $i -gt 100 ] && return 1; sleep 0.1; done; }
gone() { ! alive "$1"; }

wait_for alive a && wait_for alive b || fail "clients did not start"
# disable b: only b stops
rm "$T/clients/b/enabled"
wait_for gone b || fail "b not stopped"; alive a || fail "a affected by stopping b"
# crash a: restarted
OLD=$(cat "$RUN/a.pid"); kill -9 "$OLD"
wait_for alive a && [ "$(cat "$RUN/a.pid")" != "$OLD" ] || fail "a not restarted"
alive a || { sleep 2; alive a; } || fail "a not running after restart"
# broken config rolls back to previous
cp "$T/clients/a/frpc.json" "$T/clients/a/frpc.previous.json"
echo BAD >"$T/clients/a/frpc.json"; kill -9 "$(cat "$RUN/a.pid")"
wait_for sh -c "grep -q '{}' '$T/clients/a/frpc.json'" || fail "no rollback to previous"
# re-enable b
touch "$T/clients/b/enabled"; sleep 3
wait_for alive b || fail "b not started again"
sh "$(dirname "$0")/frpc-supervisor.sh" health || fail "health"
# SIGTERM stops everything quickly
PA=$(cat "$RUN/a.pid"); PB=$(cat "$RUN/b.pid")
kill -TERM "$SUP"; i=0
while kill -0 "$SUP" 2>/dev/null; do i=$((i+1)); [ $i -gt 50 ] && fail "supervisor did not exit"; sleep 0.1; done
kill -0 "$PA" 2>/dev/null && fail "a survived SIGTERM"; kill -0 "$PB" 2>/dev/null && fail "b survived SIGTERM"
echo OK
