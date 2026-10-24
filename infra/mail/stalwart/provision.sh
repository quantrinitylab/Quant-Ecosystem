#!/usr/bin/env bash
# Config-as-code driver for the Stalwart lab (runs on the VM, next to docker-compose.yml).
#
#   ./provision.sh bootstrap   first start: bootstrap mode -> hostname, domain, stores, admin
#   ./provision.sh apply       render plan/*.tmpl from .env and apply them (idempotent)
#   ./provision.sh all         bootstrap (if needed) + apply
#   ./provision.sh dns         print the DNS zone file Stalwart generates for LAB_DOMAIN
#   ./provision.sh status      listeners, accounts, certificate and queue summary
#
# Secrets stay in .env (mode 600) and in the container environment. The rendered plan is written
# to .rendered/ (mode 700, git-ignored) and removed right after it is applied.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

umask 077
ENV_FILE=".env"
OUT_DIR=".rendered"
ADMIN_ENV="${OUT_DIR}/admin.env"
ACCOUNTS_ENV="${OUT_DIR}/accounts.env"

# Only these variables are substituted; every other "$" (argon2 hashes, SQL placeholders) is untouched.
SUBST_VARS='${LAB_DOMAIN} ${MAIL_HOSTNAME} ${DNS_ZONE} ${ACME_DIRECTORY} ${ACME_CONTACT} ${R2_ENDPOINT} ${R2_BUCKET} ${OUTBOUND_ROUTE} ${RELAY_HOST} ${RELAY_PORT} ${RELAY_USER} ${LAB_ALICE_PASSWORD} ${LAB_BOB_PASSWORD} ${WEBHOOK_URL} ${MTA_HOOK_URL} ${PG_HOST} ${PG_PORT} ${PG_DB} ${PG_USER}'

die() { echo "error: $*" >&2; exit 1; }
log() { echo "[provision] $*" >&2; }

need() { command -v "$1" >/dev/null 2>&1 || die "missing command: $1"; }

load_env() {
  [ -f "$ENV_FILE" ] || die "$ENV_FILE not found (copy ../.env.example to stalwart/.env and fill it in)"
  set -a
  # shellcheck disable=SC1090
  . "./$ENV_FILE"
  set +a
  : "${LAB_DOMAIN:?}" "${MAIL_HOSTNAME:?}" "${DNS_ZONE:?}"
  ACME_CHALLENGE="${ACME_CHALLENGE:-Dns01}"
  STORAGE_BLOBS="${STORAGE_BLOBS:-local}"
  DIRECTORY="${DIRECTORY:-internal}"
  OUTBOUND_ROUTE="${OUTBOUND_ROUTE:-relay}"
  mkdir -p "$OUT_DIR"
  chmod 700 "$OUT_DIR"
  export ACME_CHALLENGE STORAGE_BLOBS DIRECTORY OUTBOUND_ROUTE
}

ensure_account_passwords() {
  if [ -z "${LAB_ALICE_PASSWORD:-}" ] || [ -z "${LAB_BOB_PASSWORD:-}" ]; then
    if [ -f "$ACCOUNTS_ENV" ]; then
      set -a; . "./$ACCOUNTS_ENV"; set +a
    fi
  fi
  if [ -z "${LAB_ALICE_PASSWORD:-}" ]; then
    LAB_ALICE_PASSWORD="$(openssl rand -base64 24 | tr -d '/+=\n' | cut -c1-20)-aA1"
  fi
  if [ -z "${LAB_BOB_PASSWORD:-}" ]; then
    LAB_BOB_PASSWORD="$(openssl rand -base64 24 | tr -d '/+=\n' | cut -c1-20)-bB2"
  fi
  export LAB_ALICE_PASSWORD LAB_BOB_PASSWORD
  {
    echo "LAB_ALICE_PASSWORD=${LAB_ALICE_PASSWORD}"
    echo "LAB_BOB_PASSWORD=${LAB_BOB_PASSWORD}"
  } > "$ACCOUNTS_ENV"
}

render() { # render <template>...
  local f
  for f in "$@"; do
    [ -f "$f" ] || die "template not found: $f"
    envsubst "$SUBST_VARS" < "$f"
    echo
  done | sed '/^$/d'
}

plan_files() {
  local files=()
  case "$ACME_CHALLENGE" in
    Dns01)  files+=(plan/10-tls-dns01.ndjson.tmpl) ;;
    Http01) files+=(plan/10-tls-http01.ndjson.tmpl) ;;
    *) die "ACME_CHALLENGE must be Dns01 or Http01" ;;
  esac
  files+=(plan/20-listeners.ndjson.tmpl)
  case "$STORAGE_BLOBS" in
    r2)    files+=(plan/30-storage-r2.ndjson.tmpl) ;;
    local) files+=(plan/30-storage-local.ndjson.tmpl) ;;
    *) die "STORAGE_BLOBS must be r2 or local" ;;
  esac
  case "$DIRECTORY" in
    internal) files+=(plan/40-accounts-internal.ndjson.tmpl) ;;
    sql)      files+=(plan/45-directory-sql.ndjson.tmpl) ;;
    *) die "DIRECTORY must be internal or sql" ;;
  esac
  files+=(plan/50-outbound.ndjson.tmpl plan/60-spam.ndjson.tmpl plan/70-hooks.ndjson.tmpl)
  # Lab only: raise the default inbound throttles (25 messages/hour per sender domain and recipient,
  # 5 connections/s per IP) so the 2,000 message load test can run. Keep the defaults in Phase 2.
  if [ "${LAB_RELAX_THROTTLES:-1}" = 1 ]; then files+=(plan/80-lab-throttles.ndjson.tmpl); fi
  files+=(plan/90-reload.ndjson.tmpl)
  printf '%s\n' "${files[@]}"
}

