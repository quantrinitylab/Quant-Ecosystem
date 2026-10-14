#!/usr/bin/env bash
# Builds the Quant Docs engine bundle that QuantMail serves from /engines/docs/<VERSION>/:
#
#   <out>/<VERSION>/pdf|word|slides|sheets/   wasm-bindgen (--target web) module + .wasm
#   <out>/<VERSION>/worker.js, fonts.js       the engine Web Worker (engines/web/)
#   <out>/<VERSION>/fonts/                    font files the worker hands to the slides engine
#                                             (engines/fonts/fonts.txt) + their licences, index.json
#   <out>/<VERSION>/licenses/NOTICES.txt      third-party notices (engines/licenses/)
#   <out>/<VERSION>/manifest.json             version, wasm-bindgen version, sha256 + size per file
#
# Usage: engines/build.sh <out-dir> [pdf word slides sheets]   (default: all four)
#
# Needs cargo with the wasm32-unknown-unknown target and the wasm-bindgen CLI at exactly the
# version locked in the engines' Cargo.lock files (override the binary with WASM_BINDGEN=…).
# Builds are --locked: dependency changes go through Cargo.lock review (and cargo-deny).
#
# The fonts are downloaded from the craft-fonts commit pinned in engines/fonts/fonts.txt and
# checked against their sha256; CRAFT_FONTS_CHECKOUT=<dir> reads them from a local checkout of
# that commit instead. (CRAFT_FONTS_DIR is not used: the upstream build scripts would compile
# fonts into the .wasm files, which serve them as separate files.)
set -euo pipefail
unset CRAFT_FONTS_DIR CRAFT_FONTS_REQUIRED

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

# Fonts for the slides engine: fonts/<folder>/<file> + OFL.txt per folder, and fonts/index.json
# ({ family, style, file } per face) for the worker.
build_fonts() {
  local list="$HERE/fonts/fonts.txt" rev family style file licfile sum tmp out first=1
  rev="$(awk '$1 == "rev" { print $2; exit }' "$list")"
  [ -n "$rev" ] || { echo "no rev line in $list" >&2; exit 1; }
  rm -rf "${DEST:?}/fonts"
  mkdir -p "$DEST/fonts"
  tmp="$(mktemp)"
  printf '{\n  "source": "https://github.com/storytold/craft-fonts/tree/%s",\n  "fonts": [\n' "$rev" > "$DEST/fonts/index.json"
  while IFS=$'\t' read -r family style file licfile sum; do
    if [ -n "${CRAFT_FONTS_CHECKOUT:-}" ]; then
      cp "$CRAFT_FONTS_CHECKOUT/$file" "$tmp"
    else
      curl -fsSL --retry 3 -o "$tmp" "https://raw.githubusercontent.com/storytold/craft-fonts/$rev/$file"
    fi
    echo "$sum  $tmp" | sha256sum -c --quiet - || { echo "sha256 mismatch: $file" >&2; exit 1; }
    out="${file#fonts/}"
    mkdir -p "$DEST/fonts/$(dirname "$out")"
    cp "$tmp" "$DEST/fonts/$out"
    cp "$HERE/fonts/licenses/${licfile#fonts/}" "$DEST/fonts/${licfile#fonts/}"
    [ "$first" -eq 1 ] || printf ',\n' >> "$DEST/fonts/index.json"
    first=0
    printf '    { "family": "%s", "style": "%s", "file": "%s" }' "$family" "$style" "$out" >> "$DEST/fonts/index.json"
  done < <(awk -F' [|] ' '!/^#/ && NF >= 8 { print $1 "\t" $2 "\t" $3 "\t" $6 "\t" $7 }' "$list")
  printf '\n  ]\n}\n' >> "$DEST/fonts/index.json"
  rm -f "$tmp"
  echo "==> fonts: $(find "$DEST/fonts" -name '*.ttf' | wc -l | tr -d ' ') files, $(du -sh "$DEST/fonts" | cut -f1)"
}
case " ${ENGINES[*]} " in *" slides "*) build_fonts ;; esac

cp "$HERE/web/worker.js" "$HERE/web/fonts.js" "$DEST/"
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
