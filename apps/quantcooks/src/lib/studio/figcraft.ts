// ============================================================================
// QuantCooks Studio — Design Studio "Screens" embed bridge (plan unit C-7,
// steps 1–3: serving, the library home, the Screens editor screen; the
// step-4 backend companion is DEFERRED until CP-1 closes the contract).
//
// What was VERIFIED against the actual release (the C-7 spike, 2026-10-29;
// download + inspection isolated in ~/workspace/quantcooks-craft-spike/
// figcraft/, binaries actually run there):
//
//  - The pinned upstream web build is REAL. Release v0.12.1 (published
//    2026-10-28) ships `figcraft-web-0.12.1.zip` (9,913,496 bytes); its
//    sha256 matches the release's own SHA256SUMS.txt (FIGCRAFT_PIN
//    below). Unzipped it is a plain static bundle: 40 files, 25,677,236
//    bytes — one wasm (25,314,039 bytes) + wasm-bindgen glue + a stock
//    trunk index.html + the vendor's HOSTING.md/_headers + licenses.
//    Step 1 of this unit installed exactly those bytes, diff-verified,
//    at public/design-editor/0.12.1/ (the versioned path the spike
//    recommends: hashed asset names make versioned paths safe, and a
//    future engine version lands as a sibling, never an in-place swap).
//  - Embed mechanism (the build's own HOSTING.md): an <iframe> page is
//    the sanctioned embed. Relative URLs, any path prefix; NO COOP/COEP
//    needed (no SharedArrayBuffer); .wasm MUST be served as
//    application/wasm; hashed assets immutable; index.html no-cache.
//    next.config.js carries those rules, scoped to /design-editor.
//  - Host bridge — THE limiting fact, confirmed three ways in the
//    spike: the web build has NO host-page channel (`postMessage`
//    occurs 0 times in the shipped JS and wasm; HOSTING.md: "The
//    editor runs entirely on the visitor's device. The web build
//    starts with one new document; there is no desktop TCP control
//    server, and native file dialogs aren't wired up yet"). So the
//    host cannot push a document into the editor and cannot pull bytes
//    out of it. The only bridge is the C-3 download-capture shape: the
//    editor's Save arrives as a BROWSER DOWNLOAD, and this surface
//    captures that file and saves it back through the real P0-3 upload
//    seam as a NEW asset version (below). No sync is ever implied.
//  - Agent/control surface on the WEB build: NONE. QuantAI control
//    rides the headless desktop CLI/MCP companion against the document
//    files — proven live in the spike (615 commands, 18 MCP tools,
//    real documents and exports) — and lands as build step 4, AFTER
//    CP-1 closes the tool contract. Until then NO QuantAI twin is
//    claimed for this surface; the eval's proposed names
//    (quantcooks.create_design / quantcooks.export_design) stay
//    PROPOSED, pending CP-1 ratification, and appear in no UI copy.
//  - Native format: `.figcraft` (registered MIME application/x-figcraft)
//    — a ZIP holding document.json (deflated) + thumbnail.png (stored,
//    in the spike's real saved file). The library below reads the REAL
//    embedded thumbnail out of the zip; a design without a readable
//    one shows an honest placeholder, never a stock image.
//  - Design-document detection, reconciled against the landed backend:
//    the client ServerAsset shape carries NO metadata, and the
//    backend's typeFromContentType('application/x-figcraft') yields
//    the useless top-level token 'application'. The only client-visible
//    witness of a design document is therefore its filename — which is
//    also the format's own registered glob (`*.figcraft`). Detection
//    below is: READY + filename ends .figcraft. (The spike's §7.3
//    metadata {kind:'design-document'} can only land with a backend
//    change; CP-1 owns the backend right now.)
//  - License: dual MIT OR Apache-2.0 (LICENSE-MIT + LICENSE-APACHE +
//    NOTICE + the OFL font texts ship INSIDE the web zip itself);
//    attribution is recorded in figcraft-attribution.ts. The upstream
//    name/wordmark/logos are trademarks, NOT licensed — no upstream
//    branding appears in any QuantCooks surface; the UI calls this
//    "Design Studio". One recorded remainder: the hosted index.html is
//    served byte-for-byte (this unit's mandate), so its <title> and
//    loading line still carry the upstream name inside the frame —
//    the same honesty category as the in-wasm name (275 strings,
//    not strippable from a release binary); QuantCooks' own chrome
//    around the frame carries QuantCooks naming only.
// ============================================================================

