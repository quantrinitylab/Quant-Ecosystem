// ============================================================================
// QuantCooks Studio — C-7 (Design Studio "Screens", steps 1–3).
//
//  - Serving: the verified FigCraft web bundle (v0.12.1) is installed
//    byte-for-byte at public/design-editor/0.12.1/ — the file count,
//    the total size, the wasm size and the index page's genuine
//    canvas marker (the probe's witness in lib/studio/figcraft.ts)
//    are pinned here. In-browser boot is NOT pinned by any test: no
//    browser runs in this harness, so boot smoke belongs to the
//    staging checklist; what is pinned is that the bytes the browser
//    will be served are exactly the verified build's.
//  - Headers: next.config.js carries the bundle's HOSTING.md rules,
//    scoped to /design-editor (the batch #4 pattern, extended).
//  - Lib: design-document detection, the availability probe, the
//    minimal ZIP reader + embedded-thumbnail extraction (including
//    corrupt-archive honesty), and the save-back plan/run machine.
//  - Components: the library home's five states + the disabled-with-
//    reason Vector tab, and the Screens editor's probe-gated stage
//    (blocker vs iframe), not-found state and save-back wiring.
// ============================================================================

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { deflateRawSync, crc32 } from 'node:zlib';
import type { ServerAsset, ServerProject } from '../services/api-client';
import {
  DESIGN_EDITOR_INDEX_PATH,
  DESIGN_EDITOR_NOT_SERVED,
  FIGCRAFT_PIN,
  NEW_DESIGN_ID,
  designDisplayName,
  designDocuments,
  designEditorRoute,
  designEditorSrc,
  extractFigcraftThumbnail,
  isDesignDocument,
  isFigcraftFile,
  planDesignSaveBack,
  probeDesignEditor,
  readZipEntry,
  runDesignSaveBack,
} from '../lib/studio/figcraft';
import { DesignStudioHome } from '../components/studio/DesignStudioHome';
import { DesignEditor } from '../components/studio/DesignEditor';

const here = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(here, '..', '..');
const BUNDLE_ROOT = join(APP_ROOT, 'public', 'design-editor', FIGCRAFT_PIN.version);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const asset = (over: Partial<ServerAsset> = {}): ServerAsset => ({
  id: 'asset-1',
  projectId: 'proj-1',
  filename: 'menu-screen.figcraft',
  type: 'application',
  size: 44_145,
  uploadedAt: '2026-10-29T00:00:00.000Z',
  url: 'https://signed.example/menu-screen.figcraft',
  uploadStatus: 'READY',
  storageKey: 'quantcooks/u/proj-1/asset-1/menu-screen.figcraft',
  ...over,
});

const project = (over: Partial<ServerProject> = {}): ServerProject => ({
  id: 'proj-1',
  userId: 'user-1',
  name: 'Cafe Menu Redesign',
  type: 'video',
  createdAt: '2026-10-29T00:00:00.000Z',
  updatedAt: '2026-10-29T00:00:00.000Z',
  deletedAt: null,
  ...over,
});

/** A minimal ZIP writer for fixtures (stored + raw-deflate entries). */
function buildZip(
  entries: Array<{ name: string; data: Uint8Array; method?: 0 | 8; declaredSize?: number }>,
): Uint8Array {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const method = entry.method ?? 0;
    const stored = method === 8 ? new Uint8Array(deflateRawSync(entry.data)) : entry.data;
    const nameBytes = enc.encode(entry.name);
    const crc = crc32(entry.data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(8, method, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, stored.length, true);
    local.setUint32(22, entry.data.length, true);
    local.setUint16(26, nameBytes.length, true);
    parts.push(new Uint8Array(local.buffer), nameBytes, stored);

    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 20, true);
    central.setUint16(6, 20, true);
    central.setUint16(10, method, true);
    central.setUint32(16, crc, true);
    central.setUint32(20, stored.length, true);
    central.setUint32(24, entry.declaredSize ?? entry.data.length, true);
    central.setUint16(28, nameBytes.length, true);
    central.setUint32(42, offset, true);
    centrals.push(new Uint8Array(central.buffer), nameBytes);
    offset += 30 + nameBytes.length + stored.length;
  }
  const centralStart = offset;
  let centralSize = 0;
  for (const c of centrals) centralSize += c.length;
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true);
  eocd.setUint16(8, entries.length, true);
  eocd.setUint16(10, entries.length, true);
  eocd.setUint32(12, centralSize, true);
  eocd.setUint32(16, centralStart, true);
  const total = centralStart + centralSize + 22;
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of [...parts, ...centrals, new Uint8Array(eocd.buffer)]) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

