#!/usr/bin/env bash
# Starts Postgres + Redis inside the CURRENT sandbox call (processes do not
# survive across calls, but $QA/pgdata on disk does). Idempotent within a call.
set -u
: "${QA:=/projects/sandbox/.qa-env}"

as_pg() { setpriv --reuid=65534 --regid=65534 --clear-groups env HOME="$QA/run" "$@"; }

start_pg() {
  if as_pg "$QA/pg/bin/pg_ctl" -D "$QA/pgdata" status >/dev/null 2>&1; then
    echo "[infra] postgres already running"; return 0
  fi
  # Clean any stale lock/socket from a torn-down call
  rm -f "$QA/pgdata/postmaster.pid" "$QA/run/.s.PGSQL.5432"* 2>/dev/null || true
  chown -R 65534:65534 "$QA/pgdata" "$QA/run" "$QA/logs" 2>/dev/null || true
  as_pg "$QA/pg/bin/pg_ctl" -D "$QA/pgdata" -l "$QA/logs/pg.log" -w -t 60 start >/dev/null 2>&1
  for i in $(seq 1 30); do
    as_pg "$QA/pg/bin/pg_isready" -h 127.0.0.1 -p 5432 -q && { echo "[infra] postgres up"; return 0; }
    sleep 0.5
  done
  echo "[infra] postgres FAILED to start"; tail -5 "$QA/logs/pg.log"; return 1
}

start_redis() {
  if "$QA/redis/bin/redis-cli" -h 127.0.0.1 -p 6379 ping >/dev/null 2>&1; then
    echo "[infra] redis already running"; return 0
  fi
  "$QA/redis/bin/redis-server" --daemonize yes --dir "$QA/redis-data" --port 6379 \
    --bind 127.0.0.1 --save "" --appendonly no --logfile "$QA/logs/redis.log" >/dev/null 2>&1
  for i in $(seq 1 20); do
    "$QA/redis/bin/redis-cli" -h 127.0.0.1 -p 6379 ping >/dev/null 2>&1 && { echo "[infra] redis up"; return 0; }
    sleep 0.3
  done
  echo "[infra] redis FAILED to start"; return 1
}

start_pg && start_redis
