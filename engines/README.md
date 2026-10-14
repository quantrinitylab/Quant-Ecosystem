# Quant Docs engines

On-device document previews for QuantMail Drive: PDF, Word, PowerPoint and Excel files are
rendered **in the user's browser** by WebAssembly engines running in a Web Worker. Nothing is
uploaded for rendering and no server pays for it; a crash or a hostile file can only take down
that worker, which the client restarts.

| Engine | Formats | Built on (upstream crates) |
|---|---|---|
| `quant-pdf` | PDF (incl. encrypted with a password) | [PdfCraft](https://github.com/storytold/pdfcraft) `pdfcraft-render` (hayro interpreter, vello_cpu) |
| `quant-word` | .docx .docm .dotx .doc .odt .rtf | [WordCraft](https://github.com/storytold/wordcraft) `wordcraft-engine` (import, layout, render) |
| `quant-slides` | .pptx .ppsx .pptm | [DeckCraft](https://github.com/storytold/deckcraft) `deckcraft-pptx`, `-format`, `-model`, `-render` |
| `quant-sheets` | .xlsx .xlsm .xltx .xls .xlsb .ods | [GridCraft](https://github.com/storytold/gridcraft) `gridcraft-engine` (import, recalculation, number formats) |

Each `quant-*` crate is a small typed adapter (wasm-bindgen) over the upstream engine crates —
we take the engines, not the desktop apps (`ui-egui`), the MCP servers or anything else.

## Contract (`engines/web/worker.js` ⇄ `apps/quantmail/src/lib/docs-engine/client.ts`)

- PDF / Word / Slides: `new Document(…)` → `pageCount`, `title`, `pageSizes()` (points),
  `render(page, scale)` → `{ width, height, takeRgba() }` — straight RGBA8, flattened on white.
- Sheets: `previewWorkbook(name, bytes, maxRows, maxCols)` → JSON: every visible sheet's
  displayed cell text (after a full recalculation, with number/date formats applied), merges,
  hidden rows/columns skipped, truncation flags.
- Errors are thrown with a stable code prefix: `E_PASSWORD`, `E_WRONG_PASSWORD`, `E_INVALID`,
  `E_UNSUPPORTED`, `E_RENDER`, `E_RANGE` (the worker adds `E_LOAD`, `E_TOO_LARGE`, `E_CRASH`;
  the client `E_TIMEOUT`, `E_WORKER`). The UI maps them to plain-language messages.

## Build

```sh
engines/build.sh <out-dir> [pdf word slides sheets]
```

Needs Rust (edition 2024; CI and Docker use 1.99.0) with the `wasm32-unknown-unknown` target
and `wasm-bindgen` CLI **0.2.129** (must equal the version in the `Cargo.lock` files). Output:
`<out-dir>/<VERSION>/…` plus `manifest.json` (sha256 per file). The QuantMail Docker image
builds the bundle in a parallel `engines` stage and copies it to
`public/engines/docs/<VERSION>/`; `next.config.js` serves `/engines/*` as immutable, so **bump
`VERSION` (and `DOCS_ENGINE_VERSION` in `apps/quantmail/src/lib/docs-engine/version.ts` — a test
keeps them equal) whenever the bundle changes.**

Sizes at 0.1.0 (raw / gzip): pdf 5.4 / 2.1 MB · word 20.3 / 7.5 MB (it embeds its fonts) ·
slides ≈ 4 / 1.5 MB · sheets 3.8 / 1.3 MB. Engines load lazily, per format, on first preview.

## Licensing guardrails

- Upstream engine code is **MIT OR Apache-2.0**. We use it under those terms, keep their
  copyright and NOTICE files (see `licenses/NOTICES.txt`, served next to the bundle and linked
  from the preview), and say "built on" — the ArtCraft names and logos are **not** licensed to
  us: no ArtCraft/PdfCraft/… branding in the product UI, and no claim of endorsement.
- Never depend on `storytold/artcraft-services` (no licence) or anything without a licence.
- `deny.toml` (cargo-deny) allows only permissive licences (+ OFL/UFL for embedded fonts), only
  crates.io and the pinned storytold repositories as sources, and fails on vulnerabilities.
  Run it for each crate before changing a lockfile:
  `cargo deny --manifest-path engines/quant-pdf/Cargo.toml check --config "$PWD/engines/deny.toml"`.
- `licenses/NOTICES.txt` is generated: `node engines/scripts/notices.mjs` (use `--check` in
  review). Regenerate it after any `Cargo.lock` change.
- `quant-slides` deliberately avoids `deckcraft-engine`: that crate also links DeckCraft's media
  stack (audio/video decoders — MPL-2.0 code and H.264/HEVC decoders) that a preview never needs.

## Pins and upstream sync

All upstream crates are git dependencies pinned by commit (`rev`), so builds are reproducible
and upstream changes arrive only by a reviewed bump:

| Repo | rev |
|---|---|
| storytold/pdfcraft | `c1a41cc5c7c2460fb60af880af69ee28a0c71bd5` |
| storytold/wordcraft | `04f6f53b8a4d8140c7bb62f949b0a6099a473da1` |
| storytold/deckcraft | `457406a7a5b62425e915926c8ccb0984e61a198c` |
| storytold/gridcraft | `84acf6293b1dc1fc09837524e035d674eb4d6741` |

To bump: change `rev` in the crate's `Cargo.toml` (PdfCraft: also its `[patch.crates-io]`
lines, which mirror upstream's vendored hayro/lopdf), `cargo update -p <crate>`, build, run
`cargo deny`, regenerate the notices, bump `VERSION`, and check the previews in Drive.

`shims/quick-xml-0.38` re-exports quick-xml 0.41 for `deckcraft-pptx`, which still asks for
the vulnerable 0.38 line (RUSTSEC-2026-0194/0195). Remove it once DeckCraft moves to ≥ 0.41.
