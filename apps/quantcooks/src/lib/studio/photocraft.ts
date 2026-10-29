// ============================================================================
// QuantCooks Studio — layered photo editor embed bridge (checklist row #80,
// plan unit C-3: the PhotoCraft WASM embed inside Assets).
//
// What was VERIFIED against the actual release (Phase 1 of this unit,
// 2026-10-29; download + inspection isolated in
// ~/workspace/quantcooks-craft-spike/photocraft/, repo tree untouched):
//
//  - The pinned upstream web build is REAL. Release v0.17.0 (published
//    2026-10-28) ships `photocraft-web-0.17.0.zip` (12,955,028 bytes);
//    its sha256 matches the release's own SHA256SUMS.txt (see
//    PHOTOCRAFT_PIN below). Unzipped it is a pure static site (~13 MB):
//    index.html + a ~120 KB boot module + the app wasm-bindgen glue +
//    the app WebAssembly itself (28,982,124 bytes inflated) gzipped into
//    hashed "parts" (one 12,851,309-byte part today) listed in
//    app/parts.txt. The bundle is multi-MB, so this unit does NOT vendor
//    it into the repo tree; serving is a named follow-up (below).
//  - Embed mechanism (the build's own HOSTING.md): an <iframe> page.
//    Relative URLs, any path works; NO COOP/COEP isolation headers are
//    needed (no SharedArrayBuffer); .wasm must be served as
//    application/wasm and the parts byte-for-byte with no
//    Content-Encoding. Local static-serve smoke in Phase 1 returned 200
//    with the right MIME types for every file.
//  - Export surface — THE limiting fact: the official web build has NO
//    host-page export channel. `postMessage` occurs ZERO times in the
//    shipped JS glue and in the full inflated app wasm (strings scan);
//    HOSTING.md states it plainly: "Open uses the browser file picker;
//    Save and Export download files", and there is "no server-side
//    document storage, desktop TCP control server, or web autosave".
//    So the honest bridge is: the editor exports by BROWSER DOWNLOAD,
//    and this surface captures that downloaded file and saves it back
//    through the real P0-3 upload seam as a NEW asset (below). Any
//    tighter in-page hand-off needs an upstream/fork bridge build —
//    that is the companion-route follow-up, not something to fake.
//  - Agent/control surface on the WEB build: NONE (the MCP server, the
//    CLI and the authenticated loopback control channel are desktop
//    binaries; HOSTING.md confirms the web build has no control
//    server). This surface therefore names no QuantAI generation twin:
//    per checklist row #80, edits land via `quantcooks.upload_asset`
//    (save-back as a new asset), which is exactly the seam used here.
//  - License: dual MIT OR Apache-2.0 (LICENSE-MIT + LICENSE-APACHE +
//    NOTICE ship INSIDE the web zip itself); attribution is recorded
//    in photocraft-attribution.ts. Upstream name/wordmark/logos are
//    trademarks, NOT licensed — no upstream branding appears in any
//    QuantCooks surface; the UI calls this "Photo Editor".
//
// Serving state today: the verified bundle is not yet served from this
// app (populating the public path + the .wasm MIME/header rules are
// shared-config changes — named follow-ups F-C3-1/F-C3-2 in this unit's
// report). The bridge therefore PROBES the documented serving path for
// the build's own parts manifest before rendering any iframe, and the
// surface renders an honest not-served state (naming the blocker) until
// the probe passes. Nothing here pretends an editor exists that the
// browser cannot actually load.
// ============================================================================

import type { ServerAsset } from '../../services/api-client';

// ---------------------------------------------------------------------------
// The pinned upstream build (Phase 1 evidence; keep in step with the
// serving follow-up, which installs exactly this zip's contents).
// ---------------------------------------------------------------------------

export const PHOTOCRAFT_PIN = {
  version: '0.17.0',
  releaseZip: 'photocraft-web-0.17.0.zip',
  /** sha256 of the zip — matches the release's own SHA256SUMS.txt. */
  zipSha256: '9dbc979e138e83136d5958acd0cf7d1832aeae5095409eb4691dca577db5fc99',
  zipBytes: 12_955_028,
  /** The app WebAssembly, inflated from its gzipped parts (measured). */
  appWasmInflatedBytes: 28_982_124,
  license: 'MIT OR Apache-2.0',
} as const;

/**
 * Where the serving follow-up (F-C3-1) installs the verified zip's
 * contents: `apps/quantcooks/public/photo-editor/` — Next serves that
 * folder at this path, and the build's relative URLs work under any
 * prefix (its HOSTING.md, "Any path works"). Until that lands, the
 * probe below fails and the surface says so.
 */
