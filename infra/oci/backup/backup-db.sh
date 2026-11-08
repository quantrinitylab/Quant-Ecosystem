#!/usr/bin/env bash
# Encrypted, restore-tested logical backup of the production database.
# Streamed over SSH by .github/workflows/db-backup.yml:
#
#   ssh user@vm-app "QBK_AGE_RECIPIENT='age1...' bash -s" < infra/oci/backup/backup-db.sh
#
# What it does, on vm-app, installing nothing system-wide:
#   1. reads DATABASE_URL and the object-store settings from /etc/quant/secrets.env (values stay in memory)
#   2. pg_dump (custom format) in a pinned postgres container
#   3. restores that dump into a throwaway pgvector container and compares per-table row counts
#   4. encrypts with age to a PUBLIC recipient (the private key is not on the VM, nor in GitHub)
#   5. uploads, reads the object back and compares its SHA-256
#   6. archives the VM's own config directory (/etc/quant: secrets.env, the Cloudflare origin certificate and
#      key, the Caddyfile), which is in neither the repository nor the database, encrypts it to the same
#      recipient and stores it next to the dump, verified by read-back the same way. Without this copy a lost
#      VM would also lose DRIVE_MASTER_KEY and the other keys that make stored data readable. The database
#      copy is stored first, so a problem with the config copy turns the run red without costing the dump.
#   7. prunes both kinds of copy: daily copies older than QBK_KEEP_DAILY_DAYS (35), monthly copies older than
#      400 days, never below 7 daily copies
#
# Rules: print names, sizes, counts and durations only. Never print a secret or a connection string.
# Everything lives in main() and runs with stdin from /dev/null, so no command can swallow the rest of
# this script from the SSH pipe. Any failure exits non-zero, which turns the workflow red.
#
# Environment: QBK_AGE_RECIPIENT (required). Optional: QBK_PRESIGN_MINUTES (print a read link for a drill).
# Mostly for tests: QBK_ENV_FILE, QBK_CONF_DIR, QBK_REMOTE_PREFIX, QBK_REMOTE_CONF_PREFIX, QBK_KEEP_DAILY_DAYS,
# QBK_KEEP_MONTHLY_DAYS, QBK_AGE_BIN, QBK_BIN_DIR, QBK_RESTORE_TMPFS, QBK_SKIP_PRUNE.

# Pinned tools. Change them together with infra/oci/backup/README.md.
PG_IMAGE='postgres@sha256:aae6554de426ae1990f1a939ff183a0299146cf7142a6f4c379c3357af9cc2d8'                # postgres:15-alpine, 2026-11-06
PGVECTOR_IMAGE='pgvector/pgvector@sha256:88164492558c9773a1e17a8305abaca7863e05b3d8bbcdb792774890a2047e06' # pgvector pg15, 2026-10-31
RCLONE_IMAGE='rclone/rclone@sha256:7cbeec24a44f206067597c0368be4de90ae19a64d5113c7d1938bd737a81e466'       # rclone 1.76.0
AGE_VERSION='v1.3.2'
AGE_SHA256_ARM64='6b8dc4333c53a5a57c9e5834e3a48f92605d7154014cd07269ff3327db5d37f4'
AGE_SHA256_AMD64='cbe24006683f8eb669266162894b9a522a1af52f2665fbc63a4bb032ed26ac10'

# Globals on purpose: the EXIT trap must still see them after main() has returned, otherwise a
# successful run would leave the plaintext dump behind in /var/tmp.
work=""
cname=""

