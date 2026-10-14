#!/usr/bin/env bash
# Builds the Quant Docs engine bundle that QuantMail serves from /engines/docs/<VERSION>/:
#
#   <out>/<VERSION>/pdf|word|slides|sheets/   wasm-bindgen (--target web) module + .wasm
#   <out>/<VERSION>/worker.js                 the engine Web Worker (engines/web/worker.js)
#   <out>/<VERSION>/licenses/NOTICES.txt      third-party notices (engines/licenses/)
#   <out>/<VERSION>/manifest.json             version, wasm-bindgen version, sha256 + size per file
#
# Usage: engines/build.sh <out-dir> [pdf word slides sheets]   (default: all four)
#
# Needs cargo with the wasm32-unknown-unknown target and the wasm-bindgen CLI at exactly the
# version locked in the engines' Cargo.lock files (override the binary with WASM_BINDGEN=…).
# Builds are --locked: dependency changes go through Cargo.lock review (and cargo-deny).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="${1:?usage: engines/build.sh <out-dir> [pdf word slides sheets]}"
shift
if [ "$#" -gt 0 ]; then ENGINES=("$@"); else ENGINES=(pdf word slides sheets); fi
VERSION="$(tr -d '[:space:]' < "$HERE/VERSION")"
DEST="$OUT/$VERSION"
WASM_BINDGEN="${WASM_BINDGEN:-wasm-bindgen}"
export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-$HERE/target}"

locked_bindgen() { awk '/^name = "wasm-bindgen"$/ { getline; gsub(/"/, "", $3); print $3; exit }' "$HERE/quant-$1/Cargo.lock"; }
CLI_VERSION="$("$WASM_BINDGEN" --version | awk '{ print $2 }')"
for e in "${ENGINES[@]}"; do
  [ -f "$HERE/quant-$e/Cargo.toml" ] || { echo "unknown engine: $e" >&2; exit 2; }
  locked="$(locked_bindgen "$e")"
  if [ "$locked" != "$CLI_VERSION" ]; then
    echo "wasm-bindgen CLI $CLI_VERSION does not match wasm-bindgen $locked locked by quant-$e" >&2
    exit 1
  fi
done

mkdir -p "$DEST"
for e in "${ENGINES[@]}"; do
  echo "==> quant-$e"
  start=$SECONDS
  cargo build --locked --release --target wasm32-unknown-unknown --manifest-path "$HERE/quant-$e/Cargo.toml"
  rm -rf "${DEST:?}/$e"
  "$WASM_BINDGEN" --target web --no-typescript --out-dir "$DEST/$e" \
    "$CARGO_TARGET_DIR/wasm32-unknown-unknown/release/quant_${e}_engine.wasm"
  echo "    $(du -h "$DEST/$e/quant_${e}_engine_bg.wasm" | cut -f1) in $((SECONDS - start))s"
done

cp "$HERE/web/worker.js" "$DEST/worker.js"
mkdir -p "$DEST/licenses"
cp "$HERE/licenses/NOTICES.txt" "$DEST/licenses/NOTICES.txt"

# manifest.json: what was built, with hashes (handy to verify a deployed bundle).
{
  printf '{\n  "version": "%s",\n  "wasmBindgen": "%s",\n  "files": {\n' "$VERSION" "$CLI_VERSION"
  first=1
  while IFS= read -r f; do
    rel="${f#./}"
    sum="$(sha256sum "$DEST/$rel" | cut -d' ' -f1)"
    size="$(wc -c < "$DEST/$rel" | tr -d ' ')"
    [ "$first" -eq 1 ] || printf ',\n'
    first=0
    printf '    "%s": { "sha256": "%s", "bytes": %s }' "$rel" "$sum" "$size"
  done < <(cd "$DEST" && find . -type f ! -name manifest.json | LC_ALL=C sort)
  printf '\n  }\n}\n'
} > "$DEST/manifest.json"
echo "==> $DEST"