import type { ServerAsset } from '../../services/api-client';

// ---------------------------------------------------------------------------
// The pinned upstream build (spike evidence; the serving install in
// step 1 of this unit installs exactly this zip's contents).
// ---------------------------------------------------------------------------

export const FIGCRAFT_PIN = {
  version: '0.12.1',
  releaseZip: 'figcraft-web-0.12.1.zip',
  /** sha256 of the zip — matches the release's own SHA256SUMS.txt. */
  zipSha256: '8f52f52d4897d35b14c2a347c44ab6362b60b93d6a2f54a17d218111b9006c37',
  zipBytes: 9_913_496,
  /** The extracted bundle: file count and total bytes (measured). */
  bundleFiles: 40,
  bundleBytes: 25_677_236,
  /** The single WebAssembly binary inside the bundle (measured). */
  wasmBytes: 25_314_039,
  wasmFile: 'figcraft-web-44d2aabb268291d5_bg.wasm',
  license: 'MIT OR Apache-2.0',
} as const;

/**
 * Where the serving step installed the verified bundle:
 * `apps/quantcooks/public/design-editor/0.12.1/` — the versioned path
 * the spike recommends. Next serves that folder at this path, and the
 * build's relative URLs work under any prefix (its HOSTING.md).
 */
export const DESIGN_EDITOR_BASE_PATH = `/design-editor/${FIGCRAFT_PIN.version}`;

/** The iframe page (the build fills the frame and follows its size). */
export const DESIGN_EDITOR_INDEX_PATH = `${DESIGN_EDITOR_BASE_PATH}/index.html`;

export function designEditorSrc(basePath: string = DESIGN_EDITOR_BASE_PATH): string {
  return `${basePath}/index.html`;
}

/**
 * The probe's availability witness: the genuine trunk index.html names
 * its canvas `figcraft_canvas`. An SPA-fallback answer (a host serving
 * the app shell for unknown paths) never contains it, and a missing
 * install errors — so this marker separates a real install from both.
 */
export const DESIGN_EDITOR_INDEX_MARKER = 'figcraft_canvas';

/**
 * Iframe attributes per the build's HOSTING.md recipe:
 * `allow="fullscreen; clipboard-read; clipboard-write"`, and — if a
 * sandbox is applied — at least `allow-scripts allow-same-origin
 * allow-popups`; `allow-downloads` is added because the editor's Save
 * IS a browser download (the C-3 sandbox shape).
 */
export const DESIGN_EDITOR_IFRAME_ALLOW = 'fullscreen; clipboard-read; clipboard-write';
export const DESIGN_EDITOR_IFRAME_SANDBOX =
  'allow-scripts allow-same-origin allow-downloads allow-popups';

// ---------------------------------------------------------------------------
// The not-served blocker — the surface names this, never a fake editor.
// ---------------------------------------------------------------------------

export const DESIGN_EDITOR_NOT_SERVED = {
  code: 'DESIGN_EDITOR_NOT_SERVED',
  summary: 'The embedded design editor is not served from QuantCooks yet.',
  detail:
    'The editor build itself is verified and pinned (see the version note), but its files are ' +
    'not installed on this app yet, so there is nothing honest to open. The serving step ' +
    `installs the pinned bundle at public${DESIGN_EDITOR_BASE_PATH}/ with the header rules ` +
    'from its hosting guide (.wasm as application/wasm, hashed assets immutable, index ' +
    'revalidated) — once that lands, this same screen opens the editor here.',
} as const;

// ---------------------------------------------------------------------------
// Availability probe. A host answering every unknown path with an app
// shell (an SPA fallback) makes an HTTP 200 prove nothing, so the probe
// fetches the editor's index page and requires its genuine canvas
// marker. The fetcher is injected so the rule is unit-testable.
// ---------------------------------------------------------------------------

export type DesignEmbedProbe =
  | { status: 'available'; markerLine: string }
  | { status: 'unavailable'; reason: string };

export interface DesignEmbedProbeDeps {
  /** Fetches a URL and resolves with its text body; rejects on failure. */
  fetchText: (url: string) => Promise<string>;
}