main() {
  set -Eeuo pipefail
  umask 077
  export LC_ALL=C
  local started lock_fd

  started=$(date +%s)
  log() { printf '%s\n' "$*"; }
  section() { printf '\n## %s\n' "$1"; }
  die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
  cleanup() {
    local rc=$?
    [ -z "$cname" ] || docker rm -f "$cname" >/dev/null 2>&1 || true
    [ -z "$work" ] || rm -rf -- "$work"
    unset PGURL PGOPTIONS RCLONE_CONFIG_D1_ACCESS_KEY_ID RCLONE_CONFIG_D1_SECRET_ACCESS_KEY \
      RCLONE_CONFIG_D2_ACCESS_KEY_ID RCLONE_CONFIG_D2_SECRET_ACCESS_KEY 2>/dev/null || true
    return $rc
  }
  trap cleanup EXIT
  trap 'printf "ERROR: failed at line %s\n" "$LINENO" >&2' ERR

  # ---------------------------------------------------------------- preflight
  command -v docker >/dev/null || die 'docker is not installed'
  docker ps >/dev/null 2>&1 || die 'docker needs sudo here; refusing, so the connection string never appears in a process list'
  [[ "${QBK_AGE_RECIPIENT:-}" =~ ^age1[0-9a-z]{58}$ ]] || die 'QBK_AGE_RECIPIENT is missing or malformed'
  exec {lock_fd}>/var/tmp/qbk.lock
  flock -n "$lock_fd" || die 'another backup is already running'

  local env_file="${QBK_ENV_FILE:-/etc/quant/secrets.env}"
  local prefix="${QBK_REMOTE_PREFIX:-_ops/backups/pg}"
  local conf_dir="${QBK_CONF_DIR:-/etc/quant}" conf_prefix="${QBK_REMOTE_CONF_PREFIX:-_ops/backups/vmconf}"
  local keep_daily="${QBK_KEEP_DAILY_DAYS:-35}" keep_monthly="${QBK_KEEP_MONTHLY_DAYS:-400}"
  local presign="${QBK_PRESIGN_MINUTES:-0}"
  [[ "$presign" =~ ^[0-9]{1,4}$ ]] || die 'QBK_PRESIGN_MINUTES must be a whole number of minutes'
  work="$(mktemp -d /var/tmp/qbk.XXXXXX)"

  section "backup run"
  printf 'utc_start: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf 'host: %s | arch: %s\n' "$(hostname -s)" "$(uname -m)"

  # ---------------------------------------------------------------- settings (kept in memory)
  declare -A E=()
  local line k
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    case "$line" in '' | '#'*) continue ;; esac
    line="${line#export }"
    [[ "$line" == *=* ]] || continue
    k="${line%%=*}"
    case "$k" in DATABASE_URL | DRIVE_S3_* | BACKUP_S3_* | BACKUP2_S3_*) E["$k"]="${line#*=}" ;; esac
  done < <(cat -- "$env_file" 2>/dev/null || sudo -n cat -- "$env_file")
  unq() { local v="$1"; v="${v#\"}"; v="${v%\"}"; v="${v#\'}"; v="${v%\'}"; printf '%s' "$v"; }
  [ -n "${E[DATABASE_URL]:-}" ] || die "DATABASE_URL is not readable from $env_file"

  # Prisma-only query parameters make libpq reject the URL: keep sslmode, add a connect timeout.
  local dburl dbbase dbparams="" p
  local -a kv
  dburl="$(unq "${E[DATABASE_URL]}")"
  dbbase="${dburl%%\?*}"
  if [[ "$dburl" == *\?* ]]; then
    IFS='&' read -r -a kv <<<"${dburl#*\?}"
    for p in "${kv[@]}"; do case "$p" in sslmode=*) dbparams="${dbparams:+$dbparams&}$p" ;; esac; done
  fi
  export PGURL="$dbbase?${dbparams:+$dbparams&}connect_timeout=10"
  export PGOPTIONS='-c lock_timeout=60000'
  printf 'database: host=%s name=%s\n' "$(printf '%s' "$dbbase" | sed -E 's#^[A-Za-z]+://[^@]*@([^/:?]+).*#\1#')" "$(printf '%s' "$dbbase" | sed -E 's#^.*/([^/?]+)$#\1#')"

  # Destinations: 1 = BACKUP_S3_* when complete, else the Drive bucket (private prefix); 2 = BACKUP2_S3_* when present.
  local -a DESTS=() RC_ENV=()
  declare -A DBUCKET=()
  add_dest() { # <ENV_PREFIX> <rclone remote name>
    local pre="$1" name="$2" ep ak sk rg bk fps
    ep="$(unq "${E[${pre}_ENDPOINT]:-}")"; ak="$(unq "${E[${pre}_ACCESS_KEY_ID]:-}")"
    sk="$(unq "${E[${pre}_SECRET_ACCESS_KEY]:-}")"; rg="$(unq "${E[${pre}_REGION]:-auto}")"
    bk="$(unq "${E[${pre}_BUCKET]:-}")"; fps="$(unq "${E[${pre}_FORCE_PATH_STYLE]:-true}")"
    [ -n "$ep" ] && [ -n "$ak" ] && [ -n "$sk" ] && [ -n "$bk" ] || return 1
    local up
    up="$(printf '%s' "$name" | tr 'a-z' 'A-Z')"
    export "RCLONE_CONFIG_${up}_TYPE=s3" "RCLONE_CONFIG_${up}_PROVIDER=Other" "RCLONE_CONFIG_${up}_ENDPOINT=$ep" \
      "RCLONE_CONFIG_${up}_REGION=$rg" "RCLONE_CONFIG_${up}_ACCESS_KEY_ID=$ak" "RCLONE_CONFIG_${up}_SECRET_ACCESS_KEY=$sk" \
      "RCLONE_CONFIG_${up}_FORCE_PATH_STYLE=$fps" "RCLONE_CONFIG_${up}_NO_CHECK_BUCKET=true"
    local v
    for v in TYPE PROVIDER ENDPOINT REGION ACCESS_KEY_ID SECRET_ACCESS_KEY FORCE_PATH_STYLE NO_CHECK_BUCKET; do
      RC_ENV+=(-e "RCLONE_CONFIG_${up}_${v}")
    done
    DESTS+=("$name")
    DBUCKET["$name"]="$bk"
    printf 'destination %s: bucket=%s endpoint=%s\n' "$name" "$bk" "$(printf '%s' "$ep" | sed -E 's#^https?://##; s#^[^.]+\.#<ns>.#')"
  }
  if ! add_dest BACKUP_S3 d1; then add_dest DRIVE_S3 d1 || die 'no object-store settings found (BACKUP_S3_* or DRIVE_S3_*)'; fi
  add_dest BACKUP2_S3 d2 || true
  rclone_run() { docker run --rm -i --network host "${RC_ENV[@]}" "$RCLONE_IMAGE" "$@"; }
  pg_run() { docker run --rm -i --network host -e PGURL -e PGOPTIONS "$PG_IMAGE" "$@"; }

  # ---------------------------------------------------------------- tools
  section "tools"
  local img
  for img in "$PG_IMAGE" "$PGVECTOR_IMAGE" "$RCLONE_IMAGE"; do
    docker image inspect "$img" >/dev/null 2>&1 || timeout 600 docker pull -q "$img" >/dev/null
  done
  echo "images ready (pinned by digest)"
  local AGE_BIN
  if [ -n "${QBK_AGE_BIN:-}" ]; then
    AGE_BIN="$QBK_AGE_BIN"
  else
    local arch sha bin_dir="${QBK_BIN_DIR:-$HOME/.local/bin}"
    case "$(uname -m)" in
      aarch64 | arm64) arch=linux-arm64; sha="$AGE_SHA256_ARM64" ;;
      x86_64) arch=linux-amd64; sha="$AGE_SHA256_AMD64" ;;
      *) die "unsupported architecture $(uname -m)" ;;
    esac
    AGE_BIN="$bin_dir/age"
    if ! { [ -x "$AGE_BIN" ] && "$AGE_BIN" --version 2>/dev/null | grep -q "${AGE_VERSION#v}"; }; then
      mkdir -p "$bin_dir"
      curl -fsSL --retry 3 --max-time 120 -o "$work/age.tgz" \
        "https://github.com/FiloSottile/age/releases/download/$AGE_VERSION/age-$AGE_VERSION-$arch.tar.gz"
      printf '%s  %s\n' "$sha" "$work/age.tgz" | sha256sum -c - >/dev/null || die 'the age download failed its pinned checksum'
      tar -xzf "$work/age.tgz" -C "$work" age/age
      install -m 0755 "$work/age/age" "$AGE_BIN"
    fi
  fi
  printf 'age: %s\n' "$("$AGE_BIN" --version 2>&1 | head -n1)"

  # ---------------------------------------------------------------- dump
  section "dump"
  local t0 dump_bytes db_bytes
  db_bytes="$(printf 'SELECT pg_database_size(current_database());\n' | pg_run sh -c 'psql "$PGURL" -X -At -f -')"
  printf 'database size: %s bytes\n' "$db_bytes"
  local free_kb need_kb
  free_kb="$(df -Pk /var/tmp | awk 'NR==2{print $4}')"
  need_kb=$(( (db_bytes / 1024) * 3 + 200000 ))
  [ "$free_kb" -ge "$need_kb" ] || die "not enough free space in /var/tmp (${free_kb} KB free, ${need_kb} KB needed)"
  t0=$(date +%s)
  pg_run sh -c 'exec pg_dump --format=custom --no-owner --no-acl --lock-wait-timeout=60s --dbname "$PGURL"' >"$work/db.dump"
  dump_bytes="$(stat -c %s "$work/db.dump")"
  printf 'dump: %s bytes in %s s\n' "$dump_bytes" "$(( $(date +%s) - t0 ))"
  [ "$dump_bytes" -gt 20000 ] || die 'the dump is implausibly small'
  local toc_entries
  toc_entries="$(pg_run pg_restore --list <"$work/db.dump" | grep -vc '^;')"
  printf 'archive entries: %s\n' "$toc_entries"
  [ "$toc_entries" -gt 50 ] || die 'the dump archive lists too few objects'

  local COUNTS_SQL
  COUNTS_SQL="SELECT table_name || '|' || (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY 1;"
  printf '%s\n' "$COUNTS_SQL" | pg_run sh -c 'psql "$PGURL" -X -At -f -' >"$work/src.counts"

  # ---------------------------------------------------------------- restore test
  section "restore test (throwaway pgvector container)"
  local rpw
  rpw="$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 24)"
  cname="qbk-restore-$$"
  docker run -d --rm --name "$cname" -e POSTGRES_PASSWORD="$rpw" -e POSTGRES_DB=restore \
    --tmpfs "/var/lib/postgresql/data:rw,size=${QBK_RESTORE_TMPFS:-2g}" "$PGVECTOR_IMAGE" >/dev/null
  local ready=no
  for _ in $(seq 1 90); do
    if docker exec "$cname" pg_isready -h 127.0.0.1 -U postgres -d restore -q 2>/dev/null; then ready=yes; break; fi
    sleep 1
  done
  [ "$ready" = yes ] || die 'the throwaway Postgres did not become ready in 90 s'
  t0=$(date +%s)
  docker exec -i "$cname" pg_restore -U postgres -d restore --no-owner --no-acl --exit-on-error <"$work/db.dump"
  printf 'restored in %s s\n' "$(( $(date +%s) - t0 ))"
  printf '%s\n' "$COUNTS_SQL" | docker exec -i "$cname" psql -U postgres -d restore -X -At -f - >"$work/rst.counts"
  docker rm -f "$cname" >/dev/null 2>&1 || true
  cname=""

  # Both sides are sorted by table name and joined; a table missing on either side, or a row-count gap
  # beyond max(10, 1 percent), fails the run. The migrations table must match exactly.
  join -t'|' -a1 -a2 -e MISSING -o 0,1.2,2.2 <(sort -t'|' -k1,1 "$work/src.counts") <(sort -t'|' -k1,1 "$work/rst.counts") >"$work/cmp.txt"
  local tables bad total_rows
  read -r tables bad total_rows < <(awk -F'|' '
    { n++; s = $2; r = $3; total += (r == "MISSING" ? 0 : r)
      if (s == "MISSING" || r == "MISSING") { bad++; next }
      tol = (s * 0.01 > 10) ? s * 0.01 : 10; d = s - r; if (d < 0) d = -d
      if (d > tol) bad++
      if ($1 == "_prisma_migrations" && s != r) bad++ }
    END { printf "%d %d %d\n", n, bad + 0, total + 0 }' "$work/cmp.txt")
  printf 'tables compared: %s | mismatches: %s | rows restored: %s\n' "$tables" "$bad" "$total_rows"
  [ "$tables" -ge 10 ] || die 'fewer than 10 tables were compared'
  [ "$bad" -eq 0 ] || { grep -E 'MISSING' "$work/cmp.txt" | head -n 10 || true; die 'restore verification failed'; }

  # ---------------------------------------------------------------- encrypt and upload
  section "encrypt and upload"
  local ts plain_sha enc_sha enc_bytes obj d
  ts="$(date -u +%Y%m%dT%H%M%SZ)"
  plain_sha="$(sha256sum <"$work/db.dump" | cut -d' ' -f1)"
  "$AGE_BIN" -r "$QBK_AGE_RECIPIENT" -o "$work/db.dump.age" "$work/db.dump"
  enc_bytes="$(stat -c %s "$work/db.dump.age")"
  enc_sha="$(sha256sum <"$work/db.dump.age" | cut -d' ' -f1)"
  obj="qdb-${ts}-${plain_sha:0:8}.dump.age"
  printf 'object: %s\nplain sha256: %s\nencrypted: %s bytes, sha256 %s\n' "$obj" "$plain_sha" "$enc_bytes" "$enc_sha"
  for d in "${DESTS[@]}"; do
    rclone_run rcat "$d:${DBUCKET[$d]}/$prefix/daily/$obj" <"$work/db.dump.age"
    local back
    back="$(rclone_run cat "$d:${DBUCKET[$d]}/$prefix/daily/$obj" | sha256sum | cut -d' ' -f1)"
    [ "$back" = "$enc_sha" ] || die "read-back checksum mismatch on destination $d"
    printf 'uploaded and verified by read-back on %s\n' "$d"
    # Optional, for a disaster-recovery drill: a short-lived read link so the key holder can download this
    # object without any stored credential. It only ever appears in the sealed report.
    if [ "$presign" -gt 0 ]; then
      local link
      link="$(rclone_run link --expire "${presign}m" "$d:${DBUCKET[$d]}/$prefix/daily/$obj" 2>/dev/null || true)"
      if [ -n "$link" ]; then
        # Printed in 24-character parts: the report scrubber masks any run of 32 or more token characters,
        # which would also destroy the signature inside the link. Join the parts without spaces.
        printf 'read link on %s, valid %s min, in 24-character parts (join without spaces):\n' "$d" "$presign"
        printf '%s' "$link" | fold -w 24 | awk '{ printf "  link-part %02d: %s\n", NR, $0 }'
      else
        printf 'read link on %s: unavailable on this endpoint\n' "$d"
      fi
    fi
    if [ "$(date -u +%d)" = "01" ]; then
      rclone_run copyto "$d:${DBUCKET[$d]}/$prefix/daily/$obj" "$d:${DBUCKET[$d]}/$prefix/monthly/$obj"
      printf 'monthly copy kept on %s\n' "$d"
    fi
  done

  # ---------------------------------------------------------------- vm config
  # What neither the repository nor the dump can rebuild: /etc/quant holds secrets.env (DRIVE_MASTER_KEY and the
  # JWT and token secrets), the Cloudflare origin certificate and key, and the Caddyfile. Copies of secrets.env
  # that sync-secrets.sh leaves beside it (*.bak*) are left out. The plaintext archive exists only inside the
  # private work directory and is deleted as soon as it is encrypted.
  section "vm config"
  local cobj cplain_sha cenc_sha cenc_bytes cfiles
  [ -d "$conf_dir" ] || die "the config directory $conf_dir does not exist"
  conf_tar() { "$@" tar -C "$(dirname -- "$conf_dir")" --numeric-owner --exclude='*.bak*' -cf - -- "$(basename -- "$conf_dir")"; }
  if ! conf_tar >"$work/conf.tar" 2>/dev/null; then
    conf_tar sudo -n >"$work/conf.tar" 2>/dev/null || die "cannot read $conf_dir, not even with sudo"
  fi
  # List into a file first: `tar -t | grep -q` would end the pipe early and trip pipefail.
  tar -tf "$work/conf.tar" >"$work/conf.list"
  cfiles="$(grep -vc '/$' "$work/conf.list" || true)"
  [ "${cfiles:-0}" -ge 2 ] || die 'the config archive holds fewer than 2 files'
  grep -q '/secrets\.env$' "$work/conf.list" || die 'the config archive has no secrets.env'
  cplain_sha="$(sha256sum <"$work/conf.tar" | cut -d' ' -f1)"
  "$AGE_BIN" -r "$QBK_AGE_RECIPIENT" -o "$work/conf.tar.age" "$work/conf.tar"
  rm -f -- "$work/conf.tar" "$work/conf.list"
  cenc_bytes="$(stat -c %s "$work/conf.tar.age")"
  cenc_sha="$(sha256sum <"$work/conf.tar.age" | cut -d' ' -f1)"
  cobj="qconf-${ts}-${cplain_sha:0:8}.tar.age"
  # Not "object:", which the drill instructions and the test read for the database copy.
  printf 'config object: %s\nconfig files: %s | encrypted: %s bytes, sha256 %s\n' "$cobj" "$cfiles" "$cenc_bytes" "$cenc_sha"
  for d in "${DESTS[@]}"; do
    rclone_run rcat "$d:${DBUCKET[$d]}/$conf_prefix/daily/$cobj" <"$work/conf.tar.age"
    back="$(rclone_run cat "$d:${DBUCKET[$d]}/$conf_prefix/daily/$cobj" | sha256sum | cut -d' ' -f1)"
    [ "$back" = "$cenc_sha" ] || die "config read-back checksum mismatch on destination $d"
    printf 'uploaded and verified by read-back on %s\n' "$d"
    if [ "$(date -u +%d)" = "01" ]; then
      rclone_run copyto "$d:${DBUCKET[$d]}/$conf_prefix/daily/$cobj" "$d:${DBUCKET[$d]}/$conf_prefix/monthly/$cobj"
      printf 'monthly copy kept on %s\n' "$d"
    fi
  done
  printf 'CONF_OK object=%s files=%s encrypted_bytes=%s destinations=%s\n' "$cobj" "$cfiles" "$cenc_bytes" "${#DESTS[@]}"

  # ---------------------------------------------------------------- prune
  section "retention"
  if [ -n "${QBK_SKIP_PRUNE:-}" ]; then
    echo "skipped (QBK_SKIP_PRUNE)"
  else
    local -a all old
    local pfx kind
    for d in "${DESTS[@]}"; do
      for pfx in "$prefix" "$conf_prefix"; do
        kind="${pfx##*/}"
        mapfile -t all < <(rclone_run lsf --files-only "$d:${DBUCKET[$d]}/$pfx/daily" | sort)
        mapfile -t old < <(rclone_run lsf --files-only --min-age "${keep_daily}d" "$d:${DBUCKET[$d]}/$pfx/daily" | sort)
        printf '%s %s: %s daily copies, %s older than %s days\n' "$d" "$kind" "${#all[@]}" "${#old[@]}" "$keep_daily"
        if [ "${#old[@]}" -gt 0 ] && [ $(( ${#all[@]} - ${#old[@]} )) -ge 7 ]; then
          rclone_run delete --min-age "${keep_daily}d" "$d:${DBUCKET[$d]}/$pfx/daily"
          printf '%s %s: pruned %s old daily copies\n' "$d" "$kind" "${#old[@]}"
        elif [ "${#old[@]}" -gt 0 ]; then
          printf '%s %s: NOT pruning, it would leave fewer than 7 daily copies\n' "$d" "$kind"
        fi
        if rclone_run lsf --files-only "$d:${DBUCKET[$d]}/$pfx/monthly" >/dev/null 2>&1; then
          rclone_run delete --min-age "${keep_monthly}d" "$d:${DBUCKET[$d]}/$pfx/monthly" || true
        fi
      done
    done
  fi

  section "result"
  printf 'BACKUP_OK object=%s destinations=%s tables=%s rows=%s dump_bytes=%s encrypted_bytes=%s seconds=%s\n' \
    "$obj" "${#DESTS[@]}" "$tables" "$total_rows" "$dump_bytes" "$enc_bytes" "$(( $(date +%s) - started ))"
}

main </dev/null
exit 0
