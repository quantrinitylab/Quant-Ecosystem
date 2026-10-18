// @vitest-environment jsdom
// ============================================================================
// QC-F-453 — useReelsFeed client side: cursor-400 par imaandaar ant +
// flatten par id-dedupe (specialist-qc-f-453-buildprep §3.6, BAND)
// ============================================================================
//
// Backend ab invalid/deleted/blocked cursor par 400 INVALID_CURSOR deta
// hai (pehli page repeat NAHI). Client ke do band badlaav pin hain:
//   H1 [NC] cursor-wali request par 400 → terminal page: pehle ke pages
//           aparivartit rahte hain, hasMore false ho jata hai, koi repeat
//           NAHI judta. (Purana hook: throw → chain error me fansi rehti,
//           hasMore jhootha true bana rehta tha.)
//   H2 [NC] do pages overlap karein (refetch/repeat) to flatten par
//           id-dedupe — har reel exactly ek baar, pehla occurrence jeet-ta.
//   H3 control: saaf do-page safar pehle jaisa — saari reels kram me,
//           ant par hasMore false. (Dono versions par PASS.)
//
// Harness: QC-F-449 pattern — createRoot + QueryClientProvider, REAL
// useReelsFeed hook, '@quant/api-client' ka apiFetchRaw stable
// module-level hoisted mock se (fresh-identity mock NAHI).
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const api = vi.hoisted(() => ({ fetchRaw: vi.fn() }));

vi.mock('@quant/api-client', () => ({ apiFetchRaw: api.fetchRaw }));

import { useReelsFeed, type Reel } from '../hooks/useReelsFeed';

function makeReel(id: string): Reel {
  return {
    id,
    creatorId: 'creator-1',
    creatorUsername: 'creator_one',
    creatorAvatar: '',
    videoUrl: `https://cdn.example.com/${id}.mp4`,
    thumbnailUrl: `https://cdn.example.com/${id}.jpg`,
    caption: `reel ${id}`,
    duration: 10,
    likeCount: 0,
    commentCount: 0,
    shareCount: 0,
    watchThroughRate: 0.5,
    createdAt: new Date(1_760_000_000_000).toISOString(),
    isLikedByUser: false,
  };
}

function okPage(ids: string[], nextCursor: string | null) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => ({
      success: true,
      data: {
        reels: ids.map(makeReel),
        nextCursor,
        hasMore: nextCursor !== null,
        totalAvailable: ids.length,
      },
    }),
  };
}

function errResponse(status: number, statusText: string) {
  return {
    ok: false,
    status,
    statusText,
    json: async () => ({ success: false, error: { code: 'INVALID_CURSOR', message: 'Invalid cursor' } }),
  };
}

function cursorOf(call: unknown[]): string | undefined {
  const url = String(call[0]);
  return new URLSearchParams(url.split('?')[1] ?? '').get('cursor') ?? undefined;
}

function Probe({ onNext }: { onNext: (fn: () => void) => void }) {
  const { reels, hasMore, fetchNextPage, isLoading } = useReelsFeed();
  onNext(fetchNextPage);
  return (
    <div>
      <span data-testid="ids">{reels.map((r) => r.id).join(',')}</span>
      <span data-testid="hasMore">{String(hasMore)}</span>
      <span data-testid="loading">{String(isLoading)}</span>
    </div>
  );
}

async function settle(ms = 20) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

describe('QC-F-453 useReelsFeed cursor handling', () => {
  let container: HTMLDivElement;
  let root: Root;
  let qc: QueryClient;
  let nextFn: () => void = () => undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    qc.clear();
    container.remove();
  });

  async function render() {
    await act(async () => {
      root.render(
        <QueryClientProvider client={qc}>
          <Probe onNext={(fn) => { nextFn = fn; }} />
        </QueryClientProvider>,
      );
    });
    await settle(30);
  }

  function ids(): string {
    return container.querySelector('[data-testid="ids"]')?.textContent ?? '';
  }
  function hasMore(): string {
    return container.querySelector('[data-testid="hasMore"]')?.textContent ?? '';
  }

  async function fetchNext() {
    await act(async () => {
      nextFn();
    });
    await settle(30);
  }

  it('H1 [NC] cursor par 400 → terminal page: purani reels barkarar, hasMore false, repeat NAHI', async () => {
    api.fetchRaw.mockImplementation(async (...args: unknown[]) => {
      const cursor = cursorOf(args);
      if (!cursor) return okPage(['r1', 'r2'], 'r2');
      // Cursor reel delete ho gayi — server 400 INVALID_CURSOR deta hai.
      return errResponse(400, 'Bad Request');
    });
    await render();
    expect(ids()).toBe('r1,r2');
    expect(hasMore()).toBe('true');

    await fetchNext();
    // Ant imaandaar hai: wahi do reels, koi duplicate NAHI, hasMore false.
    expect(ids()).toBe('r1,r2');
    expect(hasMore()).toBe('false');
  });

  it('H2 [NC] overlapping dusra page → flatten par id-dedupe, har reel ek baar', async () => {
    api.fetchRaw.mockImplementation(async (...args: unknown[]) => {
      const cursor = cursorOf(args);
      if (!cursor) return okPage(['r1', 'r2'], 'r2');
      // Overlap: dusra page r2 dohrata hai (refetch/repeat wala raasta).
      return okPage(['r2', 'r3'], null);
    });
    await render();
    await fetchNext();
    expect(ids()).toBe('r1,r2,r3');
    expect(hasMore()).toBe('false');
  });

  it('H3 control: saaf do-page safar — kram barkarar, ant par hasMore false', async () => {
    api.fetchRaw.mockImplementation(async (...args: unknown[]) => {
      const cursor = cursorOf(args);
      if (!cursor) return okPage(['r1', 'r2'], 'r2');
      expect(cursor).toBe('r2');
      return okPage(['r3'], null);
    });
    await render();
    expect(ids()).toBe('r1,r2');
    await fetchNext();
    expect(ids()).toBe('r1,r2,r3');
    expect(hasMore()).toBe('false');
  });
});