// ---------------------------------------------------------------------------
// Serving install (step 1)
// ---------------------------------------------------------------------------

describe('C-7 step 1 — the verified bundle is installed at public/design-editor/0.12.1/', () => {
  const bundleFiles = (): string[] => {
    const out: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else out.push(relative(BUNDLE_ROOT, full).split('\\').join('/'));
      }
    };
    walk(BUNDLE_ROOT);
    return out.sort();
  };

  it('the bundle carries exactly the pinned build’s file count and total size', () => {
    const files = bundleFiles();
    expect(files.length).toBe(FIGCRAFT_PIN.bundleFiles);
    const total = files.reduce((sum, rel) => sum + statSync(join(BUNDLE_ROOT, rel)).size, 0);
    expect(total).toBe(FIGCRAFT_PIN.bundleBytes);
  });

  it('the wasm is the pinned build’s single binary, at its verified size', () => {
    expect(statSync(join(BUNDLE_ROOT, FIGCRAFT_PIN.wasmFile)).size).toBe(FIGCRAFT_PIN.wasmBytes);
  });

  it('the license texts ship inside the installed bundle, untouched', () => {
    const files = bundleFiles();
    expect(files).toContain('LICENSE-MIT');
    expect(files).toContain('LICENSE-APACHE');
    expect(files).toContain('NOTICE');
  });

  it('index.html is the genuine editor page (the probe’s witness) on relative URLs', () => {
    const index = readFileSync(join(BUNDLE_ROOT, 'index.html'), 'utf8');
    expect(index).toContain('id="figcraft_canvas"');
    expect(index).toContain(FIGCRAFT_PIN.wasmFile);
    expect(index).not.toContain('src="/');
    expect(index).not.toContain('href="/');
  });
});

describe('C-7 step 1 — next.config.js serves the bundle by its HOSTING.md rules', () => {
  interface HeaderRule {
    source: string;
    headers: Array<{ key: string; value: string }>;
  }

  const loadRules = async (): Promise<HeaderRule[]> => {
    const require = createRequire(import.meta.url);
    const config = require(join(APP_ROOT, 'next.config.js')) as {
      headers: () => Promise<HeaderRule[]>;
    };
    return config.headers();
  };

  const ruleFor = (rules: HeaderRule[], source: string) => rules.find((r) => r.source === source);

  it('.wasm is served as application/wasm, cached immutably', async () => {
    const rule = ruleFor(await loadRules(), '/design-editor/0.12.1/:file*.wasm');
    expect(rule?.headers).toContainEqual({ key: 'Content-Type', value: 'application/wasm' });
    expect(rule?.headers).toContainEqual({
      key: 'Cache-Control',
      value: 'public, max-age=31536000, immutable',
    });
  });

  it('the hashed glue module and snippet are cached immutably', async () => {
    const rules = await loadRules();
    for (const source of [
      '/design-editor/0.12.1/figcraft-web-:hash.js',
      '/design-editor/0.12.1/snippets/:path*',
    ]) {
      expect(ruleFor(rules, source)?.headers).toContainEqual({
        key: 'Cache-Control',
        value: 'public, max-age=31536000, immutable',
      });
    }
  });

  it('index.html revalidates (no-cache)', async () => {
    const rule = ruleFor(await loadRules(), '/design-editor/0.12.1/index.html');
    expect(rule?.headers).toContainEqual({ key: 'Cache-Control', value: 'no-cache' });
  });

  it('no rule anywhere adds a Content-Encoding transform', async () => {
    const rules = await loadRules();
    for (const r of rules) {
      for (const h of r.headers) expect(h.key).not.toBe('Content-Encoding');
    }
  });
});

