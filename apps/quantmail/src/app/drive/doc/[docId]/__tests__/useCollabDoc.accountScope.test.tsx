// @vitest-environment jsdom
// ============================================================================
// P1 qm-drive-doc-cache-scope corrective (CODEX) — account-switch isolation.
//
// Mount-level tests: the hook must never render or write mismatched-account
// state (same class as the #1159 reminder bug).
//
// 1. A→B switch where B's fetch 403s: B renders pristine empty, B's
//    account-scoped cache key contains zero of A's blocks, and no REST save
//    is attempted for B.
// 2. A→unresolved account: pristine render, zero writes (local cache AND
//    REST) while the account is unknown.
// 3. Delayed old-session response: A's fetch resolving after the switch to B
//    must not write A's content into B's state.
// 4. Legacy unscoped `quant_doc_<docId>` keys are purged and never migrated
//    into any account's namespace.
// 5. performDocSave refuses an empty saved-for account binding (unit level).
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { createRoot, type Root } from 'react-dom/client';
import { useCollabDoc, performDocSave, type DocSavePayload } from '../useCollabDoc';
import type { EditorBlock } from '../types';

const { requestMock } = vi.hoisted(() => ({ requestMock: vi.fn() }));

vi.mock('../../../../../services/browser-api-request', () => ({
  browserApiRequest: requestMock,
}));
vi.mock('../../../../../services/browser-auth-session', () => ({
  browserAuthSession: { getAccessToken: () => null },
}));

const DOC = 'doc-account-switch';
const A = 'a@example.com';
const B = 'b@example.com';

const A_BLOCKS: EditorBlock[] = [
  { id: 'a1', type: 'paragraph', content: 'A-SECRET-BLOCK-CONTENT' },
];
const A_CACHE_VALUE = JSON.stringify({
  title: 'A secret doc',
  blocks: A_BLOCKS,
  metadata: { icon: '📄' },
  updatedAt: new Date().toISOString(),
});
const B_KEY = `quant_doc.v2.${B}.${DOC}`;
const A_KEY = `quant_doc.v2.${A}.${DOC}`;
const LEGACY_KEY = `quant_doc_${DOC}`;

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

async function rerenderProbe(
  root: Root,
  container: HTMLDivElement,
  email?: string,
): Promise<void> {
  await act(async () => {
    root.render(<Probe email={email} docId={DOC} />);
  });
}

async function settle(rounds = 8): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function fireAutosaveDebounce(): Promise<void> {
  await act(async () => {
    vi.advanceTimersByTime(1500);
  });
  await settle();
}

interface RecordedCall {
  url: string;
  method: string;
}

let recorded: RecordedCall[];
let getCallCount: number;
let deferredA: ((v: unknown) => void) | null;

function mockGetThen403orDeferredA(): void {
  getCallCount = 0;
  recorded = [];
  deferredA = null;
  requestMock.mockImplementation(async (url: string, init?: { method?: string; body?: string }) => {
    const method = init?.method ?? 'GET';
    recorded.push({ url, method });
    if (method !== 'GET') return { ok: true, status: 200 };
    getCallCount += 1;
    if (getCallCount === 1 && deferredA === null) {
      // First GET is account A's load; hold it so tests can resolve it late.
      return new Promise((resolve) => {
        deferredA = resolve;
      });
    }
    return { ok: false, status: 403 };
  });
}

function resolveDeferredAWithAContent(): void {
  const resolve = deferredA;
  deferredA = null;
  resolve?.({
    ok: true,
    status: 200,
    json: async () => ({
      success: true,
      data: {
        title: 'A doc from server',
        metadata: { icon: '📄', blocks: A_BLOCKS },
        updatedAt: Date.now(),
      },
    }),
  });
}

const PRISTINE_BLOCK_IDS = ['b_title', 'b_body'];

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  requestMock.mockReset();
});

