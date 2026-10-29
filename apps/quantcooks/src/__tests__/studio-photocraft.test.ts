// ============================================================================
// QuantCooks Studio (Unit C-3) — Photo Editor embed bridge: lib + surface.
// Same approach as Units 1–8: react-dom/server against the established
// vitest setup, no new dependencies, no DOM environment. The honesty
// proofs this unit owes:
//  - the pin is the verified release (version + zip sha256 recorded);
//  - the iframe renders ONLY after the parts-manifest probe passes —
//    an SPA-fallback 200 does not count as "served";
//  - no upstream branding appears in any rendered surface;
//  - save-back uploads the exported bytes as a NEW asset in the source
//    asset's project via the P0-3 seam, and never mutates the source;
//  - seam errors (e.g. a STORAGE_NOT_CONFIGURED 503) pass through
//    untouched.
// ============================================================================

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import type { ServerAsset } from '../services/api-client';
import {
  PHOTO_EDITOR_BASE_PATH,
  PHOTO_EDITOR_IFRAME_ALLOW,
  PHOTO_EDITOR_IFRAME_SANDBOX,
  PHOTO_EDITOR_NOT_SERVED,
  PHOTO_EDITOR_PARTS_PATH,
  PHOTOCRAFT_PIN,
  derivedPhotoFilename,
  photoEditorSrc,
  photoSavePhaseLabel,
  pickablePhotoAssets,
  planPhotoSaveBack,
  probePhotoEditor,
  resolvePhotoExportFormat,
  runPhotoSaveBack,
} from '../lib/studio/photocraft';
import {
  PHOTOCRAFT_ATTRIBUTION,
  PHOTOCRAFT_ATTRIBUTION_TEXT,
} from '../lib/studio/photocraft-attribution';
import { PhotoEditor, type PhotoEditorProps } from '../components/studio/PhotoEditor';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const asset = (over: Partial<ServerAsset>): ServerAsset => ({
  id: 'asset-1',
  projectId: 'proj-1',
  filename: 'thali.jpg',
  type: 'image',
  size: 2048,
  uploadedAt: '2026-10-29T00:00:00.000Z',
  url: 'https://signed.example/thali.jpg',
  uploadStatus: 'READY',
  storageKey: 'quantcooks/u/proj-1/asset-1/thali.jpg',
  ...over,
});

const readyImage = asset({});
const pendingImage = asset({ id: 'asset-pending', filename: 'pending.jpg', uploadStatus: 'PENDING', url: null });
const readyVideo = asset({ id: 'asset-video', filename: 'clip.mp4', type: 'video', url: 'https://signed.example/clip.mp4' });

const exportPng = new File(['png-bytes'], 'export.png', { type: 'image/png' });

const render = (props: Partial<PhotoEditorProps>) =>
  renderToStaticMarkup(
    React.createElement(PhotoEditor, {
      assets: [readyImage],
      assetsState: 'ready',
      ...props,
    }),
  );

// ---------------------------------------------------------------------------
// The pin + attribution record
// ---------------------------------------------------------------------------

describe('photocraft pin + attribution', () => {
  it('pins the verified v0.17.0 web build with its release sha256', () => {
    expect(PHOTOCRAFT_PIN.version).toBe('0.17.0');
    expect(PHOTOCRAFT_PIN.releaseZip).toBe('photocraft-web-0.17.0.zip');
    expect(PHOTOCRAFT_PIN.zipSha256).toBe(
      '9dbc979e138e83136d5958acd0cf7d1832aeae5095409eb4691dca577db5fc99',
    );
    expect(PHOTOCRAFT_PIN.zipBytes).toBe(12_955_028);
    expect(PHOTOCRAFT_PIN.appWasmInflatedBytes).toBe(28_982_124);
  });

  it('records the dual license and the in-bundle license files', () => {
    expect(PHOTOCRAFT_ATTRIBUTION.license).toContain('MIT OR Apache-2.0');
    expect(PHOTOCRAFT_ATTRIBUTION.licenseFilesInBundle).toContain('LICENSE-MIT');
    expect(PHOTOCRAFT_ATTRIBUTION.licenseFilesInBundle).toContain('LICENSE-APACHE');
    expect(PHOTOCRAFT_ATTRIBUTION.licenseFilesInBundle).toContain('NOTICE');
    expect(PHOTOCRAFT_ATTRIBUTION.version).toBe(PHOTOCRAFT_PIN.version);
    expect(PHOTOCRAFT_ATTRIBUTION.releaseZipSha256).toBe(PHOTOCRAFT_PIN.zipSha256);
    expect(PHOTOCRAFT_ATTRIBUTION_TEXT).toContain('0.17.0');
    expect(PHOTOCRAFT_ATTRIBUTION.trademarkNote).toContain('not used in any QuantCooks surface');
  });
});