export const PHOTO_EDITOR_BASE_PATH = '/photo-editor';

/** The build's own parts manifest — the probe's availability witness. */
export const PHOTO_EDITOR_PARTS_PATH = `${PHOTO_EDITOR_BASE_PATH}/app/parts.txt`;

/** First line of a genuine parts manifest (`photocraft-parts 1`). */
export const PHOTO_EDITOR_PARTS_MARKER = 'photocraft-parts';

/** The iframe page (the build fills the frame and follows its size). */
export function photoEditorSrc(basePath: string = PHOTO_EDITOR_BASE_PATH): string {
  return `${basePath}/index.html`;
}

/**
 * Iframe attributes exactly as the build's HOSTING.md prescribes:
 * `allow` for fullscreen + clipboard, and — if a sandbox is ever
 * applied — it must keep scripts, same-origin (storage), downloads
 * (Save/Export ARE browser downloads) and popups.
 */
export const PHOTO_EDITOR_IFRAME_ALLOW = 'fullscreen; clipboard-read; clipboard-write';
export const PHOTO_EDITOR_IFRAME_SANDBOX =
  'allow-scripts allow-same-origin allow-downloads allow-popups';

// ---------------------------------------------------------------------------
// The not-served blocker — the surface names this, never a fake editor.
// ---------------------------------------------------------------------------

export const PHOTO_EDITOR_NOT_SERVED = {
  code: 'PHOTO_EDITOR_NOT_SERVED',
  summary: 'The embedded photo editor is not served from QuantCooks yet.',
  detail:
    'The editor build itself is verified and pinned (see the version note), but its files are ' +
    'not installed on this app yet, so there is nothing honest to open. Once the serving step ' +
    'lands, this same screen opens the editor here and the save-back below works end to end.',
} as const;

// ---------------------------------------------------------------------------
// Availability probe. The build's HOSTING.md warns that a host answering
// every unknown path with index.html (an SPA fallback) "hides a failed
// upload" — so an HTTP 200 proves nothing. The probe fetches the parts
// manifest and requires its genuine first-line marker: an SPA fallback
// returns HTML, a missing install returns an error, and only a real
// install returns the marker. The fetcher is injected so the rule is
// unit-testable without a server.
// ---------------------------------------------------------------------------

export type PhotoEmbedProbe =
  | { status: 'available'; partsLine: string }
  | { status: 'unavailable'; reason: string };

export interface PhotoEmbedProbeDeps {
  /** Fetches a URL and resolves with its text body; rejects on failure. */
  fetchText: (url: string) => Promise<string>;
}

export async function probePhotoEditor(
  deps: PhotoEmbedProbeDeps,
  partsPath: string = PHOTO_EDITOR_PARTS_PATH,
): Promise<PhotoEmbedProbe> {
  let text: string;
  try {
    text = await deps.fetchText(partsPath);
  } catch (err) {
    return {
      status: 'unavailable',
      reason: err instanceof Error ? err.message : 'The editor files could not be reached.',
    };
  }
  const firstLine = text.split('\n')[0]?.trim() ?? '';
  if (firstLine.startsWith(PHOTO_EDITOR_PARTS_MARKER)) {
    return { status: 'available', partsLine: firstLine };
  }
  return {
    status: 'unavailable',
    reason:
      'The editor manifest did not answer with its expected first line — the files are ' +
      'missing, or the host answered with a fallback page instead of a real 404.',
  };
}

// ---------------------------------------------------------------------------
// Picking the source photo. Only a READY image can be edited: a PENDING
// asset has no bytes in storage yet, and a non-image has no place in a
// raster editor (the pickableToolAssets rule from Quick Tools).
// ---------------------------------------------------------------------------

export function pickablePhotoAssets(assets: ServerAsset[]): ServerAsset[] {
  return assets.filter((a) => a.type === 'image' && a.uploadStatus === 'READY');
}

// ---------------------------------------------------------------------------
// Save-back. The editor's only export is a browser download (Phase 1
// evidence above), so the flow is: the user exports in the editor, the
// downloaded file is handed to this surface, and save-back uploads it
// through the real P0-3 seam as a NEW asset in the SOURCE asset's
// project. The source asset is only ever READ (id / projectId /
// filename) — it is never mutated, overwritten or deleted, and the
// outcome carries its id as `derivedFromAssetId` so the lineage is
// explicit rather than implied.
// ---------------------------------------------------------------------------

/** Mirrors the backend P0-3 upload cap (ASSET_MAX_UPLOAD_BYTES, 512 MiB). */
export const PHOTO_SAVE_MAX_BYTES = 512 * 1024 * 1024;

