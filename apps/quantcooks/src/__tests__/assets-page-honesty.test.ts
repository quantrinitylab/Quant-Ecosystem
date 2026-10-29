// ============================================================================
// QuantCooks — assets-page honesty fix: real upload, real delete, honest
// tabs (src/pages/assets.tsx).
//
// Three fabrications were removed from the assets page:
//  1. Upload was SIMULATED — a setInterval fake percentage that never
//     called the backend. Uploads now run the real P0-3 flow
//     (useAssetUpload) into a real project target, show stage text only
//     (the hook exposes no percentage), and surface real errors.
//  2. Delete was a no-op comment; it now calls apiClient.deleteAsset
//     behind an inline confirm and refreshes via the real query.
//  3. A tab labelled as a stock library listed the caller's own assets.
//
// Testing approach (the established Units 1–6 pattern): the async flows
// are driven at their exported seams (runAssetUpload / runAssetDelete /
// resolveUploadProjectId) with mocked deps; the transient UI states are
// rendered server-side through the page's initial-* props because SSR
// cannot click; the wiring that only a click reaches is pinned at
// source level, like the small-fixes D-1 pins.
// ============================================================================

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const assetsHookState = vi.hoisted(() => ({ current: null as unknown }));
const projectsHookState = vi.hoisted(() => ({ current: null as unknown }));

vi.mock('../hooks/useAssets', () => ({
  useAssets: () => assetsHookState.current,
  useAssetUpload: () => ({ mutateAsync: vi.fn(async () => undefined), isPending: false }),
}));
vi.mock('../hooks/useProjects', () => ({
  useProjects: () => projectsHookState.current,
}));
vi.mock('@quant/shared-ui', () => ({
  LoadingState: (p: { text?: string }) => React.createElement('div', null, p.text ?? 'loading'),
  ErrorState: (p: { message?: string }) => React.createElement('div', null, p.message ?? 'error'),
  EmptyState: (p: { title?: string; description?: string }) =>
    React.createElement('div', null, p.title ?? 'empty', ' ', p.description ?? ''),
}));
vi.mock('../components/PageTransition', () => ({
  PageTransition: (p: { children?: React.ReactNode }) =>
    React.createElement(React.Fragment, null, p.children),
}));
vi.mock('../components/SignInRequired', () => ({
  SignInRequired: () => React.createElement('div', null, 'sign-in required'),
}));

import AssetsPageLibrary, {
  runAssetUpload,
  runAssetDelete,
  resolveUploadProjectId,
  assetUploadStageLabel,
  type AssetUploadEntry,
} from '../pages/assets';
import type { ServerAsset } from '../services/api-client';

const here = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(here, '..', '..');
const pageSource = readFileSync(join(APP_ROOT, 'src', 'pages', 'assets.tsx'), 'utf8');

const imageAsset: ServerAsset = {
  id: 'asset-1',
  projectId: 'proj-1',
  filename: 'butter-chicken.jpg',
  type: 'image',
  size: 2048,
  uploadedAt: '2026-10-01T10:00:00.000Z',
  url: 'https://storage.example/quantcooks/proj-1/asset-1/butter-chicken.jpg?sig=abc',
  uploadStatus: 'READY',
  storageKey: 'quantcooks/proj-1/asset-1/butter-chicken.jpg',
};

const setHooks = (
  assets: unknown,
  projects: unknown,
) => {
  assetsHookState.current = assets;
  projectsHookState.current = projects;
};
const readyAssets = (data: ServerAsset[]) => ({
  data,
  isLoading: false,
  error: null,
  refetch: vi.fn(),
});
const noProjects = { data: [], isLoading: false, error: null };
const oneProject = {
  data: [{ id: 'proj-9', name: 'Dinner Reel' }],
  isLoading: false,
  error: null,
};
const renderPage = (props: Record<string, unknown> = {}) =>
  renderToStaticMarkup(React.createElement(AssetsPageLibrary, props));

