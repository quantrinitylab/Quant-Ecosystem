#!/usr/bin/env bash
# Tests for infra/oci/secrets/sync-secrets.sh. No network, no sudo, no docker: the script runs against a temp file
# with QSYNC_SUDO empty. What matters here is that a value can never leak into output and that nothing outside the
# allowlist or outside the expected format can reach the file.
#
# No `set -e` on purpose: every check records its own pass/fail and the run ends with a summary.
# shellcheck disable=SC2319  # `report $?` deliberately reads the status of the condition on the line before it
set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
script="$here/sync-secrets.sh"
work="$(mktemp -d)"
trap 'rm -rf -- "$work"' EXIT
pass=0
fail=0
out=""
rc=0

ok() { pass=$((pass + 1)); printf 'ok   - %s\n' "$1"; }
bad() { fail=$((fail + 1)); printf 'FAIL - %s\n' "$1"; }
# report <status of the condition just evaluated> <description>
report() { if [ "$1" -eq 0 ]; then ok "$2"; else bad "$2"; fi; }

KEY_ID='ABCDEF0123456789ABCDEF0123456789'
SECRET='0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
ACCT='0123456789abcdef0123456789abcdef'
OLD1='OLDOLDOLDOLDOLDOLDOLDOLD'
OLD2='OLDOLDOLDOLDOLDOLDOLDTWO'
is_linux=no
[ "$(uname -s)" = Linux ] && is_linux=yes

fresh_env() {
  rm -f -- "$work"/secrets.env*
  printf '%s\n' '# header comment' 'DATABASE_URL=postgresql://u:p@db:5432/x' 'export JWT_SECRET=keep-me-as-is' \
    'DRIVE_S3_BUCKET=old-bucket' "R2_ACCESS_KEY_ID=$OLD1" >"$work/secrets.env"
  chmod 640 "$work/secrets.env"
}
# run <pairs text> [NAME=value overrides for the script's environment]
run() {
  printf '%s' "$1" >"$work/pairs"
  out="$(env QSYNC_ENV_FILE="$work/secrets.env" QSYNC_SUDO='' QSYNC_TMPDIR="$work" QSYNC_INPUT="$work/pairs" QSYNC_RESTART=none "${@:2}" bash "$script" 2>&1)"
  rc=$?
}
count_baks() { find "$work" -maxdepth 1 -name 'secrets.env.bak-*' | wc -l | tr -d ' '; }
file_has() { grep -qxF -- "$1" "$work/secrets.env"; }
file_lacks() { ! grep -qF -- "$1" "$work/secrets.env"; }
out_has() { grep -qF -- "$1" <<<"$out"; }
out_lacks() { ! grep -qF -- "$1" <<<"$out"; }

bash -n "$script"; report $? 'script passes bash -n'

# ------------------------------------------------------------------ a normal run
fresh_env
run "R2_ACCESS_KEY_ID=$KEY_ID
R2_SECRET_ACCESS_KEY=$SECRET
CLOUDFLARE_R2_ACCOUNT_ID=$ACCT
"
[ "$rc" -eq 0 ] && out_has 'SYNC_OK pairs=3 changed=yes'; report $? 'a valid run exits 0 and says SYNC_OK'
file_has "R2_ACCESS_KEY_ID=$KEY_ID"; report $? 'an existing key is updated in place'
file_has "R2_SECRET_ACCESS_KEY=$SECRET" && file_has "CLOUDFLARE_R2_ACCOUNT_ID=$ACCT"; report $? 'new keys are appended'
file_lacks "$OLD1"; report $? 'the old value is gone'
file_has '# header comment' && file_has 'DATABASE_URL=postgresql://u:p@db:5432/x' && file_has 'DRIVE_S3_BUCKET=old-bucket'; report $? 'comments and untouched lines survive'
file_has 'export JWT_SECRET=keep-me-as-is'; report $? 'an export prefix on an untouched line survives'
out_lacks "$SECRET" && out_lacks "$KEY_ID" && out_lacks "$ACCT"; report $? 'no value appears in the output'
[ "$(count_baks)" = 1 ]; report $? 'exactly one backup was written'
[ ! -e "$work/pairs" ]; report $? 'the pairs file is deleted afterwards'
if [ "$is_linux" = yes ]; then
  [ "$(stat -c %a "$work/secrets.env")" = 640 ]; report $? 'the file mode is preserved (640)'
  [ "$(stat -c %a "$work"/secrets.env.bak-*)" = 600 ]; report $? 'the backup is 0600'