export async function probeDesignEditor(
  deps: DesignEmbedProbeDeps,
  indexPath: string = DESIGN_EDITOR_INDEX_PATH,
): Promise<DesignEmbedProbe> {
  let text: string;
  try {
    text = await deps.fetchText(indexPath);
  } catch (err) {
    return {
      status: 'unavailable',
      reason: err instanceof Error ? err.message : 'The editor files could not be reached.',
    };
  }
  const markerAt = text.indexOf(DESIGN_EDITOR_INDEX_MARKER);
  if (markerAt >= 0) {
    const lineStart = text.lastIndexOf('\n', markerAt) + 1;
    const lineEnd = text.indexOf('\n', markerAt);
    const markerLine = text.slice(lineStart, lineEnd >= 0 ? lineEnd : undefined).trim();
    return { status: 'available', markerLine };
  }
  return {
    status: 'unavailable',
    reason:
      'The editor index page did not answer with its expected canvas marker — the files are ' +
      'missing, or the host answered with a fallback page instead of a real 404.',
  };
}

// ---------------------------------------------------------------------------
// Design documents. A design document is an EditAsset whose file is the
// native .figcraft zip (see the header for why the filename is the
// client-visible witness). Only a READY asset has bytes to open or to
// read a thumbnail from; a PENDING one is still landing in storage.
// ---------------------------------------------------------------------------

export const DESIGN_DOCUMENT_EXTENSION = '.figcraft';
export const DESIGN_DOCUMENT_CONTENT_TYPE = 'application/x-figcraft';

export function isDesignDocument(asset: ServerAsset): boolean {
  return (
    asset.uploadStatus === 'READY' &&
    asset.filename.toLowerCase().endsWith(DESIGN_DOCUMENT_EXTENSION)
  );
}

/** The caller's design documents, in the order the API returned them. */
export function designDocuments(assets: ServerAsset[]): ServerAsset[] {
  return assets.filter(isDesignDocument);
}

/** `menu-screen.figcraft` → `menu-screen` — the card's display name. */
export function designDisplayName(asset: ServerAsset): string {
  return asset.filename.replace(/\.figcraft$/i, '') || asset.filename;
}

/** The Screens editor route for a design asset id (or the reserved new id). */
export const NEW_DESIGN_ID = 'new';

export function designEditorRoute(designId: string): string {
  return `/studio/design/screens/${designId}`;
}

// ---------------------------------------------------------------------------
// Minimal ZIP reader — just enough of the format to pull one named
// entry out of a .figcraft file in the browser: End-Of-Central-
// Directory scan, central directory walk, local header, stored +
// deflate entries. Anything unexpected is a named corrupt verdict,
// never a silent empty result. Inflation goes through the platform
// DecompressionStream ('deflate-raw'); the seam is injectable so the
// rule is unit-testable without a browser.
// ---------------------------------------------------------------------------

export interface ZipEntryDeps {
  /** Inflates one raw-deflate stream; rejects on invalid data. */
  inflateRaw?: (data: Uint8Array) => Promise<Uint8Array>;
}

export async function defaultInflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new DecompressionStream('deflate-raw');
  const writer = stream.writable.getWriter();
  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  const pump = (async () => {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
  })();
  await writer.write(data);
  await writer.close();
  await pump;
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

export type ZipEntryResult =
  | { status: 'ok'; bytes: Uint8Array }
  | { status: 'missing' }
  | { status: 'corrupt'; reason: string };

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const EOCD_MIN_BYTES = 22;
const MAX_ZIP_COMMENT = 65_535;

