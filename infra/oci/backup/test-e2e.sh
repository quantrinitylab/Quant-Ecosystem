#!/usr/bin/env bash
# End-to-end test of backup-db.sh against local services. Runs in CI (.github/workflows/db-backup-test.yml).
# Needs: docker, age, curl. Everything is throwaway and torn down on exit.
#
# What it proves:
#   * a dump of a database with the vector extension is restored, compared and encrypted to a public key
#   * the uploaded object decrypts with the matching private key into a valid archive
#   * no password or secret key appears in the script's output
#   * nothing is left behind: no restore container, no plaintext dump in /var/tmp
#   * the retention guard refuses to prune below 7 copies
#   * bad inputs (malformed recipient, unreachable database) fail and upload nothing

set -Eeuo pipefail
cd "$(dirname "$0")/../../.."

T="$(mktemp -d)"
cleanup() {
  docker rm -f qbk-src qbk-s3 >/dev/null 2>&1 || true
  sudo rm -rf -- "$T" 2>/dev/null || rm -rf -- "$T" || true
}
trap cleanup EXIT

pin() { grep -oP "^$1='\K[^']+" infra/oci/backup/backup-db.sh; }
PGVECTOR_IMAGE="$(pin PGVECTOR_IMAGE)"
RCLONE_IMAGE="$(pin RCLONE_IMAGE)"
PG_IMAGE="$(pin PG_IMAGE)"

pass() { printf 'PASS  %s\n' "$*"; }
fail() { printf 'FAIL  %s\n' "$*" >&2; exit 1; }
# Work directories are qbk.XXXXXX; the lock file /var/tmp/qbk.lock is a file, not a directory.
leftover_dirs() { find /var/tmp -maxdepth 1 -type d -name 'qbk.*' 2>/dev/null || true; }

echo "== source database (pgvector) with sample data"
docker run -d --name qbk-src -e POSTGRES_PASSWORD=srcpw-9f3a -e POSTGRES_DB=quantdb -p 127.0.0.1:55433:5432 "$PGVECTOR_IMAGE" >/dev/null
for _ in $(seq 1 90); do
  docker exec qbk-src pg_isready -h 127.0.0.1 -U postgres -d quantdb -q 2>/dev/null && break
  sleep 1
done
docker exec qbk-src pg_isready -h 127.0.0.1 -U postgres -d quantdb -q || fail 'source database did not start'
docker exec -i qbk-src psql -U postgres -d quantdb -v ON_ERROR_STOP=1 -q >/dev/null <<'SQL'
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE _prisma_migrations (id text PRIMARY KEY, migration_name text, finished_at timestamptz DEFAULT now());
INSERT INTO _prisma_migrations SELECT 'm' || g, lpad(g::text, 4, '0') || '_x' FROM generate_series(1, 121) g;
DO $$
BEGIN
  FOR i IN 1..12 LOOP
    EXECUTE format('CREATE TABLE t%s (id serial PRIMARY KEY, v text, n int)', i);
    EXECUTE format('INSERT INTO t%s (v, n) SELECT md5(g::text), g FROM generate_series(1, %s) g', i, i * 150);
    EXECUTE format('CREATE INDEX t%s_v ON t%s (v)', i, i);
  END LOOP;
END $$;
CREATE TABLE docs (id serial PRIMARY KEY, embedding vector(3), body text);
INSERT INTO docs (embedding, body) SELECT ARRAY[g, g + 1, g + 2]::vector, md5(g::text) FROM generate_series(1, 400) g;
SQL
pass 'source database ready'

echo "== S3 stand-in (rclone serve s3 over a directory)"
mkdir -p "$T/s3/quant-bucket"
docker run -d --name qbk-s3 --network host -v "$T/s3:/data" "$RCLONE_IMAGE" \
  serve s3 /data --addr 127.0.0.1:9000 --auth-key AKIATESTACCESS,TestSecretKey-77b1 >/dev/null
for _ in $(seq 1 30); do curl -s -o /dev/null http://127.0.0.1:9000/ && break; sleep 1; done
curl -s -o /dev/null http://127.0.0.1:9000/ || fail 'the S3 stand-in did not start'
pass 'S3 stand-in ready'

age-keygen -o "$T/key.txt" 2>/dev/null
RECIPIENT="$(age-keygen -y "$T/key.txt")"
AGE_BIN="$(command -v age)"

cat >"$T/secrets.env" <<EOF
DATABASE_URL=postgresql://postgres:srcpw-9f3a@127.0.0.1:55433/quantdb?schema=public&connection_limit=5&sslmode=disable
DRIVE_S3_ENDPOINT=http://127.0.0.1:9000
DRIVE_S3_BUCKET=quant-bucket
DRIVE_S3_ACCESS_KEY_ID=AKIATESTACCESS
DRIVE_S3_SECRET_ACCESS_KEY=TestSecretKey-77b1
DRIVE_S3_REGION=us-east-1
DRIVE_S3_FORCE_PATH_STYLE=true
EOF

run_backup() { # <out-prefix> [env assignments...]
  local out="$1"; shift
  env "$@" QBK_ENV_FILE="$T/secrets.env" QBK_AGE_BIN="$AGE_BIN" QBK_RESTORE_TMPFS=512m \
    bash infra/oci/backup/backup-db.sh >"$T/$out.out" 2>"$T/$out.err"
}
DAILY="$T/s3/quant-bucket/_ops/backups/pg/daily"

