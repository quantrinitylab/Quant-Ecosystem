// @vitest-environment jsdom
// ===========================================================================
// QC-F-372 — Reels feed ka ERROR haal: fail feed jhootha "No reels
// available" NAHI dikhayega (specialist-qc-f-372-buildprep §8, BAND)
// ===========================================================================
//
// Pehle hook query ka error dab jata tha: useInfiniteQuery se error/isError
// destructure hi NAHI hote the aur page ke paas error branch hi NAHI tha —
// backend 500 / network fail / session-expired teeno safal-khaali wale
// "No reels available" me girte the, Retry ka raasta NAHI tha, aur agli-page
// failure ke baad page effect fetch ko khud dobara trigger kar sakta tha
// (khaamosh retry-loop). Fix: hook error/isError/refetch/nextPageError
// surface karta hai; page pehli-page error par imaandaar error state +
// Retry, agli-page error par loaded reels ke saath inline strip + Retry,
// aur effect-gate (fail ke baad auto-fetch NAHI).
//
// NC signature (original code par): E1/E2/E3 FAIL (hook return me
// isError/error/refetch/nextPageError field hi NAHI — undefined), P1 FAIL
// (page "No reels available" render karta hai, "Couldn't load reels."
// NAHI), P3 FAIL (inline strip hai hi NAHI). E4/E5/P2 controls dono
// versions par PASS (E5 pin karta hai ki QC-F-453 ka cursor-400 terminal
// ant error NAHI bana).
//
// Harness: QC-F-453 pattern — createRoot + QueryClientProvider (retry:
// false), asal useReelsFeed + asal ReelsPage, '@quant/api-client' ka
// apiFetchRaw stable module-level hoisted mock se (fresh-identity mock
// NAHI); page ke child components + framer-motion halke stub.
// ===========================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const api = vi.hoisted(() => ({ fetchRaw: vi.fn() }));
const nav = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock('@quant/api-client', () => ({ apiFetchRaw: api.fetchRaw }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, back: vi.fn() }),
}));

vi.mock('framer-motion', () => {
  const SAFE = /^(className|id|children|role|onClick|style)$|^(aria-|data-)/;
  const make = (tag: string) =>
    React.forwardRef(function MotionMock(props: Record<string, unknown>, ref: unknown) {
      const out: Record<string, unknown> = { ref };
      for (const key of Object.keys(props)) {
        if (SAFE.test(key)) out[key] = props[key];
      }
      return React.createElement(tag, out, props.children as React.ReactNode);
    });
  const motion = new Proxy({}, { get: (_t, tag: string) => make(typeof tag === 'string' ? tag : 'div') });
  return {
    motion,
    AnimatePresence: ({ children }: { children?: React.ReactNode }) => children,
  };
});

vi.mock('../app/reels/components/ReelPlayer', () => ({
  ReelPlayer: ({ videoUrl }: { videoUrl: string }) => (
    <div data-testid="reel-player">{videoUrl}</div>
  ),
}));
vi.mock('../app/reels/components/ReelOverlay', () => ({ ReelOverlay: () => null }));
vi.mock('../app/reels/components/CommentSheet', () => ({ CommentSheet: () => null }));
vi.mock('../app/reels/components/ShareSheet', () => ({ ShareSheet: () => null }));
vi.mock('../app/reels/components/DuetMode', () => ({ DuetMode: () => null }));

import { useReelsFeed, type Reel } from '../hooks/useReelsFeed';
import ReelsPage from '../app/reels/page';

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
    json: async () => ({ success: false, error: { code: 'ERR', message: 'failed' } }),
  };
}

function cursorOf(call: unknown[]): string | undefined {
  const url = String(call[0]);
  return new URLSearchParams(url.split('?')[1] ?? '').get('cursor') ?? undefined;
}

function cursorCallCount(): number {
  return api.fetchRaw.mock.calls.filter((c: unknown[]) => cursorOf(c)).length;
}

async function settle(ms = 30) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

async function click(el: Element) {
  await act(async () => {
    el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  });
  await settle(30);
}

function buttonByText(container: HTMLElement, text: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find(
    (b) => (b.textContent ?? '').trim() === text,
  ) as HTMLButtonElement | undefined;
}

// ---------------------------------------------------------------------------
// Hook parkh — asal useReelsFeed, error surface ke saare field span me
// ---------------------------------------------------------------------------

function Probe({ onReady }: { onReady: (fns: { refetch: () => void; fetchNextPage: () => void }) => void }) {
  const feed = useReelsFeed();
  onReady({ refetch: feed.refetch, fetchNextPage: feed.fetchNextPage });
  return (
    <div>
      <span data-testid="ids">{feed.reels.map((r) => r.id).join(',')}</span>
      <span data-testid="hasMore">{String(feed.hasMore)}</span>
      <span data-testid="isError">{String(feed.isError === true)}</span>
      <span data-testid="errorMsg">{feed.error?.message ?? ''}</span>
      <span data-testid="nextPageErrorMsg">{feed.nextPageError?.message ?? ''}</span>
    </div>
  );
}