export async function readZipEntry(
  zip: Uint8Array,
  entryName: string,
  deps: ZipEntryDeps = {},
): Promise<ZipEntryResult> {
  if (zip.length < EOCD_MIN_BYTES) {
    return { status: 'corrupt', reason: 'The file is too small to be a ZIP archive.' };
  }
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);

  // Find the End Of Central Directory record (it sits at the very end,
  // followed only by an optional comment of up to 64 KiB).
  let eocd = -1;
  const scanFloor = Math.max(0, zip.length - EOCD_MIN_BYTES - MAX_ZIP_COMMENT);
  for (let i = zip.length - EOCD_MIN_BYTES; i >= scanFloor; i--) {
    if (view.getUint32(i, true) === EOCD_SIGNATURE) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) {
    return { status: 'corrupt', reason: 'No ZIP end-of-directory record — not a ZIP archive.' };
  }
  const entryCount = view.getUint16(eocd + 10, true);
  let cursor = view.getUint32(eocd + 16, true);

  for (let n = 0; n < entryCount; n++) {
    if (cursor + 46 > zip.length || view.getUint32(cursor, true) !== CENTRAL_SIGNATURE) {
      return { status: 'corrupt', reason: 'The ZIP central directory is truncated or malformed.' };
    }
    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const nameStart = cursor + 46;
    if (nameStart + nameLength > zip.length) {
      return { status: 'corrupt', reason: 'The ZIP central directory is truncated or malformed.' };
    }
    const name = new TextDecoder().decode(zip.subarray(nameStart, nameStart + nameLength));
    cursor = nameStart + nameLength + extraLength + commentLength;
    if (name !== entryName) continue;

    if (localOffset + 30 > zip.length || view.getUint32(localOffset, true) !== LOCAL_SIGNATURE) {
      return { status: 'corrupt', reason: `The entry "${entryName}" has a malformed local header.` };
    }
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    if (dataStart + compressedSize > zip.length) {
      return { status: 'corrupt', reason: `The entry "${entryName}" is truncated.` };
    }
    const raw = zip.subarray(dataStart, dataStart + compressedSize);
    let bytes: Uint8Array;
    if (method === 0) {
      bytes = new Uint8Array(raw);
    } else if (method === 8) {
      try {
        bytes = await (deps.inflateRaw ?? defaultInflateRaw)(raw);
      } catch {
        return { status: 'corrupt', reason: `The entry "${entryName}" could not be inflated.` };
      }
    } else {
      return {
        status: 'corrupt',
        reason: `The entry "${entryName}" uses unsupported compression (method ${method}).`,
      };
    }
    if (bytes.length !== uncompressedSize) {
      return {
        status: 'corrupt',
        reason:
          `The entry "${entryName}" decoded to ${bytes.length} bytes but the archive ` +
          `declares ${uncompressedSize}.`,
      };
    }
    return { status: 'ok', bytes };
  }
  return { status: 'missing' };
}

// ---------------------------------------------------------------------------
// The embedded thumbnail. A .figcraft file carries a real rendered
// preview at thumbnail.png (the spike's saved document: 30,027 bytes,
// stored). Reading it needs no renderer and no companion — but a file
// without one, or one whose bytes are not really a figcraft zip, is a
// named state, never a stock image.
// ---------------------------------------------------------------------------

export const FIGCRAFT_THUMBNAIL_ENTRY = 'thumbnail.png';

export type FigcraftThumbnail =
  | { status: 'ready'; png: Uint8Array }
  | { status: 'missing' }
  | { status: 'corrupt'; reason: string };

export async function extractFigcraftThumbnail(
  zip: Uint8Array,
  deps: ZipEntryDeps = {},
): Promise<FigcraftThumbnail> {
  const entry = await readZipEntry(zip, FIGCRAFT_THUMBNAIL_ENTRY, deps);
  if (entry.status === 'missing') return { status: 'missing' };
  if (entry.status === 'corrupt') return { status: 'corrupt', reason: entry.reason };
  if (entry.bytes.length === 0) {
    return { status: 'corrupt', reason: 'The embedded thumbnail entry is empty.' };
  }
  return { status: 'ready', png: entry.bytes };
}

// ---------------------------------------------------------------------------
// Save-back. The editor's only export is a browser download (evidence
// in the header), so the flow is: the user saves in the editor, the
// downloaded .figcraft file is handed to this surface, and save-back
// uploads it through the real P0-3 seam as a NEW asset. For an existing
// design the copy lands in the SOURCE asset's project as its next
// version, named as a copy, with the outcome carrying the source id as
// `derivedFromAssetId`; the source is only ever READ. For a brand-new
// design there is no source: the user picks which of their projects
// the design belongs to, and the downloaded file keeps its own name.
// Nothing here implies the editor and QuantCooks sync — they do not.
// ---------------------------------------------------------------------------

/** Mirrors the backend P0-3 upload cap (ASSET_MAX_UPLOAD_BYTES, 512 MiB). */
export const DESIGN_SAVE_MAX_BYTES = 512 * 1024 * 1024;

export interface DesignFileLike {
  name: string;
  type: string;
  size: number;
}

/**
 * Whether a downloaded file is a design document this surface accepts:
 * the .figcraft extension is the primary witness (browsers hand
 * downloads of this format an empty or generic content type); the
 * registered MIME type is accepted as the second witness.
 */
