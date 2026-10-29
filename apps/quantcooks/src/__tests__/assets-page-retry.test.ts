// @vitest-environment jsdom
// ============================================================================
// QuantCooks — assets page Retry flow (src/pages/assets.tsx), client-side.
//
// The load-states suite (assets-page-load-states.test.ts) pins the
// rendered states server-side; this suite proves the INTERACTION the
// defect report demands: after a failed read (the empty-body parse
// failure, "Unexpected end of JSON input"), the panel's Retry re-runs
// the read, and when that read succeeds the library itself renders —
// the panel is a state, not a dead end. The useAssets hook is mocked
// as a small stateful stand-in: its refetch flips the scenario from
// failed to successful and forces the re-render, exactly the contract
// the real react-query refetch fulfils.
// ============================================================================

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const scenario = vi.hoisted(() => ({ mode: 'error' as 'error' | 'ready', refetchCalls: 0 }));

const imageAsset = {
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

vi.mock('../hooks/useAssets', () => ({
  useAssets: () => {
    const [, force] = React.useReducer((c: number) => c + 1, 0);
    if (scenario.mode === 'error') {
      return {
        data: undefined,
        isLoading: false,
        error: new SyntaxError('Unexpected end of JSON input'),
        refetch: () => {
          scenario.refetchCalls += 1;
          scenario.mode = 'ready';
          force();
        },
      };
    }
    return { data: [imageAsset], isLoading: false, error: null, refetch: () => {} };
  },
  useAssetUpload: () => ({ mutateAsync: vi.fn(async () => undefined), isPending: false }),
}));
vi.mock('../hooks/useProjects', () => ({
  useProjects: () => ({
    data: [{ id: 'proj-9', name: 'Dinner Reel' }],
    isLoading: false,
    error: null,
  }),
}));
vi.mock('@quant/shared-ui', () => ({
  LoadingState: (p: { text?: string }) => React.createElement('div', null, p.text ?? 'loading'),
  ErrorState: (p: { title?: string; message?: string; onRetry?: () => void }) =>
    React.createElement(
      'div',
      null,
      React.createElement('h3', null, p.title ?? ''),
      React.createElement('p', null, p.message ?? 'error'),
      p.onRetry
        ? React.createElement('button', { type: 'button', onClick: p.onRetry }, 'Try again')
        : null,
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

import AssetsPageLibrary from '../pages/assets';

describe('assets page — Retry re-runs the read', () => {
  it('failed read → Retry → successful read renders the library', async () => {
    render(React.createElement(AssetsPageLibrary, null));

    // The named load-error panel is what a failed read shows.
    expect(screen.getByTestId('assets-load-error')).toBeTruthy();
    expect(screen.getByText('Couldn’t load your library')).toBeTruthy();
    expect(screen.getByText(/Unexpected end of JSON input/)).toBeTruthy();
    expect(screen.queryByText('butter-chicken.jpg')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(scenario.refetchCalls).toBe(1);

    // The successful re-read replaces the panel with the library.
    expect(await screen.findByText('butter-chicken.jpg')).toBeTruthy();
    expect(screen.queryByTestId('assets-load-error')).toBeNull();
    expect(screen.queryByText('No assets found')).toBeNull();
  });
});
