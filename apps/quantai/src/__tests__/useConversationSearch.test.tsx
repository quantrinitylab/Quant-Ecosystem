// ============================================================================
// Tests for useConversationSearch — debounced, server-side conversation search.
// Covers: debounce, short-query gating, success mapping, server errors,
// malformed payloads, abort-on-unmount, stale-response guard, auth headers.
// ============================================================================

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Silence React 19's "testing environment not configured to support act(...)" warning.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { useConversationSearch } from '../hooks/useConversationSearch';
import { getAuthToken } from '../lib/auth';

vi.mock('@quant/api-client', () => ({
  apiFetchRaw: vi.fn(),
}));
vi.mock('../lib/auth', () => ({
  getAuthToken: vi.fn(),
}));

import { apiFetchRaw } from '@quant/api-client';

const mockFetch = vi.mocked(apiFetchRaw);
const mockGetToken = vi.mocked(getAuthToken);

const DEBOUNCE_MS = 250;

// --- minimal renderHook (no @testing-library/react in this app) ---
function renderHook<T>(hook: (q: string) => T, initialQuery: string) {
  const result: { current: T } = { current: undefined as unknown as T };
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root: Root | null = null;

  function Test({ q }: { q: string }) {
    result.current = hook(q);
    return null;
  }

  act(() => {
    root = createRoot(container);
    root.render(<Test q={initialQuery} />);
  });

  return {
    result,
    rerender: (q: string) => {
      act(() => {
        root!.render(<Test q={q} />);
      });
    },
    unmount: () => {
      act(() => {
        root!.unmount();
      });
      container.remove();
    },
  };
}

function okResponse(sessions: unknown[]) {
  return new Response(JSON.stringify({ data: { data: sessions } }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function searchPayload() {
  return [
    { id: 's1', title: 'TypeScript tips', updatedAt: '2026-10-01T00:00:00Z' },
    { id: 's2', title: null, updatedAt: '2026-10-02T00:00:00Z' },
  ];
}

describe('useConversationSearch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockFetch.mockReset();
    mockGetToken.mockReset();
    mockGetToken.mockReturnValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('is inactive for empty queries and never fetches', () => {
    const { result } = renderHook(useConversationSearch, '');
    expect(result.current.active).toBe(false);
    expect(result.current.results).toEqual([]);
    expect(result.current.isSearching).toBe(false);
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS * 2);
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('is inactive for single-character queries', () => {
    const { result } = renderHook(useConversationSearch, 'a');
    expect(result.current.active).toBe(false);
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS * 2);
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('debounces: rapid typing triggers exactly one fetch for the latest query', async () => {
    mockFetch.mockResolvedValue(okResponse(searchPayload()));
    const { result, rerender } = renderHook(useConversationSearch, 'typ');
    rerender('type');
    rerender('typescript');
    expect(result.current.isSearching).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/sessions/search?q=typescript');
    // null titles become 'Untitled'
    expect(result.current.results).toEqual([
      { id: 's1', title: 'TypeScript tips', updatedAt: '2026-10-01T00:00:00Z' },
      { id: 's2', title: 'Untitled', updatedAt: '2026-10-02T00:00:00Z' },
    ]);
    expect(result.current.isSearching).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('surfaces server errors and clears results', async () => {
    mockFetch.mockResolvedValue(new Response('oops', { status: 500 }));
    const { result } = renderHook(useConversationSearch, 'typescript');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    });
    expect(result.current.error).toBe('Search failed: 500');
    expect(result.current.results).toEqual([]);
    expect(result.current.isSearching).toBe(false);
  });

  it('surfaces auth failures (401) as an error, not a silent empty list', async () => {
    mockFetch.mockResolvedValue(new Response('unauthorized', { status: 401 }));
    const { result } = renderHook(useConversationSearch, 'typescript');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    });
    expect(result.current.error).toBe('Search failed: 401');
  });

  it('treats malformed payloads as empty results without error', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ unexpected: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const { result } = renderHook(useConversationSearch, 'typescript');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    });
    expect(result.current.error).toBeNull();
    expect(result.current.results).toEqual([]);
  });

  it('sends the Authorization header when a token is present', async () => {
    mockGetToken.mockReturnValue('tok-123');
    mockFetch.mockResolvedValue(okResponse([]));
    renderHook(useConversationSearch, 'typescript');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    });
    const [, init] = mockFetch.mock.calls[0];
    expect((init?.headers as Record<string, string>)['Authorization']).toBe('Bearer tok-123');
  });

  it('omits the Authorization header when no token is present', async () => {
    mockFetch.mockResolvedValue(okResponse([]));
    renderHook(useConversationSearch, 'typescript');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    });
    const [, init] = mockFetch.mock.calls[0];
    expect((init?.headers as Record<string, string>)['Authorization']).toBeUndefined();
  });

  it('does not fetch when unmounted before the debounce fires', () => {
    mockFetch.mockResolvedValue(okResponse(searchPayload()));
    const { unmount } = renderHook(useConversationSearch, 'typescript');
    unmount();
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS * 2);
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('ignores stale responses: only the latest query wins', async () => {
    let resolveFirst!: (r: Response) => void;
    const first = new Promise<Response>((res) => {
      resolveFirst = res;
    });
    mockFetch
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce(
        okResponse([{ id: 's9', title: 'Second', updatedAt: '2026-10-03T00:00:00Z' }]),
      );

    const { result, rerender } = renderHook(useConversationSearch, 'first');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);

    rerender('second');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // Now the slow first response arrives late — must not clobber.
    await act(async () => {
      resolveFirst(okResponse(searchPayload()));
      await first;
    });

    expect(result.current.results).toEqual([
      { id: 's9', title: 'Second', updatedAt: '2026-10-03T00:00:00Z' },
    ]);
  });
});