// ---------------------------------------------------------------------------
// Embed constants + probe
// ---------------------------------------------------------------------------

describe('photocraft embed', () => {
  it('points the iframe at the documented serving path', () => {
    expect(PHOTO_EDITOR_BASE_PATH).toBe('/photo-editor');
    expect(photoEditorSrc()).toBe('/photo-editor/index.html');
    expect(PHOTO_EDITOR_PARTS_PATH).toBe('/photo-editor/app/parts.txt');
  });

  it('prescribes the iframe attributes the hosting doc requires', () => {
    expect(PHOTO_EDITOR_IFRAME_ALLOW).toContain('clipboard-write');
    expect(PHOTO_EDITOR_IFRAME_SANDBOX).toContain('allow-scripts');
    expect(PHOTO_EDITOR_IFRAME_SANDBOX).toContain('allow-same-origin');
    // Save/Export ARE browser downloads in this build — a sandbox
    // without allow-downloads would silently break them.
    expect(PHOTO_EDITOR_IFRAME_SANDBOX).toContain('allow-downloads');
  });

  it('probe passes only on the genuine parts-manifest marker', async () => {
    const probe = await probePhotoEditor({
      fetchText: async () =>
        'photocraft-parts 1\nphotocraft-web-25bf2289380b561f.part-aa\n',
    });
    expect(probe).toEqual({ status: 'available', partsLine: 'photocraft-parts 1' });
  });

  it('probe refuses an SPA-fallback page answering 200 for everything', async () => {
    const probe = await probePhotoEditor({
      fetchText: async () => '<!DOCTYPE html><html><body>QuantCooks</body></html>',
    });
    expect(probe.status).toBe('unavailable');
  });

  it('probe refuses a network/404 failure with the real reason', async () => {
    const probe = await probePhotoEditor({
      fetchText: async () => {
        throw new Error('Editor manifest request failed (404)');
      },
    });
    expect(probe).toEqual({
      status: 'unavailable',
      reason: 'Editor manifest request failed (404)',
    });
  });
});

// ---------------------------------------------------------------------------
// Picking + save-back planning
// ---------------------------------------------------------------------------