export type PhotoExportFormat = 'png' | 'jpeg' | 'webp' | 'psd';

const FORMAT_BY_CONTENT_TYPE: Record<string, PhotoExportFormat> = {
  'image/png': 'png',
  'image/jpeg': 'jpeg',
  'image/webp': 'webp',
  'image/vnd.adobe.photoshop': 'psd',
};

const FORMAT_BY_EXTENSION: Record<string, PhotoExportFormat> = {
  png: 'png',
  jpg: 'jpeg',
  jpeg: 'jpeg',
  webp: 'webp',
  psd: 'psd',
};

const EXTENSION_BY_FORMAT: Record<PhotoExportFormat, string> = {
  png: 'png',
  jpeg: 'jpg',
  webp: 'webp',
  psd: 'psd',
};

export interface PhotoFileLike {
  name: string;
  type: string;
  size: number;
}

/**
 * Which export format a downloaded file is, from its content type
 * first and its extension second (browsers give .psd downloads an
 * empty or generic type). Null = not an export this surface accepts.
 */
export function resolvePhotoExportFormat(file: PhotoFileLike): PhotoExportFormat | null {
  const byType = FORMAT_BY_CONTENT_TYPE[file.type];
  if (byType) return byType;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return FORMAT_BY_EXTENSION[ext] ?? null;
}

/** `thali.jpg` + png → `thali-edited.png` — the copy is named as a copy. */
export function derivedPhotoFilename(source: ServerAsset, format: PhotoExportFormat): string {
  const base = source.filename.replace(/\.[^.]+$/, '') || 'photo';
  return `${base}-edited.${EXTENSION_BY_FORMAT[format]}`;
}

export type PhotoSavePlan =
  | { ok: true; filename: string; format: PhotoExportFormat }
  | { ok: false; message: string };

/** Pure validation + naming for one save-back. No I/O. */
export function planPhotoSaveBack(source: ServerAsset, file: PhotoFileLike): PhotoSavePlan {
  if (source.uploadStatus !== 'READY' || source.type !== 'image') {
    return { ok: false, message: 'Pick a ready image first — only a finished upload can be edited.' };
  }
  const format = resolvePhotoExportFormat(file);
  if (!format) {
    return {
      ok: false,
      message: `"${file.name}" is not an editor export this screen can save — export as PNG, JPEG, WebP or PSD.`,
    };
  }
  if (file.size <= 0) {
    return { ok: false, message: `"${file.name}" is empty — the export did not produce a file.` };
  }
  if (file.size > PHOTO_SAVE_MAX_BYTES) {
    return { ok: false, message: `"${file.name}" is larger than the 512 MB upload limit.` };
  }
  return { ok: true, filename: derivedPhotoFilename(source, format), format };
}

export type PhotoSaveBackOutcome =
  | { status: 'saved'; asset: ServerAsset; derivedFromAssetId: string }
  | { status: 'error'; message: string };

export interface PhotoSaveBackDeps {
  /**
   * The real P0-3 upload (the page wires useAssetUpload). Receives the
   * renamed copy file and the SOURCE asset's project id; resolves with
   * the NEW asset row the backend created.
   */
  upload: (projectId: string, file: File) => Promise<ServerAsset>;
  /** Builds the renamed copy File from the downloaded export. */
  renameFile: (file: File, filename: string) => File;
}

/**
 * Runs one save-back. Errors from the seam pass through untouched — a
 * STORAGE_NOT_CONFIGURED 503 reaches the user as itself, never dressed
 * up as a generic failure (the established studio rule).
 */
export async function runPhotoSaveBack(
  source: ServerAsset,
  file: File,
  deps: PhotoSaveBackDeps,
): Promise<PhotoSaveBackOutcome> {
  const plan = planPhotoSaveBack(source, file);
  if (!plan.ok) return { status: 'error', message: plan.message };
  try {
    const copy = deps.renameFile(file, plan.filename);
    const asset = await deps.upload(source.projectId, copy);
    return { status: 'saved', asset, derivedFromAssetId: source.id };
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'The save-back upload failed.',
    };
  }
}

/** Save-back phases the surface renders; no percentage is ever invented. */
export type PhotoSavePhase = 'idle' | 'working' | 'error' | 'saved';

export function photoSavePhaseLabel(phase: PhotoSavePhase): string | null {
  if (phase === 'working') return 'Saving the copy — sending it to storage and confirming it landed…';
  if (phase === 'error') return 'That copy did not land.';
  if (phase === 'saved') return 'Saved as a new asset in this project. The original is untouched.';
  return null;
}
