#!/usr/bin/env bash
# Tests housekeeping-vm-app.sh with a fake docker. Decides which images may go, never touches real Docker.
# Runs in CI (.github/workflows/db-backup-test.yml) and works in Git Bash on Windows.
set -Eeuo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
T="$(mktemp -d)"
trap 'rm -rf -- "$T"' EXIT
pass() { printf 'PASS  %s\n' "$*"; }
fail() { printf 'FAIL  %s\n' "$*" >&2; exit 1; }

mkdir -p "$T/bin" "$T/state"
GOOD=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
PREV=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
OLD1=cccccccccccccccccccccccccccccccccccccccc
OLD2=dddddddddddddddddddddddddddddddddddddddd
NEW1=eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee
BUSY=ffffffffffffffffffffffffffffffffffffffff
printf '%s' "$GOOD" >"$T/state/.last-good-tag"
printf '%s\n' "$PREV" >"$T/state/.prev-tag"

# repo:tag|id  (what `docker image ls --format` prints)
cat >"$T/images.txt" <<EOF
ghcr.io/quantrinitylab/quant-oci-quantmail-backend:$GOOD|id1
ghcr.io/quantrinitylab/quant-oci-quantmail-backend:$PREV|id2
ghcr.io/quantrinitylab/quant-oci-quantmail-backend:$OLD1|id3
ghcr.io/quantrinitylab/quant-oci-quantai:$OLD2|id4
ghcr.io/quantrinitylab/quant-oci-quantchat:$NEW1|id5
ghcr.io/quantrinitylab/quant-oci-quantchat-backend:$BUSY|id6
caddy:2-alpine|id7
redis:7-alpine|id8
EOF
now="$(date +%s)"
iso() { date -u -d "@$1" +%Y-%m-%dT%H:%M:%S.000000000Z; }
cat >"$T/created.txt" <<EOF
ghcr.io/quantrinitylab/quant-oci-quantmail-backend:$GOOD|$(iso $((now - 40 * 86400)))
ghcr.io/quantrinitylab/quant-oci-quantmail-backend:$PREV|$(iso $((now - 30 * 86400)))
ghcr.io/quantrinitylab/quant-oci-quantmail-backend:$OLD1|$(iso $((now - 20 * 86400)))
ghcr.io/quantrinitylab/quant-oci-quantai:$OLD2|$(iso $((now - 9 * 86400)))
ghcr.io/quantrinitylab/quant-oci-quantchat:$NEW1|$(iso $((now - 2 * 86400)))
ghcr.io/quantrinitylab/quant-oci-quantchat-backend:$BUSY|$(iso $((now - 15 * 86400)))
caddy:2-alpine|$(iso $((now - 400 * 86400)))
redis:7-alpine|$(iso $((now - 400 * 86400)))
EOF
echo "ghcr.io/quantrinitylab/quant-oci-quantchat-backend:$BUSY" >"$T/inuse.txt"
: >"$T/removed.txt"

cat >"$T/bin/docker" <<'EOF'
#!/usr/bin/env bash
case "$1 ${2:-}" in
  "ps "*) exit 0 ;;
  "image ls") cat "$FAKE_IMAGES" ;;
  "image inspect") ref="${*: -1}"; grep -F "$ref|" "$FAKE_CREATED" | head -n1 | cut -d'|' -f2 ;;
  "image rm")
    ref="$3"
    if grep -qxF "$ref" "$FAKE_INUSE"; then echo "Error: conflict: image is being used by a container" >&2; exit 1; fi
    echo "$ref" >>"$FAKE_REMOVED" ;;
  "image prune") exit 0 ;;
  "system df") echo "TYPE TOTAL ACTIVE SIZE RECLAIMABLE" ;;
  *) exit 0 ;;
esac
EOF
chmod +x "$T/bin/docker"

export PATH="$T/bin:$PATH" FAKE_IMAGES="$T/images.txt" FAKE_CREATED="$T/created.txt" FAKE_INUSE="$T/inuse.txt" FAKE_REMOVED="$T/removed.txt"
OUT="$(QHK_STATE_DIR="$T/state" QHK_MAX_AGE_DAYS=7 bash "$SRC/housekeeping-vm-app.sh" 2>"$T/err.txt")" || { cat "$T/err.txt"; fail "script exited non-zero"; }

removed="$(cat "$T/removed.txt")"
has() { grep -qF "$1" <<<"$removed"; }
has "quant-oci-quantmail-backend:$OLD1" || fail 'an old unprotected image was not removed'
pass 'old, unprotected, unused image removed'
has "quant-oci-quantai:$OLD2" || fail 'a 9-day-old image was not removed'
pass 'image older than the limit removed'
! has "$GOOD" || fail 'the last-good tag was removed'
! has "$PREV" || fail 'the previous tag was removed'
pass 'rollback tags (.last-good-tag and .prev-tag) are protected even when old'
! has "$NEW1" || fail 'a recent image was removed'
pass 'recent image kept'
! has "$BUSY" || fail 'an image in use was removed'
grep -q "still used" <<<"$OUT" || fail 'an in-use image was not reported'
pass 'image in use is refused by docker and reported, not forced'
! has 'caddy' && ! has 'redis' || fail 'a third-party image was touched'
pass 'third-party images are never candidates'
grep -q 'removed: 2 | protected: 2 | newer than 7 days: 1 | in use: 1' <<<"$OUT" || { echo "$OUT"; fail 'summary line is not as expected'; }
pass 'summary counts add up'

set +e
QHK_STATE_DIR="$T/state" QHK_MAX_AGE_DAYS='7; rm -rf /' bash "$SRC/housekeeping-vm-app.sh" >/dev/null 2>&1
rc=$?
set -e
[ "$rc" -ne 0 ] || fail 'a malformed age limit was accepted'
pass 'malformed age limit rejected'

echo
echo "ALL PASSED"