afterEach(async () => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('useCollabDoc account-switch isolation (P1 corrective)', () => {
  it('A→B switch with B 403: B renders pristine, B cache/save carry zero of A blocks', async () => {
    mockGetThen403orDeferredA();
    localStorage.setItem(A_KEY, A_CACHE_VALUE);
    localStorage.setItem(LEGACY_KEY, JSON.stringify({ title: 'legacy A', blocks: A_BLOCKS }));

    const { root, container } = await mountProbe(A);
    resolveDeferredAWithAContent();
    await settle();

    // A loaded from its own cache + server; legacy unscoped key purged and
    // never attributed to any account namespace.
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
    expect(seen?.title).toBe('A doc from server');
    expect(seen?.blocks.map((b) => b.id)).toContain('a1');

    recorded = [];
    await rerenderProbe(root, container, B);
    await settle();

    // B renders pristine empty — A's retained state is hard-reset on the
    // account-change render, before B's load attempt.
    expect(seen?.title).toBe('Untitled Document');
    expect(seen?.blocks.map((b) => b.id)).toEqual(PRISTINE_BLOCK_IDS);
    expect(seen?.syncStatus).toBe('error');

    // The autosave epoch is not bound for B (its load 403'd): the debounce
    // fires but must not write A's content under B's account — neither to
    // the local cache nor to the REST API.
    await fireAutosaveDebounce();
    const bCached = localStorage.getItem(B_KEY);
    expect(bCached).toBeNull();
    expect(recorded.some((c) => c.method === 'PATCH' || c.method === 'POST')).toBe(false);
    // A's own namespace is untouched by the switch.
    expect(localStorage.getItem(A_KEY)).toBe(A_CACHE_VALUE);

    await act(async () => root.unmount());
  });

  it('A→unresolved account: pristine render, zero writes while account unknown', async () => {
    mockGetThen403orDeferredA();
    localStorage.setItem(A_KEY, A_CACHE_VALUE);

    const { root, container } = await mountProbe(A);
    resolveDeferredAWithAContent();
    await settle();
    expect(seen?.title).toBe('A doc from server');

    recorded = [];
    await rerenderProbe(root, container, undefined);
    await settle();

    expect(seen?.title).toBe('Untitled Document');
    expect(seen?.blocks.map((b) => b.id)).toEqual(PRISTINE_BLOCK_IDS);

    await fireAutosaveDebounce();
    // Unknown account: fail closed — no local-cache write, no REST attempt.
    expect(localStorage.length).toBe(1); // only A's pre-seeded key
    expect(localStorage.getItem(A_KEY)).toBe(A_CACHE_VALUE);
    expect(recorded.length).toBe(0);

    await act(async () => root.unmount());
  });

  it("delayed old-session response: A's late fetch never writes into B's state", async () => {
    mockGetThen403orDeferredA();

    const { root, container } = await mountProbe(A);
    await settle(3); // A's load is still in flight (deferred)
    expect(seen?.isLoading).toBe(true);

    await rerenderProbe(root, container, B);
    await settle();
    expect(seen?.syncStatus).toBe('error');
    expect(seen?.title).toBe('Untitled Document');

    // A's fetch now resolves LATE — the stale-async guard must drop it.
    resolveDeferredAWithAContent();
    await settle();

    expect(seen?.title).toBe('Untitled Document');
    expect(seen?.blocks.map((b) => b.id)).toEqual(PRISTINE_BLOCK_IDS);
    expect(localStorage.getItem(B_KEY)).toBeNull();

    await act(async () => root.unmount());
  });

  it('successful B load binds the save epoch: B may then autosave under its own key', async () => {
    getCallCount = 0;
    recorded = [];
    requestMock.mockImplementation(async (url: string, init?: { method?: string; body?: string }) => {
      const method = init?.method ?? 'GET';
      recorded.push({ url, method });
      if (method !== 'GET') return { ok: true, status: 200 };
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: {
            title: 'B fresh doc',
            metadata: { icon: '📄', blocks: [{ id: 'b1', type: 'paragraph', content: 'B content' }] },
            updatedAt: Date.now(),
          },
        }),
      };
    });

    const { root } = await mountProbe(B);
    await settle();
    expect(seen?.title).toBe('B fresh doc');

    // The bound save epoch permits B's own autosave under B's own key.
    recorded = [];
    await fireAutosaveDebounce();
    // Debounce fired and the mocked PATCH succeeded → honest 'saved'.
    expect(seen?.syncStatus).toBe('saved');
    const bCached = localStorage.getItem(B_KEY);
    expect(bCached).not.toBeNull();
    expect(bCached ?? '').toContain('B fresh doc');
    expect(bCached ?? '').not.toContain('A-SECRET-BLOCK-CONTENT');
    expect(recorded.some((c) => c.method === 'PATCH')).toBe(true);

    await act(async () => root.unmount());
  });
});

describe('performDocSave account binding (unit)', () => {
  const payload: DocSavePayload = {
    title: 't',
    content: 'c',
    metadata: { icon: '📄', blocks: [] },
    isPublic: false,
  };

  it("refuses the write when the saved-for account binding is empty", async () => {
    const request = vi.fn(async () => {
      throw new Error('must not be called');
    });
    const outcome = await performDocSave(request, DOC, payload, '');
    expect(outcome).toBe('error');
    expect(request).not.toHaveBeenCalled();
  });

  it('saves when a resolved account binding is carried', async () => {
    const request = vi.fn(async () => ({ ok: true, status: 200 }));
    const outcome = await performDocSave(request, DOC, payload, B);
    expect(outcome).toBe('saved');
    expect(request).toHaveBeenCalledTimes(1);
  });
});
