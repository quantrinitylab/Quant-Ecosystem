#!/usr/bin/env bash
# Prepare the already-configured deploy key. Never print or re-encode it.
set -euo pipefail

if [ "$#" -ne 1 ] || [ -z "$1" ]; then
  echo 'Usage: prepare-oci-deploy-key.sh <key-file>' >&2
  exit 1
fi
if [ -z "${OCI_DEPLOY_SSH_KEY:-}" ]; then
  echo 'OCI_DEPLOY_SSH_KEY is empty; deployment stopped before SSH.' >&2
  exit 1
fi

# GitHub secret entry may omit the final LF or use Windows CRLF. OpenSSH
# rejects an otherwise valid OpenSSH private key without its final LF with
# "error in libcrypto". Do not try to decode base64, literal \\n, or repair
# truncated/encrypted keys: invalid configuration must still fail closed.
key_file="$1"
umask 077
temporary_key="$(mktemp "${key_file}.XXXXXX")"
trap 'rm -f -- "$temporary_key"' EXIT
normalized_key="${OCI_DEPLOY_SSH_KEY//$'\r'/}"
printf '%s\n' "$normalized_key" > "$temporary_key"

# -P '' is deliberately non-interactive. The unattended workflow cannot
# unlock an encrypted key; no public/private key material reaches the log.
if ! ssh-keygen -y -P '' -f "$temporary_key" >/dev/null 2>&1; then
  echo 'OCI_DEPLOY_SSH_KEY is not a valid unencrypted private key; deployment stopped before SSH. Re-save the complete authorized key in oci-staging; do not paste it into logs or issues.' >&2
  exit 1
fi

chmod 600 "$temporary_key"
mv -f -- "$temporary_key" "$key_file"