// ---------------------------------------------------------------------------
// Defect 1 — upload target resolution
// ---------------------------------------------------------------------------

describe('upload target — the studio pages’ rule', () => {
  it('an explicit project id wins over the project list', () => {
    expect(resolveUploadProjectId('proj-explicit', [{ id: 'proj-9' }])).toBe('proj-explicit');
  });

  it('otherwise the most recent project is the target', () => {
    expect(resolveUploadProjectId(undefined, [{ id: 'proj-9' }, { id: 'proj-8' }])).toBe('proj-9');
  });

  it('no project at all resolves to null (uploads stay off)', () => {
    expect(resolveUploadProjectId(undefined, [])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Defect 1 — the upload seam runs the real flow, errors untouched
// ---------------------------------------------------------------------------

describe('runAssetUpload — real P0-3 seam', () => {
  it('invokes the injected uploader with the file and returns the landed asset', async () => {
    const file = new File(['bytes'], 'naan.png', { type: 'image/png' });
    const upload = vi.fn(async () => imageAsset);
    const outcome = await runAssetUpload(file, upload);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(upload).toHaveBeenCalledWith(file);
    expect(outcome).toEqual({ status: 'done', asset: imageAsset });
  });

  it('a real backend error (STORAGE_NOT_CONFIGURED 503) passes through untouched', async () => {
    const file = new File(['bytes'], 'naan.png', { type: 'image/png' });
    const upload = vi.fn(async () => {
      throw new Error('Storage is not configured (STORAGE_NOT_CONFIGURED)');
    });
    const outcome = await runAssetUpload(file, upload);
    expect(outcome).toEqual({
      status: 'error',
      message: 'Storage is not configured (STORAGE_NOT_CONFIGURED)',
    });
  });
});

describe('upload stage label — no invented percentage', () => {
  it('a working entry names the stage, never a percent', () => {
    const entry: AssetUploadEntry = { id: 'u1', filename: 'naan.png', phase: 'working' };
    const label = assetUploadStageLabel(entry);
    expect(label).toContain('Uploading naan.png');
    expect(label).toContain('sending it to storage and confirming it landed');
    expect(label).not.toContain('%');
  });

  it('an error entry has no stage label (its real error renders instead)', () => {
    const entry: AssetUploadEntry = { id: 'u1', filename: 'naan.png', phase: 'error', error: 'x' };
    expect(assetUploadStageLabel(entry)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Defect 2 — the delete seam: confirm-gated call + real refresh
// ---------------------------------------------------------------------------

describe('runAssetDelete — real deleteAsset + refetch', () => {
  it('calls deleteAsset with the asset id and refetches the list on success', async () => {
    const deleteAsset = vi.fn(async () => ({ success: true }));
    const refetch = vi.fn();
    const outcome = await runAssetDelete('asset-1', { deleteAsset, refetch });
    expect(deleteAsset).toHaveBeenCalledTimes(1);
    expect(deleteAsset).toHaveBeenCalledWith('asset-1');
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(outcome).toEqual({ status: 'deleted' });
  });

  it('a refused delete keeps the asset: real message out, no refetch', async () => {
    const deleteAsset = vi.fn(async () => ({
      success: false,
      error: { message: 'Asset is used by a project and cannot be deleted' },
    }));
    const refetch = vi.fn();
    const outcome = await runAssetDelete('asset-1', { deleteAsset, refetch });
    expect(outcome).toEqual({
      status: 'error',
      message: 'Asset is used by a project and cannot be deleted',
    });
    expect(refetch).not.toHaveBeenCalled();
  });

  it('a thrown error also surfaces untouched and skips the refetch', async () => {
    const deleteAsset = vi.fn(async () => {
      throw new Error('Network unreachable');
    });
    const refetch = vi.fn();
    const outcome = await runAssetDelete('asset-1', { deleteAsset, refetch });
    expect(outcome).toEqual({ status: 'error', message: 'Network unreachable' });
    expect(refetch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Rendering — upload zone states
// ---------------------------------------------------------------------------

describe('upload zone — enabled only with a real target', () => {
  it('with a project, the zone invites a real upload and nothing is disabled', () => {
    setHooks(readyAssets([]), oneProject);
    const html = renderPage();
    expect(html).toContain('Drop files here or click to upload');
    expect(html).not.toContain('assets-upload-unavailable');
    expect(html).not.toContain('disabled');
  });

  it('with no project, the zone is disabled WITH the reason and the way out', () => {
    setHooks(readyAssets([]), noProjects);
    const html = renderPage();
    expect(html).toContain('data-testid="assets-upload-unavailable"');
    expect(html).toContain('Uploads are saved into a project.');
    expect(html).toContain('Create a project first');
    expect(html).toContain('href="/projects"');
    expect(html).toContain('disabled=""');
    // A disabled zone never advertises the working copy.
    expect(html).not.toContain('Drop files here or click to upload');
  });

  it('while projects load, the zone waits instead of crying "no project"', () => {
    setHooks(readyAssets([]), { data: undefined, isLoading: true, error: null });
    const html = renderPage();
    expect(html).toContain('Finding a project to save uploads into…');
    expect(html).not.toContain('Create a project first');
  });

  it('an explicit projectId prop enables uploads even with an empty list', () => {
    setHooks(readyAssets([]), noProjects);
    const html = renderPage({ projectId: 'proj-explicit' });
    expect(html).toContain('Drop files here or click to upload');
    expect(html).not.toContain('assets-upload-unavailable');
  });
});

// ---------------------------------------------------------------------------
// Rendering — upload entries: stage text and real errors, never a percent
// ---------------------------------------------------------------------------

describe('upload entries — stage and error rendering', () => {
  it('a working entry renders the stage label and no progress bar / percent', () => {
    setHooks(readyAssets([]), oneProject);
    const html = renderPage({
      initialUploadEntries: [{ id: 'u1', filename: 'naan.png', phase: 'working' }],
    });
    expect(html).toContain('Uploading naan.png — sending it to storage and confirming it landed…');
    expect(html).not.toContain('progress-fill');
    expect(html).not.toContain('progress-percent');
    expect(html).not.toContain('%');
  });

  it('a failed entry renders the real 503 message with a dismiss action', () => {
    setHooks(readyAssets([]), oneProject);
    const html = renderPage({
      initialUploadEntries: [
        {
          id: 'u1',
          filename: 'naan.png',
          phase: 'error',
          error: 'Storage is not configured (STORAGE_NOT_CONFIGURED)',
        },
      ],
    });
    expect(html).toContain('Storage is not configured (STORAGE_NOT_CONFIGURED)');
    expect(html).toContain('Dismiss');
  });
});

// ---------------------------------------------------------------------------
// Rendering — delete confirm and delete error
// ---------------------------------------------------------------------------

describe('delete — inline confirm + failure keeps the asset', () => {
  it('the confirm state names the file and offers delete / keep', () => {
    setHooks(readyAssets([imageAsset]), oneProject);
    const html = renderPage({ initialConfirmingDeleteId: 'asset-1' });
    expect(html).toContain('Delete butter-chicken.jpg?');
    expect(html).toContain('Yes, delete');
    expect(html).toContain('Keep it');
  });

  it('without the confirm step, the card shows only the delete trigger', () => {
    setHooks(readyAssets([imageAsset]), oneProject);
    const html = renderPage();
    expect(html).toContain('aria-label="Delete butter-chicken.jpg"');
    expect(html).not.toContain('Yes, delete');
  });

  it('a failed delete keeps the asset in the list and shows the real error', () => {
    setHooks(readyAssets([imageAsset]), oneProject);
    const html = renderPage({
      initialDeleteError: {
        id: 'asset-1',
        message: 'Asset is used by a project and cannot be deleted',
      },
    });
    expect(html).toContain('butter-chicken.jpg');
    expect(html).toContain('Asset is used by a project and cannot be deleted');
  });
});

// ---------------------------------------------------------------------------
// Photo Editor entry point (C-3 follow-up F-C3-3, shared-file batch #4)
// ---------------------------------------------------------------------------

describe('photo editor entry — image cards link to /studio/photo', () => {
  const videoAsset: ServerAsset = {
    ...imageAsset,
    id: 'asset-2',
    filename: 'sizzle-reel.mp4',
    type: 'video',
    url: 'https://storage.example/quantcooks/proj-1/asset-2/sizzle-reel.mp4?sig=def',
    storageKey: 'quantcooks/proj-1/asset-2/sizzle-reel.mp4',
  };

  it('an image card carries an Edit action to the Photo Editor route', () => {
    setHooks(readyAssets([imageAsset]), oneProject);
    const html = renderPage();
    expect(html).toContain('href="/studio/photo"');
    expect(html).toContain('aria-label="Edit butter-chicken.jpg in the Photo Editor"');
    // The delete trigger is untouched beside it.
    expect(html).toContain('aria-label="Delete butter-chicken.jpg"');
  });

  it('a non-image card gets no Edit action (the editor is raster-only)', () => {
    setHooks(readyAssets([videoAsset]), oneProject);
    const html = renderPage();
    expect(html).not.toContain('href="/studio/photo"');
    expect(html).not.toContain('in the Photo Editor');
  });

  it('the link is the plain route — no per-asset deep-link is claimed', () => {
    expect(pageSource).toContain('href="/studio/photo"');
    expect(pageSource).not.toContain('/studio/photo?');
    expect(pageSource).not.toContain('assetId=');
  });
});

// ---------------------------------------------------------------------------
// Defect 3 — tabs labelled by what they filter
// ---------------------------------------------------------------------------

describe('tabs — honest labels, no stock-library claim', () => {
  it('renders All / Photos & Video / Audio and never a Stock tab', () => {
    setHooks(readyAssets([imageAsset]), oneProject);
    const html = renderPage();
    expect(html).toContain('>All<');
    expect(html).toContain('Photos &amp; Video');
    expect(html).toContain('>Audio<');
    expect(html).not.toContain('>Stock<');
    expect(html).not.toContain('browse stock media');
  });
});

// ---------------------------------------------------------------------------
// Source pins — the fabrications cannot quietly return
// ---------------------------------------------------------------------------

describe('source pins — no simulation, real wiring', () => {
  it('no setInterval-driven fake progress remains anywhere in the page', () => {
    // Call form: the header comment names the removed mechanism in prose.
    expect(pageSource).not.toContain('setInterval(');
    expect(pageSource).not.toContain('uploadProgress');
    expect(pageSource).not.toContain('progress-fill');
    expect(pageSource).not.toContain('progress-percent');
  });

  it('uploads go through the real hook with the resolved target project', () => {
    expect(pageSource).toContain('useAssetUpload()');
    expect(pageSource).toContain('mutateAsync({ projectId: uploadProjectId, file: f })');
    expect(pageSource).toContain('resolveUploadProjectId(projectId, projectsQuery.data ?? [])');
    // The no-target guard: a stray drop cannot pretend to upload.
    expect(pageSource).toContain('if (!files || !uploadProjectId) return;');
    expect(pageSource).toContain('disabled={!uploadsEnabled}');
  });

  it('delete goes through the real apiClient method behind the seam', () => {
    expect(pageSource).toContain('apiClient.deleteAsset(id)');
    expect(pageSource).toContain('runAssetDelete(asset.id, {');
    // The old no-op stub is gone.
    expect(pageSource).not.toContain('would be triggered here in production');
  });

  it('no stock-library claim remains in labels or copy', () => {
    expect(pageSource).not.toContain("label: 'Stock'");
    expect(pageSource).not.toContain('browse stock media');
    expect(pageSource).toContain("label: 'Photos & Video'");
  });
});
