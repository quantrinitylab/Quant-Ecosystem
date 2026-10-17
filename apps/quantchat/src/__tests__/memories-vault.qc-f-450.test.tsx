// @vitest-environment jsdom
// ============================================================================
// QC-F-450 — 'My Eyes Only' web regression tests
//
// Brief §7 items 19-20:
//   19. Locking the vault (manually, or on a backend 401 MEMORIES_LOCKED)
//       purges the private React Query cache — no private mediaUrl may
//       survive in ANY cache entry — and the unlock token is never written
//       to localStorage/sessionStorage.
//   20. The viewer of a private item renders NO Re-share / Send actions
//       (those paths would carry the mediaUrl out of the vault into
//       ungated surfaces), while Download stays; a public item keeps all
//       three actions unchanged.
//
// The hook is driven through a real QueryClient with only the network
// (apiFetchRaw) mocked — module-level stable mock identity, per repo rule.
// ============================================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const apiMocks = vi.hoisted(() => ({
  apiFetchRaw: vi.fn(),
}));

vi.mock('@quant/api-client', () => ({
  apiFetchRaw: apiMocks.apiFetchRaw,
}));

vi.mock('../lib/auth', () => ({
  getAuthHeaders: () => ({}),
  getAuthHeadersWithContent: () => ({ 'Content-Type': 'application/json' }),
}));

import { useMemories, type Memory, type UseMemoriesReturn } from '../hooks/useMemories';
import { MemoryViewer } from '../app/memories/components/MemoryViewer';

const PRIVATE_MEMORY: Memory = {
  id: 'mem-priv',
  userId: 'user-1',
  mediaUrl: 'https://cdn/quantchat/private-secret.jpg',
  mediaType: 'PHOTO',
  caption: 'vault item',
  location: null,
  createdAt: '2026-10-16T00:00:00.000Z',
  deletedAt: null,
  isPrivate: true,
};

const PUBLIC_MEMORY: Memory = { ...PRIVATE_MEMORY, id: 'mem-pub', isPrivate: false };

function fakeResponse(ok: boolean, status: number, body: unknown) {
  return { ok, status, statusText: ok ? 'OK' : 'Error', json: async () => body };
}

/** When true, the backend answers the private list with 401 MEMORIES_LOCKED (expired token). */
let privateLocked = false;

function installApiMock() {
  apiMocks.apiFetchRaw.mockImplementation(async (url: string, init?: { method?: string }) => {
    const method = init?.method ?? 'GET';
    if (url === '/api/memories/passcode/status') {
      return fakeResponse(true, 200, {
        success: true,
        data: { hasPasscode: true, resetAvailable: true },
      });
    }
    if (url === '/api/memories/passcode/verify' && method === 'POST') {
      return fakeResponse(true, 200, {
        success: true,
        data: {
          unlockToken: 'qmu_test-token',
          expiresAt: '2026-10-16T00:05:00.000Z',
          expiresInSec: 300,
        },
      });
    }
    if (url === '/api/memories/passcode/lock' && method === 'POST') {
      return fakeResponse(true, 200, { success: true, data: { locked: true } });
    }
    if (url.startsWith('/api/memories?section=private')) {
      if (privateLocked) {
        return fakeResponse(false, 401, {
          success: false,
          error: { code: 'MEMORIES_LOCKED', message: 'The vault is locked', statusCode: 401 },
        });
      }
      return fakeResponse(true, 200, {
        success: true,
        data: { memories: [PRIVATE_MEMORY], total: 1 },
      });
    }
    if (url.startsWith('/api/memories')) {
      return fakeResponse(true, 200, { success: true, data: { memories: [], total: 0 } });
    }
    throw new Error(`Unexpected API call: ${method} ${url}`);
  });
}

async function flush(times = 5) {
  for (let i = 0; i < times; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
}

async function until(cond: () => boolean, tries = 50) {
  for (let i = 0; i < tries && !cond(); i++) {
    await flush(1);
  }
  expect(cond()).toBe(true);
}

function cacheContains(queryClient: QueryClient, needle: string): boolean {
  return queryClient
    .getQueryCache()
    .getAll()
    .some((q) => JSON.stringify(q.state.data ?? null).includes(needle));
}

describe('QC-F-450 useMemories vault cache discipline (§7.19)', () => {
  let container: HTMLDivElement;
  let root: Root;
  let queryClient: QueryClient;
  let latest: UseMemoriesReturn | null;

  function Harness() {
    latest = useMemories();
    return null;
  }

  beforeEach(() => {
    privateLocked = false;
    latest = null;
    installApiMock();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <Harness />
        </QueryClientProvider>,
      );
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    queryClient.clear();
    vi.clearAllMocks();
  });

  it('lock purges the private cache completely and the token never touches web storage', async () => {
    await act(async () => {
      await latest?.unlockVault('90210');
    });
    await until(() => cacheContains(queryClient, PRIVATE_MEMORY.mediaUrl));
    expect(latest?.isUnlocked).toBe(true);
    expect(latest?.section).toBe('private');

    await act(async () => {
      await latest?.lockVault();
    });
    await flush();

    expect(latest?.isUnlocked).toBe(false);
    expect(latest?.section).toBe('public');
    expect(queryClient.getQueryCache().findAll({ queryKey: ['memories', 'private'] })).toHaveLength(0);
    expect(cacheContains(queryClient, PRIVATE_MEMORY.mediaUrl)).toBe(false);
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it('a backend 401 MEMORIES_LOCKED on the private list also purges the private cache', async () => {
    await act(async () => {
      await latest?.unlockVault('90210');
    });
    await until(() => cacheContains(queryClient, PRIVATE_MEMORY.mediaUrl));

    privateLocked = true;
    await act(async () => {
      latest?.refetch();
    });
    await until(() => latest?.isUnlocked === false);
    await flush();

    expect(cacheContains(queryClient, PRIVATE_MEMORY.mediaUrl)).toBe(false);
  });
});

describe('QC-F-450 MemoryViewer private actions (§7.20)', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function renderViewer(memory: Memory) {
    act(() => {
      root.render(
        <MemoryViewer
          memory={memory}
          onClose={() => {}}
          onDelete={() => {}}
          onMoveToPrivate={() => {}}
          onMoveToPublic={() => {}}
        />,
      );
    });
  }

  it('a private item shows NO Re-share / Send, keeps Download, and explains why', async () => {
    renderViewer(PRIVATE_MEMORY);
    await flush(2);
    const text = container.textContent ?? '';
    expect(text).not.toContain('Re-share');
    expect(text).not.toContain('Send');
    expect(text).toContain('Download');
    expect(text).toContain('My Eyes Only');
    expect(text).toContain('Move out of My Eyes Only');
  });

  it('a public item keeps Re-share / Send / Download and offers Move to My Eyes Only', async () => {
    renderViewer(PUBLIC_MEMORY);
    await flush(2);
    const text = container.textContent ?? '';
    expect(text).toContain('Re-share');
    expect(text).toContain('Send');
    expect(text).toContain('Download');
    expect(text).toContain('Move to My Eyes Only');
  });
});
