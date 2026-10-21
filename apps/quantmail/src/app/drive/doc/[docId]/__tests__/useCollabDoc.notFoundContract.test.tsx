// @vitest-environment jsdom
// ============================================================================
// Doc-editor 404 intent contract (types.ts DocLoadIntent / DocNotFoundKind).
//
// Mount-level tests — the backend answers 404 DOCUMENT_NOT_FOUND for BOTH
// never-existing and soft-deleted documents, so the hook must distinguish:
//   1. A 404 load ALONE fires no write — no PATCH, no POST (edit-driven only).
//   2. 404 + no cached content → kind 'missing', intent 'authorized-new',
//      badge 'unsaved' ("Not saved yet").
//   3. 404 + cached content → kind 'deleted', intent 'deleted': edits do NOT
//      trigger any write (a deleted deep link is never silently recreated).
//   4. authorizeNewDocument() (explicit user action) re-enables creation:
//      the next save does exactly one PATCH → 404 → one POST carrying the
//      canonical docId, then reports 'saved'.
//   5. Unit: a 409 on the create fallback resolves to 'error', never 'saved'.
//
// Follows the mount pattern of useCollabDoc.accountScope.test.tsx
// (jsdom + createRoot + act, IS_REACT_ACT_ENVIRONMENT, no
// @testing-library/react — not a dependency).
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { createRoot, type Root } from 'react-dom/client';
import { useCollabDoc, performDocSave, type DocSavePayload } from '../useCollabDoc';

const { requestMock } = vi.hoisted(() => ({ requestMock: vi.fn() }));

vi.mock('../../../../../services/browser-api-request', () => ({
  browserApiRequest: requestMock,
}));
vi.mock('../../../../../services/browser-auth-session', () => ({
  browserAuthSession: { getAccessToken: () => null },
}));

const DOC = 'doc-404-contract';
const EMAIL = 'a@example.com';
const CACHE_KEY = `quant_doc.v2.${EMAIL}.${DOC}`;
const CACHE_VALUE = JSON.stringify({
  title: 'Cached before delete',
  blocks: [{ id: 'c1', type: 'paragraph', content: 'cached content' }],
  metadata: { icon: '📄' },
  updatedAt: new Date().toISOString(),
});

type HookApi = ReturnType<typeof useCollabDoc>;
let seen: HookApi | null = null;

function Probe({ email, docId }: { email?: string; docId: string }) {
  const api = useCollabDoc(docId, email);
  seen = api;
  return null;
}

interface RecordedCall {
  url: string;
  method: string;
  body?: string;
}
let recorded: RecordedCall[] = [];

function mockGet404ThenSave(postStatus: { ok: boolean; status: number } = { ok: true, status: 201 }) {
  requestMock.mockImplementation(async (url: string, init?: { method?: string; body?: string }) => {
    const method = init?.method ?? 'GET';
    recorded.push({ url, method, body: init?.body });
    if (method === 'GET') return { ok: false, status: 404 };
    if (method === 'PATCH') return { ok: false, status: 404 };
    if (method === 'POST') {
      return {
        ok: postStatus.ok,
        status: postStatus.status,
        json: async () => ({ success: postStatus.ok, data: { id: DOC } }),
      };
    }
    return { ok: false, status: 500 };
  });
}

async function mountProbe(): Promise<{ root: Root; container: HTMLDivElement }> {
  seen = null;
  recorded = [];
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<Probe email={EMAIL} docId={DOC} />);
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

async function fireAutosaveDebounce(): Promise<void> {
  await act(async () => {
    vi.advanceTimersByTime(1500);
  });
  await settle();
}

const writes = () => recorded.filter((c) => c.method === 'PATCH' || c.method === 'POST');

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  requestMock.mockReset();
});