describe('photocraft picking + planning', () => {
  it('pickable assets are READY images only', () => {
    expect(pickablePhotoAssets([readyImage, pendingImage, readyVideo]).map((a) => a.id)).toEqual([
      'asset-1',
    ]);
  });

  it('resolves export formats from content type, then extension', () => {
    expect(resolvePhotoExportFormat({ name: 'x', type: 'image/png', size: 1 })).toBe('png');
    expect(resolvePhotoExportFormat({ name: 'x', type: 'image/jpeg', size: 1 })).toBe('jpeg');
    expect(resolvePhotoExportFormat({ name: 'x.webp', type: '', size: 1 })).toBe('webp');
    // Browsers hand .psd downloads an empty/generic type — extension decides.
    expect(resolvePhotoExportFormat({ name: 'edit.psd', type: '', size: 1 })).toBe('psd');
    expect(resolvePhotoExportFormat({ name: 'anim.gif', type: 'image/gif', size: 1 })).toBeNull();
    expect(resolvePhotoExportFormat({ name: 'notes.txt', type: 'text/plain', size: 1 })).toBeNull();
  });

  it('names the saved copy as a copy of the source, in the export format', () => {
    expect(derivedPhotoFilename(readyImage, 'png')).toBe('thali-edited.png');
    expect(derivedPhotoFilename(readyImage, 'jpeg')).toBe('thali-edited.jpg');
    expect(derivedPhotoFilename(readyImage, 'psd')).toBe('thali-edited.psd');
  });

  it('plans a valid save-back and refuses invalid ones with reasons', () => {
    expect(planPhotoSaveBack(readyImage, exportPng)).toEqual({
      ok: true,
      filename: 'thali-edited.png',
      format: 'png',
    });
    expect(planPhotoSaveBack(pendingImage, exportPng).ok).toBe(false);
    expect(planPhotoSaveBack(readyVideo, exportPng).ok).toBe(false);
    expect(
      planPhotoSaveBack(readyImage, { name: 'a.gif', type: 'image/gif', size: 10 }).ok,
    ).toBe(false);
    expect(planPhotoSaveBack(readyImage, { name: 'a.png', type: 'image/png', size: 0 }).ok).toBe(
      false,
    );
  });
});

// ---------------------------------------------------------------------------
// Save-back execution — the P0-3 seam, source never mutated
// ---------------------------------------------------------------------------