echo "== run 1: happy path"
run_backup run1 QBK_AGE_RECIPIENT="$RECIPIENT" || { cat "$T/run1.out" "$T/run1.err"; fail 'backup run 1 failed'; }
grep -q '^BACKUP_OK ' "$T/run1.out" || { cat "$T/run1.out"; fail 'no BACKUP_OK line'; }
pass 'run 1 finished with BACKUP_OK'
grep -E 'tables compared|restored in|uploaded and verified' "$T/run1.out" | sed 's/^/      /'

OBJ="$(ls "$DAILY"/*.dump.age | head -n1)"
[ -s "$OBJ" ] || fail 'no encrypted object was uploaded'
age -d -i "$T/key.txt" "$OBJ" >"$T/plain.dump"
[ "$(head -c 5 "$T/plain.dump")" = "PGDMP" ] || fail 'decrypted object is not a pg_dump archive'
pass 'object decrypts with the private key into a pg_dump archive'
EXPECTED_SHA="$(sed -n 's/^plain sha256: //p' "$T/run1.out")"
[ "$(sha256sum <"$T/plain.dump" | cut -d' ' -f1)" = "$EXPECTED_SHA" ] || fail 'plaintext checksum differs from the one the script reported'
pass 'plaintext checksum matches the reported one'
TABLES="$(docker run --rm -i "$PG_IMAGE" pg_restore --list <"$T/plain.dump" | grep -c ' TABLE DATA ')"
[ "$TABLES" -ge 14 ] || fail "expected at least 14 TABLE DATA entries, found $TABLES"
pass "archive lists $TABLES tables with data"
! head -c 2000 "$OBJ" | grep -q 'PGDMP' || fail 'the stored object looks like plaintext'
pass 'stored object is not plaintext'

if grep -E 'srcpw-9f3a|TestSecretKey-77b1|AKIATESTACCESS' "$T/run1.out" "$T/run1.err" >/dev/null; then fail 'a secret appeared in the output'; fi
pass 'no password or key in stdout or stderr'

[ -z "$(docker ps -aq --filter name=qbk-restore)" ] || fail 'a restore container was left behind'
[ -z "$(leftover_dirs)" ] || fail 'a work directory with the plaintext dump was left behind'
pass 'nothing left behind (no restore container, no work directory)'

echo "== run 2: second object, retention guard"
sleep 1
run_backup run2 QBK_AGE_RECIPIENT="$RECIPIENT" QBK_KEEP_DAILY_DAYS=0 || { cat "$T/run2.out" "$T/run2.err"; fail 'backup run 2 failed'; }
COUNT="$(ls "$DAILY"/*.dump.age | wc -l)"
[ "$COUNT" -eq 2 ] || fail "expected 2 objects after two runs, found $COUNT"
grep -q 'NOT pruning' "$T/run2.out" || { cat "$T/run2.out"; fail 'the prune guard did not refuse to go below 7 copies'; }
pass 'two objects kept; prune refused to drop below 7 copies'

echo "== drill link: printed in parts that survive the report scrubber"
run_backup run3 QBK_AGE_RECIPIENT="$RECIPIENT" QBK_PRESIGN_MINUTES=5 QBK_SKIP_PRUNE=1 || { cat "$T/run3.out" "$T/run3.err"; fail 'backup run 3 failed'; }
PARTS="$(sed -n 's/^  link-part [0-9][0-9]: //p' "$T/run3.out")"
[ -n "$PARTS" ] || { cat "$T/run3.out"; fail 'no link parts were printed'; }
LINK="$(printf '%s' "$PARTS" | tr -d '\n')"
case "$LINK" in
  http://127.0.0.1:9000/quant-bucket/_ops/backups/pg/daily/*X-Amz-Signature=*) ;;
  *) fail "the joined parts do not form a signed URL: ${LINK:0:70}" ;;
esac
pass 'the joined parts form a signed URL'
node infra/oci/ops/scrub-output.mjs <"$T/run3.out" >"$T/run3.scrubbed"
SCRUBBED_LINK="$(sed -n 's/^  link-part [0-9][0-9]: //p' "$T/run3.scrubbed" | tr -d '\n')"
[ "$SCRUBBED_LINK" = "$LINK" ] || fail 'the report scrubber altered the link'
pass 'the report scrubber leaves every link part intact'
if curl -fsS -o "$T/via-link.age" "$LINK" 2>/dev/null; then
  OBJ3="$(sed -n 's/^object: //p' "$T/run3.out")"
  cmp -s "$T/via-link.age" "$DAILY/$OBJ3" || fail 'the link returned different bytes than the stored object'
  pass 'the link downloads exactly the stored object'
else
  echo "NOTE  the S3 stand-in does not serve presigned URLs; the download is proven against the real endpoint in the drill"
fi

echo "== bad inputs fail and upload nothing"
BEFORE="$(ls "$DAILY"/*.dump.age | wc -l)"
if run_backup bad1 QBK_AGE_RECIPIENT='not-a-recipient'; then fail 'a malformed recipient was accepted'; fi
pass 'malformed recipient rejected'
sed -i 's#@127.0.0.1:55433/#@127.0.0.1:1/#' "$T/secrets.env"
if run_backup bad2 QBK_AGE_RECIPIENT="$RECIPIENT"; then fail 'an unreachable database was accepted'; fi
pass 'unreachable database rejected'
AFTER="$(ls "$DAILY"/*.dump.age | wc -l)"
[ "$BEFORE" -eq "$AFTER" ] || fail 'a failed run uploaded an object'
pass 'failed runs uploaded nothing'
[ -z "$(leftover_dirs)" ] || fail 'a failed run left a work directory behind'
pass 'failed runs cleaned up'

echo
echo "ALL PASSED"
