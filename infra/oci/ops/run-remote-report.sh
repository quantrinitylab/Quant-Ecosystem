#!/usr/bin/env bash
# Runs a local script on vm-app over SSH and prints ONLY an encrypted report.
#
#   run-remote-report.sh <local-script> [NAME=value ...]
#
# Environment: OCI_SSH_USER, VM_APP_IP, and the deploy key at ~/.ssh/oci-deploy (set up by the
# calling workflow). Optional: GITHUB_STEP_SUMMARY. Needs node on PATH.
#
# Why it exists: this repository is public, so Actions logs are too. Whatever the VM prints is
# scrubbed (infra/oci/ops/scrub-output.mjs), written to a file, sealed for the ops key
# (encrypt-report.mjs) and only the sealed block reaches the log. ssh's own messages are kept
# apart and shown, scrubbed, only when the run fails. If the public key is missing it fails
# closed. The script exits non-zero when the remote script did, after printing what it produced.

set -Eeuo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
script="${1:?usage: run-remote-report.sh <local-script> [NAME=value ...]}"
shift || true

: "${OCI_SSH_USER:?}" "${VM_APP_IP:?}"
[ -s "$script" ] || { echo "no such script: $script" >&2; exit 2; }
[ -s "$here/report-public-key.pem" ] || { echo 'report-public-key.pem is missing' >&2; exit 1; }

# Only plain NAME=value pairs made of safe characters travel to the remote shell.
assign=""
for a in "$@"; do
  [[ "$a" =~ ^[A-Z][A-Z0-9_]*=[A-Za-z0-9_.:@/+,=-]*$ ]] || { echo "refusing a remote assignment that is not NAME=safe-value" >&2; exit 2; }
  assign+="${a%%=*}='${a#*=}' "
done

work="$(mktemp -d)"
trap 'rm -rf -- "$work"' EXIT
plain="$work/report.txt"
err="$work/ssh-stderr.txt"

set +e
tr -d '\r' <"$script" \
  | ssh -i "$HOME/.ssh/oci-deploy" -o BatchMode=yes -o LogLevel=ERROR -o ConnectTimeout=15 -o ServerAliveInterval=15 \
      "$OCI_SSH_USER@$VM_APP_IP" "${assign}bash -s" 2>"$err" \
  | node "$here/scrub-output.mjs" >"$plain"
status=("${PIPESTATUS[@]}")
set -e

if [ -s "$plain" ]; then
  node "$here/encrypt-report.mjs" "$here/report-public-key.pem" <"$plain" >"$work/report.enc.txt"
  {
    echo "report: $(wc -l <"$plain") lines, $(wc -c <"$plain") bytes"
    echo "encrypted block sha256: $(sha256sum <"$work/report.enc.txt" | cut -d' ' -f1)"
    echo "decrypt with infra/oci/ops/decrypt-report.mjs and the private ops key"
  } | tee -a "${GITHUB_STEP_SUMMARY:-/dev/null}"
  cat "$work/report.enc.txt"
fi

if [ "${status[1]}" -ne 0 ] || [ "${status[2]}" -ne 0 ]; then
  echo "remote script exit ${status[1]}, scrubber exit ${status[2]}" >&2
  node "$here/scrub-output.mjs" <"$err" >&2 || true
  exit 1
fi