afterEach(async () => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('useCollabDoc 404 intent contract', () => {
  it('a 404 load alone fires no write; missing → authorized-new, unsaved badge', async () => {
    mockGet404ThenSave();
    const { root } = await mountProbe();
    await settle();

    // The load completed: exactly one GET, zero writes.
    expect(recorded.filter((c) => c.method === 'GET')).toHaveLength(1);
    expect(writes()).toHaveLength(0);

    // Intent contract for a fresh URL with no cache evidence.
    expect(seen?.notFoundKind).toBe('missing');
    expect(seen?.loadIntent).toBe('authorized-new');
    expect(seen?.syncStatus).toBe('unsaved');

    // An actual user edit then drives exactly one PATCH → 404 → one POST
    // with the canonical id.
    await act(async () => {
      seen?.setTitle('My new doc');
    });
    await fireAutosaveDebounce();
    const patchCalls = recorded.filter((c) => c.method === 'PATCH');
    const postCalls = recorded.filter((c) => c.method === 'POST');
    expect(patchCalls).toHaveLength(1);
    expect(postCalls).toHaveLength(1);
    expect(JSON.parse(postCalls[0].body ?? '{}').id).toBe(DOC);
    expect(seen?.syncStatus).toBe('saved');

    await act(async () => root.unmount());
  });

  it('404 with cached content → deleted intent: edits never trigger a silent recreate', async () => {
    mockGet404ThenSave();
    localStorage.setItem(CACHE_KEY, CACHE_VALUE);
    const { root } = await mountProbe();
    await settle();

    expect(seen?.notFoundKind).toBe('deleted');
    expect(seen?.loadIntent).toBe('deleted');
    // The cached copy is restored for viewing…
    expect(seen?.title).toBe('Cached before delete');

    // …but editing must NOT fire any write while the intent is 'deleted'.
    await act(async () => {
      seen?.setTitle('Edited after delete');
    });
    await fireAutosaveDebounce();
    expect(writes()).toHaveLength(0);
    expect(seen?.loadIntent).toBe('deleted');

    await act(async () => root.unmount());
  });

  it('authorizeNewDocument() re-enables exactly-once canonical create', async () => {
    mockGet404ThenSave();
    localStorage.setItem(CACHE_KEY, CACHE_VALUE);
    const { root } = await mountProbe();
    await settle();
    expect(seen?.loadIntent).toBe('deleted');

    // The EXPLICIT user action — not an edit, not a load — authorizes creation.
    await act(async () => {
      seen?.authorizeNewDocument();
    });
    expect(seen?.loadIntent).toBe('authorized-new');

    await fireAutosaveDebounce();

    const patchCalls = recorded.filter((c) => c.method === 'PATCH');
    const postCalls = recorded.filter((c) => c.method === 'POST');
    // Exactly one PATCH (→404) and exactly one POST carrying the canonical id.
    expect(patchCalls).toHaveLength(1);
    expect(postCalls).toHaveLength(1);
    expect(JSON.parse(postCalls[0].body ?? '{}').id).toBe(DOC);
    expect(seen?.syncStatus).toBe('saved');

    await act(async () => root.unmount());
  });

  it('performDocSave: 409 on the create fallback → error, never saved', async () => {
    const payload: DocSavePayload = {
      title: 'T',
      content: 'x',
      metadata: { icon: '📄', blocks: [] },
      isPublic: false,
    };
    const req = async (url: string, init?: { method: string; body?: string }) => {
      if (init?.method === 'PATCH') return { ok: false, status: 404 };
      // Someone else owns the canonical id.
      return { ok: false, status: 409 };
    };
    expect(await performDocSave(req, DOC, payload, EMAIL)).toBe('error');
  });

  it('performDocSave: POST carries the canonical id in the create body', async () => {
    const payload: DocSavePayload = {
      title: 'T',
      content: 'x',
      metadata: { icon: '📄', blocks: [] },
      isPublic: false,
    };
    const bodies: string[] = [];
    const req = async (_url: string, init?: { method: string; body?: string }) => {
      if (init?.method === 'PATCH') return { ok: false, status: 404 };
      bodies.push(init?.body ?? '');
      return { ok: true, status: 201 };
    };
    expect(await performDocSave(req, DOC, payload, EMAIL)).toBe('saved');
    expect(bodies).toHaveLength(1);
    expect(JSON.parse(bodies[0]).id).toBe(DOC);
  });
});