// ---------------------------------------------------------------------------
// Lib — detection, probe, zip reading
// ---------------------------------------------------------------------------

describe('design document detection (READY + the format’s own glob)', () => {
  it('a READY .figcraft asset is a design document; case does not matter', () => {
    expect(isDesignDocument(asset())).toBe(true);
    expect(isDesignDocument(asset({ filename: 'Menu.FIGCRAFT' }))).toBe(true);
  });

  it('PENDING uploads and other files are not design documents', () => {
    expect(isDesignDocument(asset({ uploadStatus: 'PENDING' }))).toBe(false);
    expect(isDesignDocument(asset({ filename: 'dish.png', type: 'image' }))).toBe(false);
    expect(isDesignDocument(asset({ filename: 'notes.figcraft.txt' }))).toBe(false);
  });

  it('designDocuments filters a mixed library, preserving order', () => {
    const list = [
      asset({ id: 'a', filename: 'one.figcraft' }),
      asset({ id: 'b', filename: 'dish.png', type: 'image' }),
      asset({ id: 'c', filename: 'two.figcraft', uploadStatus: 'PENDING' }),
      asset({ id: 'd', filename: 'three.figcraft' }),
    ];
    expect(designDocuments(list).map((a) => a.id)).toEqual(['a', 'd']);
  });

  it('display names strip the extension; routes are the screens paths', () => {
    expect(designDisplayName(asset())).toBe('menu-screen');
    expect(designEditorRoute('asset-1')).toBe('/studio/design/screens/asset-1');
    expect(designEditorRoute(NEW_DESIGN_ID)).toBe('/studio/design/screens/new');
    expect(designEditorSrc()).toBe(DESIGN_EDITOR_INDEX_PATH);
  });
});

describe('probeDesignEditor — the marker, not the status code, is the witness', () => {
  it('available when the index page carries the genuine canvas marker', async () => {
    const probe = await probeDesignEditor({
      fetchText: async () => '<canvas id="figcraft_canvas"></canvas>',
    });
    expect(probe.status).toBe('available');
  });

  it('unavailable when a fallback page answers instead (an SPA shell has no marker)', async () => {
    const probe = await probeDesignEditor({
      fetchText: async () => '<html><body><div id="__next"></div></body></html>',
    });
    expect(probe.status).toBe('unavailable');
  });

  it('unavailable when the files cannot be reached at all', async () => {
    const probe = await probeDesignEditor({
      fetchText: async () => {
        throw new Error('Editor index request failed (404)');
      },
    });
    expect(probe).toEqual({ status: 'unavailable', reason: 'Editor index request failed (404)' });
  });

  it('the installed bundle’s real index page passes the probe', async () => {
    const index = readFileSync(join(BUNDLE_ROOT, 'index.html'), 'utf8');
    const probe = await probeDesignEditor({ fetchText: async () => index });
    expect(probe.status).toBe('available');
  });
});

