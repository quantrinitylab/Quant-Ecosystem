// @vitest-environment jsdom
// ============================================================================
// P1 qm-collabdoc-ws-false-saved — the live CRDT socket must NEVER produce a
// false "Saved" badge when it drops.
//
// Contract: on ws.onclose, ws.onerror, or a connectWebSocket throw, the sync
// status resolves to 'offline' — EXCEPT an honest 'error' from the REST
// auto-save path, which must be preserved ('error' stays 'error').
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { createRoot, type Root } from 'react-dom/client';
import { useCollabDoc, resolveSocketDropStatus } from '../useCollabDoc';
import type { SyncStatus } from '../types';

const { requestMock } = vi.hoisted(() => ({ requestMock: vi.fn() }));

vi.mock('../../../../../services/browser-api-request', () => ({
  browserApiRequest: requestMock,
}));
vi.mock('../../../../../services/browser-auth-session', () => ({
  browserAuthSession: { getAccessToken: () => null },
}));

// P1 qm-collabdoc-ws-false-saved gate fix (2026-10-17): the hook lazy-loads
// the real yjs bundle via `import('yjs')` before it ever constructs the
// socket. That transform is slow and load-dependent (the failing CI shard
// showed a ~100s import phase), while `waitForSocket` below only flushes
// microtasks a bounded number of times — so under CI load the dynamic
// import had not resolved when the wait window expired and every mount
// test threw 'hook never created a WebSocket' (locally the import resolves
// in <1s, which is why this only failed in CI).
// This suite asserts the WS-drop → syncStatus honesty contract, never CRDT
// behavior, so yjs is mocked: the hook's dynamic import resolves
// deterministically from the mock registry and the socket lifecycle is
// exercised on every run, independent of worker load.
vi.mock('yjs', () => {
  class MockYDoc {
    getMap() {
      return {
        get: () => undefined,
        set: () => undefined,
      };
    }
    on() {}
    off() {}
    destroy() {}
  }
  return {
    Doc: MockYDoc,
    encodeStateVector: () => new Uint8Array(0),
    encodeStateAsUpdate: () => new Uint8Array(0),
    applyUpdate: () => {},
  };
});

const DOC = 'doc-ws-false-saved';
const EMAIL = 'ws-test@example.com';

// ---------------------------------------------------------------------------
// Unit: the pure socket-drop resolution contract
// ---------------------------------------------------------------------------
describe('resolveSocketDropStatus — honest socket-drop status', () => {
  it('preserves an honest error — a socket drop must never overwrite it with saved', () => {
    expect(resolveSocketDropStatus('error')).toBe('error');
  });

  it.each(['connected', 'saving', 'saved', 'offline'] as const)(
    "resolves '%s' to 'offline' — a dead socket is never a successful save",
    (status: Exclude<SyncStatus, 'error'>) => {
      expect(resolveSocketDropStatus(status)).toBe('offline');
    },
  );

  it('never returns saved for any input', () => {
    const all: SyncStatus[] = ['connected', 'saving', 'saved', 'offline', 'error'];
    for (const s of all) {
      expect(resolveSocketDropStatus(s)).not.toBe('saved');
    }
  });
});

// ---------------------------------------------------------------------------
// Mount-level: drive the real hook through onclose / onerror / throw
// ---------------------------------------------------------------------------

// Deterministic fake WebSocket: the hook reads `WebSocket.OPEN`, sets
// binaryType, and assigns onopen/onclose/onerror/onmessage handlers.
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  readyState = FakeWebSocket.CONNECTING;
  binaryType = '';
  onopen: ((ev: unknown) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: unknown) => void) | null = null;
  constructor(
    readonly url: string,
    readonly protocols?: string[],
  ) {
    FakeWebSocket.instances.push(this);
  }
  send(): void {
    /* drop frames — no assertions on wire traffic here */
  }
  close(): void {
    if (this.readyState === FakeWebSocket.CLOSED) return;
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.({});
  }
  triggerOpen(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.({});
  }
}

type HookApi = ReturnType<typeof useCollabDoc>;
let seen: HookApi | null = null;

function Probe({ email, docId }: { email?: string; docId: string }) {
  const api = useCollabDoc(docId, email);
  seen = api;
  return null;
}