describe('QC-F-372 useReelsFeed error surface', () => {
  let container: HTMLDivElement;
  let root: Root;
  let qc: QueryClient;
  let fns: { refetch: () => void; fetchNextPage: () => void } = {
    refetch: () => undefined,
    fetchNextPage: () => undefined,
  };

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
          <Probe onReady={(f) => { fns = f; }} />
        </QueryClientProvider>,
      );
    });
    await settle(40);
  }

  function field(id: string): string {
    return container.querySelector(`[data-testid="${id}"]`)?.textContent ?? '';
  }

  it('E1 [NC] pehli page 500 → isError true, error asal, reels khaali, nextPageError null', async () => {
    api.fetchRaw.mockImplementation(async () => errResponse(500, 'Internal Server Error'));
    await render();
    expect(field('isError')).toBe('true');
    expect(field('errorMsg')).toContain('Failed to fetch reels feed');
    expect(field('ids')).toBe('');
    expect(field('nextPageErrorMsg')).toBe('');
  });

  it('E2 [NC] pehli page fail ke baad refetch() safal → reels aa jayen, error saaf', async () => {
    let failing = true;
    api.fetchRaw.mockImplementation(async () =>
      failing ? errResponse(500, 'Internal Server Error') : okPage(['r1'], null),
    );
    await render();
    expect(field('isError')).toBe('true');
    failing = false;
    await act(async () => {
      fns.refetch();
    });
    await settle(40);
    expect(field('ids')).toBe('r1');
    expect(field('isError')).toBe('false');
    expect(field('errorMsg')).toBe('');
  });

  it('E3 [NC] dusri page 500 → pehli page ki reels barkarar, nextPageError non-null', async () => {
    api.fetchRaw.mockImplementation(async (...args: unknown[]) =>
      cursorOf(args) ? errResponse(500, 'Internal Server Error') : okPage(['r1', 'r2'], 'r2'),
    );
    await render();
    expect(field('ids')).toBe('r1,r2');
    await act(async () => {
      fns.fetchNextPage();
    });
    await settle(40);
    expect(field('ids')).toBe('r1,r2');
    expect(field('nextPageErrorMsg')).toContain('Failed to fetch reels feed');
    expect(field('isError')).toBe('true');
  });

  it('E4 control: safal-khaali page → isError false, error null, reels khaali', async () => {
    api.fetchRaw.mockImplementation(async () => okPage([], null));
    await render();
    expect(field('isError')).toBe('false');
    expect(field('errorMsg')).toBe('');
    expect(field('ids')).toBe('');
  });

  it('E5 control: QC-F-453 cursor-400 terminal ant error NAHI hai', async () => {
    api.fetchRaw.mockImplementation(async (...args: unknown[]) =>
      cursorOf(args) ? errResponse(400, 'Bad Request') : okPage(['r1', 'r2'], 'r2'),
    );
    await render();
    await act(async () => {
      fns.fetchNextPage();
    });
    await settle(40);
    expect(field('ids')).toBe('r1,r2');
    expect(field('hasMore')).toBe('false');
    expect(field('isError')).toBe('false');
    expect(field('nextPageErrorMsg')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Page parkh — asal ReelsPage + asal hook (apiFetchRaw mock), branch kram
// ---------------------------------------------------------------------------

describe('QC-F-372 ReelsPage error branches', () => {
  let container: HTMLDivElement;
  let root: Root;
  let qc: QueryClient;

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
          <ReelsPage />
        </QueryClientProvider>,
      );
    });
    await settle(50);
  }

  it('P1 [NC] pehli page fail → "Couldn\'t load reels." + Retry; "No reels available" NAHI; Retry refetch kare', async () => {
    api.fetchRaw.mockImplementation(async () => errResponse(500, 'Internal Server Error'));
    await render();
    expect(container.textContent).toContain("Couldn't load reels.");
    expect(container.textContent).not.toContain('No reels available');
    const callsBefore = api.fetchRaw.mock.calls.length;
    const retry = buttonByText(container, 'Retry');
    expect(retry).toBeDefined();
    await click(retry!);
    expect(api.fetchRaw.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it('P2 control: safal-khaali → "No reels available", error copy NAHI', async () => {
    api.fetchRaw.mockImplementation(async () => okPage([], null));
    await render();
    expect(container.textContent).toContain('No reels available');
    expect(container.textContent).not.toContain("Couldn't load reels.");
  });

  it('P3 [NC] agli page fail → reels barkarar + inline strip + Retry; bina Retry auto-refetch NAHI (effect-gate)', async () => {
    let cursorAttempts = 0;
    api.fetchRaw.mockImplementation(async (...args: unknown[]) => {
      if (!cursorOf(args)) return okPage(['r1', 'r2'], 'r2');
      cursorAttempts += 1;
      // Pehli cursor-koshish fail, Retry wali safal.
      return cursorAttempts === 1
        ? errResponse(500, 'Internal Server Error')
        : okPage(['r3'], null);
    });
    await render();
    // Loaded reels screen par hain, strip imaandaari se fail batata hai.
    expect(container.querySelector('[data-testid="reel-player"]')).not.toBeNull();
    expect(container.textContent).toContain("Couldn't load more reels.");
    expect(cursorCallCount()).toBe(1);
    // Effect-gate: samay beetne par bhi bina user-Retry dobara fetch NAHI.
    await settle(120);
    expect(cursorCallCount()).toBe(1);
    const retry = buttonByText(container, 'Retry');
    expect(retry).toBeDefined();
    await click(retry!);
    expect(cursorCallCount()).toBe(2);
    await settle(50);
    expect(container.textContent).not.toContain("Couldn't load more reels.");
  });
});
