// @vitest-environment jsdom
// ============================================================================
// Shared/Starred failure semantics (drive page corrective).
//
// Mount-level tests:
//  1. DriveSharedByMeSubView with error → role="alert" banner with the
//     honest message; the false "haven't shared anything yet" empty state
//     does NOT render; no list rows render.
//  2. DriveSharedSubView / DriveStarredSubView error banners carry
//     role="alert" (mobile screen-reader announcement).
//  3. useDrive: fetchReceivedShares / fetchSentShares REJECT on HTTP failure
//     (so the page-level catch can clear the list + set the error banner —
//     the previous swallow-into-[] made that catch dead code).
//  4. useDrive: a failed file-list load sets filesError (dedicated signal
//     for the Starred tab's clear + honest error).
//
// Mount pattern: jsdom + createRoot + act, IS_REACT_ACT_ENVIRONMENT, no
// @testing-library/react (not a dependency).
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { createRoot, type Root } from 'react-dom/client';
import { DriveSharedSubView } from '../app/drive/components/DriveSharedSubView';
import { DriveSharedByMeSubView } from '../app/drive/components/DriveSharedByMeSubView';
import { DriveStarredSubView } from '../app/drive/components/DriveStarredSubView';
import { useDrive } from '../hooks/useDrive';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));

vi.mock('../services/browser-api-request', () => ({
  browserApiRequest: apiMock,
}));

type DriveApi = ReturnType<typeof useDrive>;
let seen: DriveApi | null = null;

function DriveProbe() {
  const api = useDrive();
  seen = api;
  return null;
}

async function mount(el: React.ReactElement): Promise<{ root: Root; container: HTMLDivElement }> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(el);
  });
  return { root, container };
}

async function settle(rounds = 6): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

beforeEach(() => {
  apiMock.mockReset();
  seen = null;
});

afterEach(async () => {
  document.body.innerHTML = '';
});

describe('DriveSharedByMeSubView failure semantics', () => {
  it('renders role=alert error banner, not the false empty state, on failure', async () => {
    const { root, container } = await mount(
      <DriveSharedByMeSubView
        items={[]}
        loading={false}
        error="Shared-by-me items could not be loaded. Try again in a moment."
      />,
    );
    const alert = container.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert?.textContent).toContain("Couldn't load shared-by-me items");
    expect(alert?.textContent).toContain('Shared-by-me items could not be loaded');
    expect(container.textContent).not.toContain("haven't shared anything yet");
    await act(async () => root.unmount());
  });

  it('renders the honest empty state when loaded with no error', async () => {
    const { root, container } = await mount(
      <DriveSharedByMeSubView items={[]} loading={false} error={null} />,
    );
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.textContent).toContain("haven't shared anything yet");
    await act(async () => root.unmount());
  });
});

describe('shared/starred error banners are announced', () => {
  it('DriveSharedSubView error banner carries role=alert', async () => {
    const { root, container } = await mount(
      <DriveSharedSubView shares={[]} loading={false} error="boom" />,
    );
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    await act(async () => root.unmount());
  });

  it('DriveStarredSubView error banner carries role=alert', async () => {
    const { root, container } = await mount(
      <DriveStarredSubView items={[]} loading={false} error="boom" />,
    );
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    await act(async () => root.unmount());
  });
});

describe('useDrive share-fetch failure observability', () => {
  it('fetchReceivedShares rejects on HTTP failure', async () => {
    apiMock.mockResolvedValue({ ok: false, status: 500 });
    const { root } = await mount(<DriveProbe />);
    await settle();
    await expect(seen?.fetchReceivedShares()).rejects.toThrow();
    await act(async () => root.unmount());
  });

  it('fetchSentShares rejects on HTTP failure', async () => {
    apiMock.mockResolvedValue({ ok: false, status: 500 });
    const { root } = await mount(<DriveProbe />);
    await settle();
    await expect(seen?.fetchSentShares()).rejects.toThrow();
    await act(async () => root.unmount());
  });

  it('a failed file-list load sets filesError', async () => {
    apiMock.mockResolvedValue({ ok: false, status: 500 });
    const { root } = await mount(<DriveProbe />);
    await settle();
    await act(async () => {
      await seen?.fetchFiles();
    });
    expect(seen?.filesError).toContain('temporarily unavailable');
    await act(async () => root.unmount());
  });

  it('a successful file-list load clears filesError', async () => {
    apiMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ files: [], quota: null }),
    });
    const { root } = await mount(<DriveProbe />);
    await settle();
    await act(async () => {
      await seen?.fetchFiles();
    });
    expect(seen?.filesError).toBeNull();
    await act(async () => root.unmount());
  });
});