describe('readZipEntry / extractFigcraftThumbnail — the embedded preview, honestly', () => {
  it('reads a STORED thumbnail byte-for-byte (the spike file’s shape)', async () => {
    const zip = buildZip([
      { name: 'document.json', data: new TextEncoder().encode('{"nodes":[]}'), method: 8 },
      { name: 'thumbnail.png', data: PNG_BYTES, method: 0 },
    ]);
    const thumb = await extractFigcraftThumbnail(zip);
    expect(thumb).toEqual({ status: 'ready', png: PNG_BYTES });
  });

  it('reads a DEFLATED thumbnail through the platform inflater', async () => {
    const zip = buildZip([{ name: 'thumbnail.png', data: PNG_BYTES, method: 8 }]);
    const thumb = await extractFigcraftThumbnail(zip);
    expect(thumb).toEqual({ status: 'ready', png: PNG_BYTES });
  });

  it('a valid design zip without a thumbnail entry is missing, not corrupt', async () => {
    const zip = buildZip([
      { name: 'document.json', data: new TextEncoder().encode('{}'), method: 8 },
    ]);
    expect(await extractFigcraftThumbnail(zip)).toEqual({ status: 'missing' });
    expect(await readZipEntry(zip, 'thumbnail.png')).toEqual({ status: 'missing' });
  });

  it('non-ZIP bytes are a named corrupt verdict, never an empty success', async () => {
    const thumb = await extractFigcraftThumbnail(new TextEncoder().encode('not a zip at all, just text'));
    expect(thumb.status).toBe('corrupt');
    const tiny = await extractFigcraftThumbnail(new Uint8Array([1, 2, 3]));
    expect(tiny.status).toBe('corrupt');
  });

  it('a truncated archive is corrupt', async () => {
    const zip = buildZip([{ name: 'thumbnail.png', data: PNG_BYTES }]);
    const truncated = zip.subarray(0, zip.length - 10);
    expect((await extractFigcraftThumbnail(truncated)).status).toBe('corrupt');
  });

  it('an entry whose decoded size disagrees with the directory is corrupt', async () => {
    const zip = buildZip([
      { name: 'thumbnail.png', data: PNG_BYTES, declaredSize: PNG_BYTES.length + 5 },
    ]);
    const thumb = await extractFigcraftThumbnail(zip);
    expect(thumb.status).toBe('corrupt');
  });

  it('an empty thumbnail entry is corrupt (a zero-byte preview is not a preview)', async () => {
    const zip = buildZip([{ name: 'thumbnail.png', data: new Uint8Array(0) }]);
    expect((await extractFigcraftThumbnail(zip)).status).toBe('corrupt');
  });
});

