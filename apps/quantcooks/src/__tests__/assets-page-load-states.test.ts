// ============================================================================
// QuantCooks — assets page LOAD states (src/pages/assets.tsx): a failed
// read is a named load error inside the shell, never the generic
// full-page crash state, and never the empty state.
//
// The defect (2026-10-29 screenshot run, 12-assets.png): with the
// backend unreachable the proxy answers an EMPTY body, the api
// client's res.json() rejects with "Unexpected end of JSON input",
// and the page's error branch bailed out of the whole page into the
// bare shared ErrorState — default title "Something went wrong", raw
// parser message, library shell gone. These tests pin the fixed
// behaviour at the page's seams, in the established pattern of
// assets-page-honesty.test.ts (hook states injected, page rendered
// server-side):
//   1. failed/unparseable read → named load-error panel INSIDE the
//      shell, with a retry wired, error detail framed (not hidden,
//      not the whole page), count shown as a dash, not a fake 0;
//   2. a genuinely empty SUCCESSFUL read → the EMPTY state, and the
//      error panel nowhere;
//   3. a successful read with assets → the library, neither state.
// The 401 → sign-in swap is pinned too: it still wins over the panel.
// (The Retry click → successful re-read → library flow is a client
// interaction and lives in assets-page-retry.test.ts.)
// ============================================================================

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';

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
  ErrorState: (p: { title?: string; message?: string; onRetry?: () => void }) =>
    React.createElement(
      'div',
      { 'data-mock-error-state': 'true', 'data-has-retry': p.onRetry ? 'true' : 'false' },
      p.title ?? '',
      ' ',
      p.message ?? 'error',
    ),
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

import AssetsPageLibrary, { describeAssetsLoadError } from '../pages/assets';
import type { ServerAsset } from '../services/api-client';

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

const oneProject = {
  data: [{ id: 'proj-9', name: 'Dinner Reel' }],
  isLoading: false,
  error: null,
};
const failedRead = (error: Error) => ({
  data: undefined,
  isLoading: false,
  error,
  refetch: vi.fn(),
});
const successfulRead = (data: ServerAsset[]) => ({
  data,
  isLoading: false,
  error: null,
  refetch: vi.fn(),
});
const renderPage = () => renderToStaticMarkup(React.createElement(AssetsPageLibrary, null));

// ---------------------------------------------------------------------------
// The seam — the failure gets a name and an honest frame
// ---------------------------------------------------------------------------

describe('describeAssetsLoadError — named, framed, detail kept', () => {
  it('names the load failure and keeps the real parser detail, framed', () => {
    const view = describeAssetsLoadError(new SyntaxError('Unexpected end of JSON input'));
    expect(view.title).toBe('Couldn’t load your library');
    expect(view.message).toContain('Unexpected end of JSON input');
    expect(view.message).toContain('nothing was changed');
    // The generic crash wording is never the page's answer to a bad read.
    expect(view.title).not.toContain('Something went wrong');
  });

  it('a network failure frames the same way with its own detail', () => {
    const view = describeAssetsLoadError(new TypeError('Failed to fetch'));
    expect(view.title).toBe('Couldn’t load your library');
    expect(view.message).toContain('Failed to fetch');
  });

  it('a detail-less failure still renders a complete sentence', () => {
    const view = describeAssetsLoadError({});
    expect(view.message).toContain('nothing was changed');
    expect(view.message).not.toContain('()');
    expect(view.message).not.toContain('undefined');
  });
});

// ---------------------------------------------------------------------------
// State 1 — failed read: named panel inside the shell
// ---------------------------------------------------------------------------

describe('failed read — load-error panel, shell stays up', () => {
  it('an empty-body parse failure renders the named panel, not a crash page', () => {
    assetsHookState.current = failedRead(new SyntaxError('Unexpected end of JSON input'));
    projectsHookState.current = oneProject;
    const html = renderPage();
    expect(html).toContain('data-testid="assets-load-error"');
    expect(html).toContain('Couldn’t load your library');
    expect(html).toContain('Unexpected end of JSON input');
    // A retry is wired (the mock records that onRetry was passed).
    expect(html).toContain('data-has-retry="true"');
    // The shell is still the page: tabs + upload zone render around the panel.
    expect(html).toContain('asset-library');
    expect(html).toContain('Drop files here or click to upload');
    // The count is a dash while nothing has loaded — never a fake 0.
    expect(html).toContain('folder-count">—<');
    // And it is NOT the empty state: a failed read is not an empty library.
    expect(html).not.toContain('No assets found');
    expect(html).not.toContain('Upload files to build your library');
    // Nor the sign-in state: a parse failure is not an auth failure.
    expect(html).not.toContain('sign-in required');
  });

  it('a 401-shaped failure still swaps to sign-in, never the panel', () => {
    assetsHookState.current = failedRead(
      new Error('Missing or invalid authorization header'),
    );
    projectsHookState.current = oneProject;
    const html = renderPage();
    expect(html).toContain('sign-in required');
    expect(html).not.toContain('assets-load-error');
  });
});

// ---------------------------------------------------------------------------
// State 2 — successful EMPTY read: the empty state, no panel
// ---------------------------------------------------------------------------

describe('successful empty read — empty state, distinct from error', () => {
  it('zero assets renders "No assets found" and no load-error panel', () => {
    assetsHookState.current = successfulRead([]);
    projectsHookState.current = oneProject;
    const html = renderPage();
    expect(html).toContain('No assets found');
    expect(html).toContain('Upload files to build your library');
    expect(html).not.toContain('assets-load-error');
    expect(html).not.toContain('Couldn’t load your library');
    // A truthful 0 this time: the read succeeded and found nothing.
    expect(html).toContain('folder-count">0<');
  });
});

// ---------------------------------------------------------------------------
// State 3 — successful read with assets: the library itself
// ---------------------------------------------------------------------------

describe('successful read — the library renders', () => {
  it('assets render as cards; neither the panel nor the empty state appears', () => {
    assetsHookState.current = successfulRead([imageAsset]);
    projectsHookState.current = oneProject;
    const html = renderPage();
    expect(html).toContain('butter-chicken.jpg');
    expect(html).not.toContain('assets-load-error');
    expect(html).not.toContain('No assets found');
    expect(html).toContain('folder-count">1<');
  });
});
