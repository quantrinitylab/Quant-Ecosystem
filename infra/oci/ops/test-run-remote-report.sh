#!/usr/bin/env bash
# Tests run-remote-report.sh with a fake ssh and a throwaway key pair. No network, no secrets.
# Runs in CI (.github/workflows/db-backup-test.yml) and works in Git Bash on Windows.
set -Eeuo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
T="$(mktemp -d)"
trap 'rm -rf -- "$T"' EXIT

pass() { printf 'PASS  %s\n' "$*"; }
fail() { printf 'FAIL  %s\n' "$*" >&2; exit 1; }

# A private copy of the tooling, with its own key pair, so the real public key is never touched.
mkdir -p "$T/ops" "$T/bin" "$T/home/.ssh"
for f in run-remote-report.sh scrub-output.mjs encrypt-report.mjs decrypt-report.mjs; do cp "$SRC/$f" "$T/ops/$f"; done
# Paths inside `node -e` are not translated by Git Bash on Windows, so convert them explicitly.
winpath() { if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else printf '%s' "$1"; fi; }
PUB_OUT="$(winpath "$T/ops/report-public-key.pem")" PRIV_OUT="$(winpath "$T/private.pem")" node -e "
const { generateKeyPairSync } = require('node:crypto');
const fs = require('node:fs');
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 3072,
  publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
fs.writeFileSync(process.env.PUB_OUT, publicKey);
fs.writeFileSync(process.env.PRIV_OUT, privateKey);
"

cat >"$T/bin/ssh" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$@" >"${FAKE_SSH_ARGS:-/dev/null}"
cat >/dev/null
case "${FAKE_SSH_MODE:-ok}" in
  fail)
    echo "opc@80.225.234.186: Permission denied (publickey). contact bob@example.com" >&2
    exit 255 ;;
  partial)
    echo "stage one done"
    echo "SECRET-MARKER-12345 bob@example.com"
    echo "stage two exploded" >&2
    exit 3 ;;
  *)
    echo "## host"
    echo "SECRET-MARKER-12345 owner bob@example.com token ghp_abcdefghijklmnopqrstuvwxyz0123456789ABCD"
    exit 0 ;;
esac
EOF
chmod +x "$T/bin/ssh"
printf 'echo remote-script\n' >"$T/script.sh"

export PATH="$T/bin:$PATH" HOME="$T/home" OCI_SSH_USER=opc VM_APP_IP=80.225.234.186
export GITHUB_STEP_SUMMARY="$T/summary.md" FAKE_SSH_ARGS="$T/ssh-args.txt"
: >"$GITHUB_STEP_SUMMARY"

run() { # <mode> [assignments...]  -> sets OUT ERR RC
  local mode="$1"; shift
  set +e
  OUT="$(FAKE_SSH_MODE="$mode" bash "$T/ops/run-remote-report.sh" "$T/script.sh" "$@" 2>"$T/err.txt")"
  RC=$?
  set -e
  ERR="$(cat "$T/err.txt")"
}

echo "== success"
run ok FOO=bar BAZ=1.2.3
[ "$RC" -eq 0 ] || fail "success path exited $RC: $ERR"
pass 'exit 0'
grep -q 'BEGIN QUANT OPS REPORT' <<<"$OUT" || fail 'no encrypted block printed'
pass 'encrypted block printed'
if grep -q -e 'SECRET-MARKER-12345' -e 'bob@example.com' -e 'ghp_' <<<"$OUT"; then fail 'plaintext reached stdout'; fi
if grep -q 'SECRET-MARKER-12345' "$GITHUB_STEP_SUMMARY"; then fail 'plaintext reached the step summary'; fi
pass 'no plaintext in stdout or the step summary'
grep -q -e "FOO='bar'" -e "BAZ='1.2.3'" "$T/ssh-args.txt" || fail 'assignments were not passed to the remote shell'
grep -q 'bash -s' "$T/ssh-args.txt" || fail 'remote command is not bash -s'
pass 'assignments reach the remote shell as quoted NAME=value'
printf '%s\n' "$OUT" >"$T/printed.txt"
node "$T/ops/decrypt-report.mjs" "$T/private.pem" "$T/printed.txt" >"$T/decrypted.txt"
grep -q 'SECRET-MARKER-12345' "$T/decrypted.txt" || fail 'the block does not decrypt to the report'
if grep -q -e 'bob@example.com' -e 'ghp_abcdefghijklmnopqrstuvwxyz' "$T/decrypted.txt"; then fail 'the scrubber did not run before encryption'; fi
grep -q '<email>' "$T/decrypted.txt" || fail 'scrubber output not found'
pass 'decrypts with the private key; e-mail and token were masked before sealing'

echo "== remote failure with no output (connection refused, bad key)"
run fail
[ "$RC" -ne 0 ] || fail 'a failed ssh exited 0'
if grep -q 'BEGIN QUANT OPS REPORT' <<<"$OUT"; then fail 'a block was printed although nothing was produced'; fi
grep -q 'remote script exit 255' <<<"$ERR" || fail 'the exit code was not reported'
grep -q 'Permission denied' <<<"$ERR" || fail 'ssh error text was not shown'
if grep -q 'bob@example.com' <<<"$ERR"; then fail 'e-mail address leaked through the error text'; fi
pass 'fails, reports the exit code, shows the ssh message scrubbed'

echo "== remote script fails after producing output"
run partial
[ "$RC" -ne 0 ] || fail 'a failing remote script exited 0'
grep -q 'BEGIN QUANT OPS REPORT' <<<"$OUT" || fail 'the partial output was not preserved'
printf '%s\n' "$OUT" >"$T/printed2.txt"
node "$T/ops/decrypt-report.mjs" "$T/private.pem" "$T/printed2.txt" | grep -q 'stage one done' || fail 'partial block does not decrypt'
if grep -q 'bob@example.com' <<<"$OUT"; then fail 'plaintext leaked on the partial path'; fi
pass 'partial output is kept (sealed) and the run still fails'

echo "== unsafe assignment is refused"
set +e
bash "$T/ops/run-remote-report.sh" "$T/script.sh" "FOO=bar; touch $T/pwned" >/dev/null 2>"$T/err2.txt"
RC=$?
set -e
[ "$RC" -eq 2 ] || fail "expected exit 2 for an unsafe assignment, got $RC"
[ ! -e "$T/pwned" ] || fail 'the unsafe assignment executed'
pass 'unsafe assignment refused before any ssh call'

echo "== missing public key fails closed"
mv "$T/ops/report-public-key.pem" "$T/ops/key.bak"
run ok
[ "$RC" -ne 0 ] || fail 'missing key did not fail'
if grep -q 'SECRET-MARKER-12345' <<<"$OUT"; then fail 'plaintext printed without a key'; fi
pass 'fails closed without the public key'

echo
echo "ALL PASSED"