export function isFigcraftFile(file: DesignFileLike): boolean {
  return (
    file.name.toLowerCase().endsWith(DESIGN_DOCUMENT_EXTENSION) ||
    file.type === DESIGN_DOCUMENT_CONTENT_TYPE
  );
}

/** `menu-screen.figcraft` → `menu-screen-edited.figcraft` — named as a copy. */
export function derivedDesignFilename(source: ServerAsset): string {
  const base = source.filename.replace(/\.figcraft$/i, '') || 'design';
  return `${base}-edited${DESIGN_DOCUMENT_EXTENSION}`;
}

export type DesignSavePlan =
  | { ok: true; projectId: string; filename: string; derivedFromAssetId: string | null }
  | { ok: false; message: string };

export interface DesignSaveBackRequest {
  /** The design being continued; null when this is a brand-new design. */
  source: ServerAsset | null;
  /** The project a NEW design belongs to (ignored when source is set). */
  targetProjectId?: string | null;
  file: DesignFileLike;
}

/** Pure validation + naming for one save-back. No I/O. */
export function planDesignSaveBack(request: DesignSaveBackRequest): DesignSavePlan {
  const { source, file } = request;
  if (source && !isDesignDocument(source)) {
    return {
      ok: false,
      message: 'The design being continued is not a ready design document — reopen it from the library.',
    };
  }
  if (!isFigcraftFile(file)) {
    return {
      ok: false,
      message: `"${file.name}" is not a design file this screen can save — the editor saves designs as .figcraft files.`,
    };
  }
  if (file.size <= 0) {
    return { ok: false, message: `"${file.name}" is empty — the editor did not produce a file.` };
  }
  if (file.size > DESIGN_SAVE_MAX_BYTES) {
    return { ok: false, message: `"${file.name}" is larger than the 512 MB upload limit.` };
  }
  if (source) {
    return {
      ok: true,
      projectId: source.projectId,
      filename: derivedDesignFilename(source),
      derivedFromAssetId: source.id,
    };
  }
  const targetProjectId = request.targetProjectId ?? null;
  if (!targetProjectId) {
    return {
      ok: false,
      message: 'Pick the project this new design belongs to first — designs are stored as project assets.',
    };
  }
  return {
    ok: true,
    projectId: targetProjectId,
    filename: file.name.toLowerCase().endsWith(DESIGN_DOCUMENT_EXTENSION)
      ? file.name
      : `untitled-design${DESIGN_DOCUMENT_EXTENSION}`,
    derivedFromAssetId: null,
  };
}

export type DesignSaveBackOutcome =
  | { status: 'saved'; asset: ServerAsset; derivedFromAssetId: string | null }
  | { status: 'error'; message: string };

export interface DesignSaveBackDeps {
  /**
   * The real P0-3 upload (the page wires useAssetUpload). Receives the
   * renamed copy file and the target project id; resolves with the NEW
   * asset row the backend created.
   */
  upload: (projectId: string, file: File) => Promise<ServerAsset>;
  /** Builds the renamed copy File from the downloaded design file. */
  renameFile: (file: File, filename: string) => File;
}

/**
 * Runs one save-back. Errors from the seam pass through untouched — a
 * STORAGE_NOT_CONFIGURED 503 reaches the user as itself, never dressed
 * up as a generic failure (the established studio rule). A .figcraft
 * download's File.type is often empty, so the renamed copy is stamped
 * with the format's registered content type: the signed PUT must carry
 * exactly the type the upload was requested with.
 */
export async function runDesignSaveBack(
  request: DesignSaveBackRequest & { file: File },
  deps: DesignSaveBackDeps,
): Promise<DesignSaveBackOutcome> {
  const plan = planDesignSaveBack(request);
  if (!plan.ok) return { status: 'error', message: plan.message };
  try {
    const copy = deps.renameFile(request.file, plan.filename);
    const asset = await deps.upload(plan.projectId, copy);
    return { status: 'saved', asset, derivedFromAssetId: plan.derivedFromAssetId };
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'The save-back upload failed.',
    };
  }
}

/** Save-back phases the surface renders; no percentage is ever invented. */
export type DesignSavePhase = 'idle' | 'working' | 'error' | 'saved';

export function designSavePhaseLabel(phase: DesignSavePhase): string | null {
  if (phase === 'working') return 'Saving the design — sending it to storage and confirming it landed…';
  if (phase === 'error') return 'That design copy did not land.';
  if (phase === 'saved') return 'Saved as a new asset. The previous version is untouched.';
  return null;
}