else
  printf 'skip - file mode checks need Linux (this is %s)\n' "$(uname -s)"
fi

# ------------------------------------------------------------------ idempotent
before="$(cat "$work/secrets.env")"
run "R2_ACCESS_KEY_ID=$KEY_ID
"
out_has 'unchanged' && [ "$(count_baks)" = 1 ] && [ "$before" = "$(cat "$work/secrets.env")" ]; report $? 'a repeat run reports unchanged and writes no new backup'

# ------------------------------------------------------------------ rejections leave the file alone
fresh_env
snapshot="$(cat "$work/secrets.env")"
run "SOME_OTHER_NAME=$KEY_ID
"
[ "$rc" -ne 0 ] && out_has 'name not allowed' && [ "$snapshot" = "$(cat "$work/secrets.env")" ]; report $? 'a name outside the allowlist is rejected'
run "R2_ACCESS_KEY_ID=short
"
[ "$rc" -ne 0 ] && out_has 'expected format' && out_lacks '=short' && [ "$snapshot" = "$(cat "$work/secrets.env")" ]; report $? 'a value in the wrong format is rejected and only its length is shown'
run "R2_SECRET_ACCESS_KEY=${SECRET:0:20} ${SECRET:20:20} ${SECRET:40:20}
"
[ "$rc" -ne 0 ] && [ "$snapshot" = "$(cat "$work/secrets.env")" ]; report $? 'a value with spaces is rejected'
run "R2_SECRET_ACCESS_KEY=\$(touch $work/pwned)${SECRET:0:30}
"
[ "$rc" -ne 0 ] && [ ! -e "$work/pwned" ]; report $? 'command substitution in a value is rejected and never runs'
run "R2_ACCESS_KEY_ID=$KEY_ID
R2_ACCESS_KEY_ID=$KEY_ID
"
[ "$rc" -ne 0 ] && out_has 'given twice'; report $? 'the same name twice is rejected'
run "this is not a pair
"
[ "$rc" -ne 0 ] && out_has 'not NAME=value'; report $? 'a malformed line is rejected'
run ""
[ "$rc" -ne 0 ]; report $? 'an empty pairs file is rejected'
[ ! -e "$work/pairs" ]; report $? 'the pairs file is deleted even after a failure'
run "R2_ACCESS_KEY_ID=$KEY_ID
" QSYNC_RESTART=sideways
[ "$rc" -ne 0 ] && out_has 'QSYNC_RESTART'; report $? 'an unknown QSYNC_RESTART is rejected'
[ "$snapshot" = "$(cat "$work/secrets.env")" ]; report $? 'after all those rejections the file is still byte-for-byte the original'

# ------------------------------------------------------------------ duplicates in the target file collapse to one
fresh_env
printf '%s\n' "R2_ACCESS_KEY_ID=$OLD2" >>"$work/secrets.env"
run "R2_ACCESS_KEY_ID=$KEY_ID
"
[ "$(grep -c '^R2_ACCESS_KEY_ID=' "$work/secrets.env")" = 1 ] && file_has "R2_ACCESS_KEY_ID=$KEY_ID"; report $? 'a duplicate definition in the file collapses to the new value'

# ------------------------------------------------------------------ backups are capped at five
fresh_env
all_ok=yes
for i in 1 2 3 4 5 6 7 8; do
  run "BACKUP_S3_REGION=auto
DRIVE_R2_BUCKET=bucket-number-$i
" QSYNC_TS="20261108T00000${i}Z"
  [ "$rc" -eq 0 ] || { printf '%s\n' "$out"; all_ok=no; }
done
[ "$all_ok" = yes ]; report $? 'eight consecutive changing runs all succeed'
[ "$(count_baks)" = 5 ]; report $? 'at most five backups are kept'

printf '\n%s passed, %s failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
