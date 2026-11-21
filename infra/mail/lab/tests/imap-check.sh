#!/usr/bin/env bash
# T6: IMAP login and fetch with curl (imaps on 993).
#   TEST_HOST=mail.lab.quantrinity.in TEST_BOB=bob@lab.quantrinity.in TEST_BOB_PASSWORD=... ./imap-check.sh
# Set TEST_INSECURE=1 to accept a self-signed certificate (before ACME has issued one).
set -uo pipefail

HOST="${TEST_HOST:-mail.lab.quantrinity.in}"
USER_="${TEST_BOB:-bob@lab.quantrinity.in}"
PASS_="${TEST_BOB_PASSWORD:?set TEST_BOB_PASSWORD}"
PORT="${TEST_IMAPS_PORT:-993}"
CURL_OPTS=(--silent --show-error --max-time 30 --user "${USER_}:${PASS_}")
if [ "${TEST_INSECURE:-0}" = 1 ]; then CURL_OPTS+=(--insecure); fi
BASE="imaps://${HOST}:${PORT}"
rc=0

check() { # check <name> <command...>
  local name="$1"; shift
  local out
  if out="$("$@" 2>&1)"; then
    echo "PASS ${name} - $(printf '%s' "$out" | head -n 1 | cut -c1-100)"
  else
    echo "FAIL ${name} - $(printf '%s' "$out" | head -n 1 | cut -c1-160)"
    rc=1
  fi
}

check "IMAP login and LIST of mailboxes" curl "${CURL_OPTS[@]}" "${BASE}/"
check "SELECT INBOX and SEARCH ALL" curl "${CURL_OPTS[@]}" "${BASE}/INBOX" --request "SEARCH ALL"
check "FETCH message 1 headers" curl "${CURL_OPTS[@]}" "${BASE}/INBOX;MAILINDEX=1;SECTION=HEADER"
check "wrong password is refused" bash -c '! curl --silent --max-time 30 '"$([ "${TEST_INSECURE:-0}" = 1 ] && echo --insecure)"' --user "'"${USER_}"':definitely-wrong" "'"${BASE}"'/" >/dev/null 2>&1'
exit "$rc"