async function mountProbe(email?: string): Promise<{ root: Root; container: HTMLDivElement }> {
  seen = null;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<Probe email={email} docId={DOC} />);
  });
  return { root, container };
}

async function settle(rounds = 10): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

function mockSuccessfulLoad(patchOutcome: { ok: boolean; status: number } = { ok: true, status: 200 }) {
  requestMock.mockImplementation(async (url: string, init?: { method?: string; body?: string }) => {
    const method = init?.method ?? 'GET';
    if (method === 'GET') {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: {
            title: 'WS test doc',
            metadata: { icon: '📄', blocks: [{ id: 'b1', type: 'paragraph', content: 'hello' }] },
            updatedAt: Date.now(),
          },
        }),
      };
    }
    return patchOutcome;
  });
}

async function waitForSocket(): Promise<FakeWebSocket> {
  let ws: FakeWebSocket | undefined;
  for (let i = 0; i < 40 && !ws; i += 1) {
    await settle(2);
    ws = FakeWebSocket.instances[0];
  }
  if (!ws) throw new Error('hook never created a WebSocket');
  return ws;
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  requestMock.mockReset();
  FakeWebSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeWebSocket);
});

afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('ws.onclose / ws.onerror / connect throw — no false saved (P1)', () => {
  it('onclose after connected resolves to offline, never saved', async () => {
    mockSuccessfulLoad();
    const { root } = await mountProbe(EMAIL);
    await settle();

    const ws = await waitForSocket();
    await act(async () => {
      ws.triggerOpen();
    });
    expect(seen?.syncStatus).toBe('connected');

    await act(async () => {
      ws.close();
    });
    await settle();

    // Regression: the old handler set 'saved' here, claiming the doc was
    // saved at the exact moment live-sync stopped.
    expect(seen?.syncStatus).not.toBe('saved');
    expect(seen?.syncStatus).toBe('offline');

    await act(async () => root.unmount());
  });

  it('onclose preserves an honest error from the failed REST auto-save', async () => {
    mockSuccessfulLoad({ ok: false, status: 500 });
    const { root } = await mountProbe(EMAIL);
    await settle();

    const ws = await waitForSocket();
    await act(async () => {
      ws.triggerOpen();
    });
    expect(seen?.syncStatus).toBe('connected');

    // Make an edit so the debounced auto-save runs and the PATCH 500s.
    await act(async () => {
      seen?.setBlocks([{ id: 'b1', type: 'paragraph', content: 'edited while socket alive' }]);
    });
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    await settle();
    expect(seen?.syncStatus).toBe('error');

    // The socket drops afterwards: the honest 'error' must survive — the
    // old handler would have overwritten it with 'saved'.
    await act(async () => {
      ws.close();
    });
    await settle();
    expect(seen?.syncStatus).toBe('error');

    await act(async () => root.unmount());
  });

  it('onerror resolves to offline (never saved); close inside error is idempotent', async () => {
    mockSuccessfulLoad();
    const { root } = await mountProbe(EMAIL);
    await settle();

    const ws = await waitForSocket();
    await act(async () => {
      ws.triggerOpen();
    });
    expect(seen?.syncStatus).toBe('connected');

    await act(async () => {
      ws.onerror?.({});
    });
    await settle();

    expect(seen?.syncStatus).not.toBe('saved');
    expect(seen?.syncStatus).toBe('offline');

    await act(async () => root.unmount());
  });

  it('a connectWebSocket throw (constructor fails) preserves a load-time error', async () => {
    // The socket constructor throws — the catch path runs. The GET 500s, so
    // the load set an honest 'error': the catch must not overwrite it with
    // 'saved' (the old behavior).
    vi.unstubAllGlobals();
    vi.stubGlobal(
      'WebSocket',
      class {
        constructor() {
          throw new Error('connect failed');
        }
      },
    );
    requestMock.mockImplementation(async (url: string, init?: { method?: string; body?: string }) => {
      const method = init?.method ?? 'GET';
      if (method === 'GET') return { ok: false, status: 500 };
      return { ok: true, status: 200 };
    });

    const { root } = await mountProbe(EMAIL);
    await settle();

    expect(seen?.syncStatus).toBe('error');

    await act(async () => root.unmount());
  });
});