describe('photocraft save-back', () => {
  it('uploads the renamed copy into the SOURCE project and reports the lineage', async () => {
    const source = asset({});
    const sourceSnapshot = { ...source };
    const created = asset({ id: 'asset-2', filename: 'thali-edited.png' });
    const upload = vi.fn(async (_projectId: string, _file: File) => created);

    const outcome = await runPhotoSaveBack(source, exportPng, {
      upload,
      renameFile: (f, filename) => new File([f], filename, { type: f.type }),
    });

    expect(upload).toHaveBeenCalledTimes(1);
    const [projectId, sentFile] = upload.mock.calls[0]!;
    expect(projectId).toBe('proj-1');
    expect(sentFile.name).toBe('thali-edited.png');
    expect(sentFile).not.toBe(exportPng); // a copy — the download itself is not what lands
    expect(outcome).toEqual({ status: 'saved', asset: created, derivedFromAssetId: 'asset-1' });
    expect(source).toEqual(sourceSnapshot); // the original asset object is untouched
  });

  it('never calls the seam when the plan refuses', async () => {
    const upload = vi.fn(async () => asset({}));
    const outcome = await runPhotoSaveBack(
      readyImage,
      new File(['x'], 'anim.gif', { type: 'image/gif' }),
      { upload, renameFile: (f, name) => new File([f], name, { type: f.type }) },
    );
    expect(outcome.status).toBe('error');
    expect(upload).not.toHaveBeenCalled();
  });

  it('passes seam errors through untouched (STORAGE_NOT_CONFIGURED 503)', async () => {
    const outcome = await runPhotoSaveBack(readyImage, exportPng, {
      upload: async () => {
        throw new Error('STORAGE_NOT_CONFIGURED: object storage is not configured (503)');
      },
      renameFile: (f, name) => new File([f], name, { type: f.type }),
    });
    expect(outcome).toEqual({
      status: 'error',
      message: 'STORAGE_NOT_CONFIGURED: object storage is not configured (503)',
    });
  });

  it('phase labels describe stages without inventing a percentage', () => {
    expect(photoSavePhaseLabel('working')).toContain('Saving the copy');
    expect(photoSavePhaseLabel('saved')).toContain('original is untouched');
    expect(photoSavePhaseLabel('idle')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The surface — five states + the embed honesty rules
// ---------------------------------------------------------------------------

describe('PhotoEditor surface', () => {
  it('loading state: no iframe, no picker cards', () => {
    const html = render({ assetsState: 'loading', assets: [] });
    expect(html).toContain('photo-assets-loading');
    expect(html).not.toContain('<iframe');
  });

  it('error state: the real message and a retry', () => {
    const html = render({
      assetsState: 'error',
      assets: [],
      assetsError: 'Failed to load assets',
      onRetryAssets: () => undefined,
    });
    expect(html).toContain('photo-assets-error');
    expect(html).toContain('Failed to load assets');
    expect(html).toContain('Try again');
  });

  it('empty state: only non-ready / non-image assets means nothing to edit', () => {
    const html = render({ assets: [pendingImage, readyVideo] });
    expect(html).toContain('photo-assets-empty');
    expect(html).not.toContain('<iframe');
  });

  it('populated: ready photos are pickable, others are not offered', () => {
    const html = render({ assets: [readyImage, pendingImage, readyVideo] });
    expect(html).toContain('photo-pick-asset-1');
    expect(html).not.toContain('photo-pick-asset-pending');
    expect(html).not.toContain('photo-pick-asset-video');
    expect(html).toContain('photo-pick-first');
  });

  it('checking state: probe pending renders no iframe', () => {
    const html = render({ initialSourceAsset: readyImage, embedProbe: null });
    expect(html).toContain('photo-editor-checking');
    expect(html).not.toContain('<iframe');
  });

  it('not-served state: names the blocker, shows NO editor frame', () => {
    const html = render({
      initialSourceAsset: readyImage,
      embedProbe: { status: 'unavailable', reason: 'Editor manifest request failed (404)' },
    });
    expect(html).toContain('photo-editor-not-served');
    expect(html).toContain(PHOTO_EDITOR_NOT_SERVED.code);
    expect(html).toContain('0.17.0');
    expect(html).not.toContain('<iframe');
  });

  it('available state: the real iframe with the prescribed attributes', () => {
    const html = render({
      initialSourceAsset: readyImage,
      embedProbe: { status: 'available', partsLine: 'photocraft-parts 1' },
    });
    expect(html).toContain('photo-editor-frame');
    expect(html).toContain('src="/photo-editor/index.html"');
    expect(html).toContain('clipboard-write');
    expect(html).toContain('allow-downloads');
  });

  it('no upstream branding appears in any rendered state', () => {
    const states = [
      render({ assetsState: 'loading', assets: [] }),
      render({ assets: [pendingImage] }),
      render({ initialSourceAsset: readyImage, embedProbe: null }),
      render({
        initialSourceAsset: readyImage,
        embedProbe: { status: 'unavailable', reason: 'x' },
      }),
      render({
        initialSourceAsset: readyImage,
        embedProbe: { status: 'available', partsLine: 'photocraft-parts 1' },
      }),
    ];
    for (const html of states) {
      expect(html).not.toContain('PhotoCraft');
      expect(html).not.toContain('ArtCraft');
    }
  });

  it('save-back zone names the derived copy before saving', () => {
    const html = render({
      initialSourceAsset: readyImage,
      initialExportFile: exportPng,
      upload: async () => asset({}),
    });
    expect(html).toContain('photo-save-name');
    expect(html).toContain('thali-edited.png');
    expect(html).toContain('photo-save-button');
  });

  it('save-back zone refuses an unusable export with the plan reason', () => {
    const html = render({
      initialSourceAsset: readyImage,
      initialExportFile: new File(['x'], 'anim.gif', { type: 'image/gif' }),
      upload: async () => asset({}),
    });
    expect(html).toContain('photo-save-invalid');
    expect(html).toContain('not an editor export');
  });

  it('save-back is off, honestly, when no upload seam is wired', () => {
    const html = render({ initialSourceAsset: readyImage, initialExportFile: exportPng });
    expect(html).toContain('photo-save-off');
    expect(html).not.toContain('photo-save-button');
  });

  it('saved state renders the new asset and the untouched-original note', () => {
    const saved = asset({ id: 'asset-2', filename: 'thali-edited.png' });
    const html = render({
      initialSourceAsset: readyImage,
      initialExportFile: exportPng,
      initialSavedAsset: saved,
      upload: async () => saved,
    });
    expect(html).toContain('photo-saved');
    expect(html).toContain('thali-edited.png');
    expect(html).toContain('original is untouched');
  });
});