cli() { # cli <args...>  (plan or JSON is piped on stdin when needed)
  docker compose --profile tools run --rm -T cli "$@"
}

wait_healthy() {
  local i
  for i in $(seq 1 60); do
    local s
    s="$(docker inspect -f '{{.State.Health.Status}}' stalwart 2>/dev/null || echo none)"
    [ "$s" = healthy ] && return 0
    sleep 5
  done
  die "stalwart did not become healthy in 5 minutes (docker compose logs stalwart)"
}

do_bootstrap() {
  load_env
  need docker; need envsubst
  docker compose up -d stalwart hooks
  if docker compose exec -T stalwart test -f /etc/stalwart/config.json 2>/dev/null; then
    log "config.json already exists: bootstrap skipped"
    return 0
  fi
  log "waiting for bootstrap mode"
  local pw="" i
  for i in $(seq 1 30); do
    pw="$(docker compose logs stalwart 2>&1 | grep -A8 'bootstrap mode' | sed -n 's/.*password: *\([A-Za-z0-9]\{8,\}\).*/\1/p' | tail -n 1 || true)"
    [ -n "$pw" ] && break
    sleep 2
  done
  [ -n "$pw" ] || die "bootstrap banner not found in the logs (is this already bootstrapped?)"
  log "applying bootstrap settings"
  local out
  out="$(render bootstrap.json.tmpl | STALWART_URL=http://stalwart:8080 STALWART_ADMIN_USER=admin STALWART_ADMIN_PASSWORD="$pw" \
    docker compose --profile tools run --rm -T -e STALWART_URL=http://stalwart:8080 cli update Bootstrap --stdin)"
  local user secret
  user="$(printf '%s\n' "$out" | sed -n 's/^ *username: *"\(.*\)"$/\1/p')"
  secret="$(printf '%s\n' "$out" | sed -n 's/^ *secret: *"\(.*\)"$/\1/p')"
  [ -n "$user" ] && [ -n "$secret" ] || die "could not read the generated administrator credentials"
  {
    echo "STALWART_ADMIN_USER=${user}"
    echo "STALWART_ADMIN_PASSWORD=${secret}"
  } > "$ADMIN_ENV"
  chmod 600 "$ADMIN_ENV"
  log "administrator credentials written to stalwart/${ADMIN_ENV} (VM only)"
  docker compose restart stalwart
  wait_healthy
}

do_apply() {
  load_env
  need docker; need envsubst; need openssl
  [ -f "$ADMIN_ENV" ] || die "run './provision.sh bootstrap' first ($ADMIN_ENV missing)"
  set -a; . "./$ADMIN_ENV"; set +a
  if [ "$DIRECTORY" = internal ]; then ensure_account_passwords; fi
  local plan="${OUT_DIR}/plan.ndjson"
  # shellcheck disable=SC2046
  render $(plan_files) > "$plan"
  log "plan: $(wc -l < "$plan") operations ($(plan_files | tr '\n' ' '))"
  # shellcheck disable=SC2064
  trap "rm -f '$plan'" EXIT
  docker compose --profile tools run --rm -T cli --insecure apply --stdin --quiet < "$plan"
  rm -f "$plan"
  trap - EXIT
  docker compose restart stalwart
  wait_healthy
  log "applied. Next: ../lab/dns-lab.ps1 (laptop) and tests in ../lab/tests"
}

do_dns() {
  load_env
  [ -f "$ADMIN_ENV" ] || die "bootstrap first"
  set -a; . "./$ADMIN_ENV"; set +a
  local id
  id="$(cli --insecure query Domain --where "name=${LAB_DOMAIN}" --json | sed -n 's/.*"id":"\([^"]*\)".*/\1/p' | head -n 1)"
  [ -n "$id" ] || die "domain ${LAB_DOMAIN} not found"
  cli --insecure get Domain "$id" --fields dnsZoneFile
}

do_status() {
  load_env
  [ -f "$ADMIN_ENV" ] || die "bootstrap first"
  set -a; . "./$ADMIN_ENV"; set +a
  docker compose ps
  cli --insecure query NetworkListener
  cli --insecure query Account
  cli --insecure query Domain
}

case "${1:-}" in
  bootstrap) do_bootstrap ;;
  apply)     do_apply ;;
  all)       do_bootstrap; do_apply ;;
  dns)       do_dns ;;
  status)    do_status ;;
  *) sed -n '2,12p' "${BASH_SOURCE[0]}"; exit 2 ;;
esac
