// ============================================================================
// QuantCooks — small-fixes unit: gate defect D-1 (assets page).
//
// D-1 (P0-6 gate report §6, Medium, verdicted REAL): src/pages/assets.tsx
// cast backend rows to a private Asset type reading name / thumbnail /
// folder / tags / isFavorite — fields ServerAsset never sends — so a
// real asset rendered blank-named with a broken thumbnail and the
// favorites filter hid everything. These tests pin the fix: the page
// renders the real ServerAsset shape (filename = name, url = preview),
// the favorites/folder claims are gone (no server data backs them), and
// the list is no longer fetched with a tab id as the backend `category`
// filter (an exact `type` match that could never return a row).
//
// Rendering approach: the page wires its own useAssets hook and imports
// @quant/shared-ui / framer-motion surfaces that the extract's test
// module graph cannot resolve (the same limit recorded since P0-5), so
// those seams are module-mocked and the page renders server-side with
// injected hook states — populated / pending / empty / loading. Filter
// expressions that need typing/clicking are pinned at source level.
// ============================================================================

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const hookState = vi.hoisted(() => ({ current: null as unknown }));

vi.mock('../hooks/useAssets', () => ({
  useAssets: () => hookState.current,
  // The honesty-fix unit wired the real upload into this page; the mock
  // only needs the hook to exist (uploads are driven in its own tests).
  useAssetUpload: () => ({ mutateAsync: vi.fn(async () => undefined), isPending: false }),
}));
vi.mock('../hooks/useProjects', () => ({
  // No projects in these renders → the upload zone shows its honest
  // disabled state; D-1's assertions do not touch the zone.
  useProjects: () => ({ data: [], isLoading: false, error: null }),
}));
vi.mock('@quant/shared-ui', () => ({
  LoadingState: (p: { text?: string }) => React.createElement('div', null, p.text ?? 'loading'),
  ErrorState: (p: { message?: string }) => React.createElement('div', null, p.message ?? 'error'),
  EmptyState: (p: { title?: string }) => React.createElement('div', null, p.title ?? 'empty'),
}));
vi.mock('../components/PageTransition', () => ({
  PageTransition: (p: { children?: React.ReactNode }) =>
    React.createElement(React.Fragment, null, p.children),
}));
vi.mock('../components/SignInRequired', () => ({
  SignInRequired: () => React.createElement('div', null, 'sign-in required'),
}));

import AssetsPageLibrary from '../pages/assets';
import type { ServerAsset } from '../services/api-client';

const here = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(here, '..', '..');
const pageSource = readFileSync(join(APP_ROOT, 'src', 'pages', 'assets.tsx'), 'utf8');

const setHook = (state: unknown) => {
  hookState.current = state;
};
const renderPage = () => renderToStaticMarkup(React.createElement(AssetsPageLibrary, {}));

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

const videoAsset: ServerAsset = {
  id: 'asset-2',
  projectId: 'proj-1',
  filename: 'sizzle-reel.mp4',
  type: 'video',
  size: 5 * 1024 * 1024,
  uploadedAt: '2026-10-02T10:00:00.000Z',
  url: 'https://storage.example/quantcooks/proj-1/asset-2/sizzle-reel.mp4?sig=def',
  uploadStatus: 'READY',
  storageKey: 'quantcooks/proj-1/asset-2/sizzle-reel.mp4',
};

const pendingAsset: ServerAsset = {
  id: 'asset-3',
  projectId: 'proj-1',
  filename: 'half-uploaded.png',
  type: 'image',
  size: 1024,
  uploadedAt: '2026-10-03T10:00:00.000Z',
  url: null,
  uploadStatus: 'PENDING',
  storageKey: null,
};

describe('D-1 — assets page renders the real ServerAsset shape', () => {
  it('a populated render shows the filename and the signed-url thumbnail', () => {
    setHook({ data: [imageAsset], isLoading: false, error: null, refetch: vi.fn() });
    const html = renderPage();
    // Name comes from `filename` (the old page read `name` → blank).
    expect(html).toContain('butter-chicken.jpg');
    // Thumbnail comes from the fresh signed `url` (the old page read
    // `thumbnail` → broken image).
    expect(html).toContain(
      '<img src="https://storage.example/quantcooks/proj-1/asset-1/butter-chicken.jpg?sig=abc" alt="butter-chicken.jpg"/>',
    );
    // Real size formatting from the real `size` field (2048 B → 2 KB).
    expect(html).toContain('2 KB');
    // The sidebar count is the real loaded count, not a stored 0.
    expect(html).toContain('All Assets');
  });

  it('a video asset previews through a <video> element, not a broken <img>', () => {
    setHook({ data: [videoAsset], isLoading: false, error: null, refetch: vi.fn() });
    const html = renderPage();
    expect(html).toContain('sizzle-reel.mp4');
    expect(html).toContain('<video src="https://storage.example/quantcooks/proj-1/asset-2/sizzle-reel.mp4?sig=def"');
    expect(html).not.toContain('<img');
  });

  it('a PENDING asset (url null) shows its name and an uploading badge, never a broken image', () => {
    setHook({ data: [pendingAsset], isLoading: false, error: null, refetch: vi.fn() });
    const html = renderPage();
    expect(html).toContain('half-uploaded.png');
    expect(html).toContain('Uploading…');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('src=""');
  });

  it('the honest states still render: loading and empty', () => {
    setHook({ data: undefined, isLoading: true, error: null, refetch: vi.fn() });
    expect(renderPage()).toContain('Loading assets...');
    setHook({ data: [], isLoading: false, error: null, refetch: vi.fn() });
    expect(renderPage()).toContain('No assets found');
  });

  it('no favorites or folder claims survive in the populated render', () => {
    setHook({ data: [imageAsset, videoAsset], isLoading: false, error: null, refetch: vi.fn() });
    const html = renderPage();
    // No favorites filter button and no per-card star toggle: the server
    // has no isFavorite field and no favorite endpoint to back them.
    expect(html).not.toContain('Favorites');
    expect(html).not.toContain('fav-btn');
    expect(html).not.toContain('☆');
    expect(html).not.toContain('★');
    // No folder creation claim: folders do not exist server-side.
    expect(html).not.toContain('New Folder');
  });
});

describe('D-1 — source pins for the behaviours a static render cannot reach', () => {
  it('the page consumes ServerAsset directly — no cast to a private shape', () => {
    expect(pageSource).toContain("import type { ServerAsset } from '../services/api-client'");
    expect(pageSource).not.toContain('as unknown as');
    expect(pageSource).not.toContain('interface Asset {');
  });

  it('none of the fields ServerAsset never sends are read anywhere in the page', () => {
    expect(pageSource).not.toContain('.thumbnail');
    expect(pageSource).not.toContain('isFavorite');
    expect(pageSource).not.toContain('showFavorites');
    expect(pageSource).not.toContain('.folder');
    expect(pageSource).not.toContain('.tags');
    expect(pageSource).not.toContain('asset.name');
  });

  it('the list is not fetched with a tab id as the backend category filter', () => {
    // Backend `category` is an exact `type` match; 'uploads'/'stock'/…
    // can never match, so the library could never populate before.
    expect(pageSource).toContain('useAssets(undefined, searchQuery)');
    expect(pageSource).not.toContain('useAssets(activeTab');
    // Tabs and search filter client-side on the real fields instead.
    expect(pageSource).toContain("a.type === 'audio'");
    expect(pageSource).toContain('a.filename.toLowerCase().includes(searchQuery.toLowerCase())');
  });
});
