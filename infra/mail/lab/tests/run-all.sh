#!/usr/bin/env bash
# Runs the automated lab tests in order and prints one PASS/FAIL line per check.
# Needs Node 18+ and curl. Environment: see ../../.env.example ("local test client settings").
#   TEST_ALICE_PASSWORD=... TEST_BOB_PASSWORD=... ./run-all.sh
# The load test is skipped unless LOAD=1 (it sends 2000 messages).
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
rc=0
run() { echo "== $*"; "$@" || rc=1; }

run node smtp-inbound.mjs
run node smtp-submit.mjs
run node gtube.mjs
run node jmap-suite.mjs
run ./imap-check.sh
if [ "${LOAD:-0}" = 1 ]; then run node load-test.mjs 2000 4; fi
echo "== done (exit ${rc})"
exit "$rc"