// The spike's real saved document, when the spike folder is present:
// the strongest fixture there is — a genuine editor-produced file.
const SPIKE_FIGCRAFT = resolve(
  here,
  '..', '..', '..', '..', '..', '..',
  'quantcooks-craft-spike', 'figcraft', 'work', 'spike-dish.figcraft',
);
describe.skipIf(!existsSync(SPIKE_FIGCRAFT))('the spike’s real .figcraft file', () => {
  it('yields its real embedded thumbnail (30,027 bytes, PNG magic)', async () => {
    const bytes = new Uint8Array(readFileSync(SPIKE_FIGCRAFT));
    const thumb = await extractFigcraftThumbnail(bytes);
    expect(thumb.status).toBe('ready');
    if (thumb.status === 'ready') {
      expect(thumb.png.length).toBe(30_027);
      expect([...thumb.png.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    }
  });
});

// ---------------------------------------------------------------------------
// Lib — save-back plan + run
// ---------------------------------------------------------------------------

describe('planDesignSaveBack — a new version beside the old, never over it', () => {
  const goodFile = { name: 'menu-screen.figcraft', type: '', size: 50_000 };

  it('an existing design saves into its own project under a copy name, lineage attached', () => {
    const plan = planDesignSaveBack({ source: asset(), file: goodFile });
    expect(plan).toEqual({
      ok: true,
      projectId: 'proj-1',
      filename: 'menu-screen-edited.figcraft',
      derivedFromAssetId: 'asset-1',
    });
  });

  it('a source that is not a ready design document is refused', () => {
    const plan = planDesignSaveBack({
      source: asset({ uploadStatus: 'PENDING' }),
      file: goodFile,
    });
    expect(plan.ok).toBe(false);
  });

  it('a file that is not a design file is refused — by name and by type', () => {
    expect(isFigcraftFile({ name: 'x.figcraft', type: '', size: 1 })).toBe(true);
    expect(isFigcraftFile({ name: 'x.bin', type: 'application/x-figcraft', size: 1 })).toBe(true);
    expect(isFigcraftFile({ name: 'photo.png', type: 'image/png', size: 1 })).toBe(false);
    const plan = planDesignSaveBack({
      source: asset(),
      file: { name: 'photo.png', type: 'image/png', size: 10 },
    });
    expect(plan.ok).toBe(false);
  });

  it('empty and oversized downloads are refused', () => {
    expect(planDesignSaveBack({ source: asset(), file: { ...goodFile, size: 0 } }).ok).toBe(false);
    expect(
      planDesignSaveBack({ source: asset(), file: { ...goodFile, size: 512 * 1024 * 1024 + 1 } }).ok,
    ).toBe(false);
  });

  it('a NEW design must name its project first; then it keeps the download’s name', () => {
    expect(planDesignSaveBack({ source: null, file: goodFile }).ok).toBe(false);
    const plan = planDesignSaveBack({ source: null, targetProjectId: 'proj-9', file: goodFile });
    expect(plan).toEqual({
      ok: true,
      projectId: 'proj-9',
      filename: 'menu-screen.figcraft',
      derivedFromAssetId: null,
    });
  });

  it('a NEW design whose download lost its extension is stored under an honest default name', () => {
    const plan = planDesignSaveBack({
      source: null,
      targetProjectId: 'proj-9',
      file: { name: 'download', type: 'application/x-figcraft', size: 10 },
    });
    expect(plan).toEqual({
      ok: true,
      projectId: 'proj-9',
      filename: 'untitled-design.figcraft',
      derivedFromAssetId: null,
    });
  });
});

describe('runDesignSaveBack — the P0-3 seam, errors untouched', () => {
  it('uploads the renamed copy into the source project and reports the lineage', async () => {
    const upload = vi.fn(async (projectId: string, file: File) =>
      asset({ id: 'asset-2', projectId, filename: file.name }),
    );
    const outcome = await runDesignSaveBack(
      { source: asset(), file: new File(['zip'], 'menu-screen.figcraft') },
      { upload, renameFile: (f, filename) => new File([f], filename, { type: f.type }) },
    );
    expect(upload).toHaveBeenCalledTimes(1);
    expect(upload.mock.calls[0]?.[0]).toBe('proj-1');
    expect(upload.mock.calls[0]?.[1].name).toBe('menu-screen-edited.figcraft');
    expect(outcome).toEqual({
      status: 'saved',
      asset: expect.objectContaining({ id: 'asset-2' }),
      derivedFromAssetId: 'asset-1',
    });
  });

  it('an invalid plan never reaches the upload seam', async () => {
    const upload = vi.fn(async () => asset());
    const outcome = await runDesignSaveBack(
      { source: null, file: new File(['zip'], 'fresh.figcraft') },
      { upload, renameFile: (f, filename) => new File([f], filename) },
    );
    expect(outcome.status).toBe('error');
    expect(upload).not.toHaveBeenCalled();
  });

  it('a seam failure (e.g. STORAGE_NOT_CONFIGURED) reaches the user as itself', async () => {
    const outcome = await runDesignSaveBack(
      { source: asset(), file: new File(['zip'], 'menu-screen.figcraft') },
      {
        upload: async () => {
          throw new Error('STORAGE_NOT_CONFIGURED');
        },
        renameFile: (f, filename) => new File([f], filename),
      },
    );
    expect(outcome).toEqual({ status: 'error', message: 'STORAGE_NOT_CONFIGURED' });
  });
});

// ---------------------------------------------------------------------------
// Components — Design Studio home
// ---------------------------------------------------------------------------

describe('DesignStudioHome — the library of real design documents', () => {
  it('loading state is named, not blank', () => {
    const html = renderToStaticMarkup(
      React.createElement(DesignStudioHome, { assetsState: 'loading' }),
    );
    expect(html).toContain('data-testid="design-library-loading"');
  });

  it('error state carries the real error and a retry', () => {
    const html = renderToStaticMarkup(
      React.createElement(DesignStudioHome, {
        assetsState: 'error',
        assetsError: 'Failed to load assets',
        onRetryAssets: () => {},
      }),
    );
    expect(html).toContain('data-testid="design-library-error"');
    expect(html).toContain('Failed to load assets');
    expect(html).toContain('Try again');
  });

  it('empty state explains where designs live and how the first one arrives', () => {
    const html = renderToStaticMarkup(
      React.createElement(DesignStudioHome, { assetsState: 'ready', assets: [] }),
    );
    expect(html).toContain('data-testid="design-library-empty"');
    expect(html).toContain('.figcraft');
  });

  it('populated state lists ONLY design documents, with real previews and routes', () => {
    const html = renderToStaticMarkup(
      React.createElement(DesignStudioHome, {
        assetsState: 'ready',
        assets: [
          asset({ id: 'd1', filename: 'menu-screen.figcraft' }),
          asset({ id: 'p1', filename: 'dish.png', type: 'image' }),
          asset({ id: 'd2', filename: 'poster.figcraft' }),
        ],
        initialThumbnails: {
          d1: { status: 'ready', url: 'blob:thumb-d1' },
          d2: { status: 'missing' },
        },
      }),
    );
    expect(html).toContain('data-testid="design-card-d1"');
    expect(html).toContain('data-testid="design-card-d2"');
    expect(html).not.toContain('design-card-p1');
    expect(html).toContain('src="blob:thumb-d1"');
    expect(html).toContain('data-testid="design-thumb-missing-d2"');
    expect(html).toContain('This design file carries no preview image.');
    expect(html).toContain('href="/studio/design/screens/d1"');
    expect(html).toContain('menu-screen');
    expect(html).toContain('poster');
  });

  it('without a byte fetcher the preview says unavailable — never a stock image', () => {
    const html = renderToStaticMarkup(
      React.createElement(DesignStudioHome, {
        assetsState: 'ready',
        assets: [asset({ id: 'd1' })],
      }),
    );
    expect(html).toContain('data-testid="design-thumb-unavailable-d1"');
    expect(html).not.toContain('<img');
  });

  it('the Vector tab is disabled WITH its reason; Screens is the current tab', () => {
    const html = renderToStaticMarkup(
      React.createElement(DesignStudioHome, { assetsState: 'ready', assets: [] }),
    );
    expect(html).toContain('data-testid="design-mode-screens"');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*data-testid="design-mode-vector"[^>]*>/);
    expect(html).toContain('data-testid="design-mode-vector-reason"');
    expect(html).toContain('Vector mode arrives with the VectorCraft unit (C-8)');
  });

  it('New Design routes to the reserved new-design editor; QuantAI is honestly unconfigured', () => {
    const html = renderToStaticMarkup(
      React.createElement(DesignStudioHome, { assetsState: 'ready', assets: [] }),
    );
    expect(html).toContain('href="/studio/design/screens/new"');
    expect(html).toContain('data-testid="design-quantai-unavailable"');
    expect(html).toContain('QuantAI design tools — not configured yet');
  });
});

// ---------------------------------------------------------------------------
// Components — Screens editor
// ---------------------------------------------------------------------------

describe('DesignEditor — probe-gated stage, honest save-back', () => {
  const readyAssets = [asset({ id: 'd1' })];
  const available = { status: 'available', markerLine: '<canvas id="figcraft_canvas">' } as const;
  const unavailable = { status: 'unavailable', reason: 'no marker' } as const;

  it('while the probe is out, the stage says it is checking — no iframe yet', () => {
    const html = renderToStaticMarkup(
      React.createElement(DesignEditor, {
        designId: 'd1',
        assets: readyAssets,
        assetsState: 'ready',
        embedProbe: null,
      }),
    );
    expect(html).toContain('data-testid="design-editor-checking"');
    expect(html).not.toContain('data-testid="design-editor-frame"');
  });

  it('a failed probe renders the named blocker panel, never a blank iframe', () => {
    const html = renderToStaticMarkup(
      React.createElement(DesignEditor, {
        designId: 'd1',
        assets: readyAssets,
        assetsState: 'ready',
        embedProbe: unavailable,
      }),
    );
    expect(html).toContain('data-testid="design-editor-not-served"');
    expect(html).toContain(DESIGN_EDITOR_NOT_SERVED.code);
    expect(html).not.toContain('data-testid="design-editor-frame"');
    expect(html).not.toContain('<iframe');
  });

  it('a passing probe mounts the iframe at the installed bundle’s index', () => {
    const html = renderToStaticMarkup(
      React.createElement(DesignEditor, {
        designId: 'd1',
        assets: readyAssets,
        assetsState: 'ready',
        embedProbe: available,
      }),
    );
    expect(html).toContain('data-testid="design-editor-frame"');
    expect(html).toContain(`src="${DESIGN_EDITOR_INDEX_PATH}"`);
    // The no-sync truth is on the screen, not buried.
    expect(html).toContain('no sync');
  });

  it('an unknown design id is a not-found state, not an editor over nothing', () => {
    const html = renderToStaticMarkup(
      React.createElement(DesignEditor, {
        designId: 'nope',
        assets: readyAssets,
        assetsState: 'ready',
        embedProbe: available,
      }),
    );
    expect(html).toContain('data-testid="design-not-found"');
    expect(html).not.toContain('data-testid="design-editor-frame"');
  });

  it('save-back names the copy it will store, beside the source it never overwrites', () => {
    const html = renderToStaticMarkup(
      React.createElement(DesignEditor, {
        designId: 'd1',
        assets: readyAssets,
        assetsState: 'ready',
        embedProbe: available,
        upload: async () => asset({ id: 'd2' }),
        initialExportFile: new File(['zip'], 'menu-screen.figcraft'),
      }),
    );
    expect(html).toContain('data-testid="design-save-name"');
    expect(html).toContain('menu-screen-edited.figcraft');
    expect(html).toContain('a new version of menu-screen.figcraft');
  });

  it('a non-design download is refused by the plan, in the open', () => {
    const html = renderToStaticMarkup(
      React.createElement(DesignEditor, {
        designId: 'd1',
        assets: readyAssets,
        assetsState: 'ready',
        embedProbe: available,
        upload: async () => asset({ id: 'd2' }),
        initialExportFile: new File(['x'], 'notes.txt', { type: 'text/plain' }),
      }),
    );
    expect(html).toContain('data-testid="design-save-invalid"');
    expect(html).toMatch(/data-testid="design-save-button"[^>]*disabled/);
  });

  it('without an upload seam the save-back says so instead of offering a dead control', () => {
    const html = renderToStaticMarkup(
      React.createElement(DesignEditor, {
        designId: 'd1',
        assets: readyAssets,
        assetsState: 'ready',
        embedProbe: available,
      }),
    );
    expect(html).toContain('data-testid="design-save-off"');
    expect(html).not.toContain('data-testid="design-save-button"');
  });

  it('a NEW design asks for its project and plans into the picked one', () => {
    const html = renderToStaticMarkup(
      React.createElement(DesignEditor, {
        designId: NEW_DESIGN_ID,
        assets: [],
        assetsState: 'ready',
        projects: [project({ id: 'proj-9', name: 'Winter Menu' })],
        projectsState: 'ready',
        embedProbe: available,
        upload: async () => asset({ id: 'd9' }),
        initialTargetProjectId: 'proj-9',
        initialExportFile: new File(['zip'], 'fresh.figcraft'),
      }),
    );
    expect(html).toContain('data-testid="design-project-select"');
    expect(html).toContain('Winter Menu');
    expect(html).toContain('data-testid="design-save-name"');
    expect(html).toContain('fresh.figcraft');
    expect(html).toContain('a new design in Winter Menu');
  });

  it('a NEW design with no projects says to create one first', () => {
    const html = renderToStaticMarkup(
      React.createElement(DesignEditor, {
        designId: NEW_DESIGN_ID,
        assets: [],
        assetsState: 'ready',
        projects: [],
        projectsState: 'ready',
        embedProbe: available,
      }),
    );
    expect(html).toContain('data-testid="design-project-empty"');
  });
});
