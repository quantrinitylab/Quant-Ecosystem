// @vitest-environment node
// ============================================================================
// quantchat — messages proxy edit/delete forward tests (QC-F-529)
// ============================================================================
//
// The backend edit/delete routes are real (PUT/DELETE
// /conversations/messages/:id — sender-only, edit inside a 15-minute
// window), but the Next proxy `src/app/api/messages/[id]/route.ts` exported
// only GET + POST, so every web edit/delete died at the Next layer with
// 405. These tests pin the new PUT/DELETE handlers: they must go through
// the shared proxy to the REAL backend path, forward auth + body, and relay
// the backend's verdicts verbatim. Global fetch mocked
// (messages-proxy.forward.test.ts pattern).
//
// Negative control: on the original route module PUT/DELETE are undefined,
// so every test below fails (imported handlers are not functions).

import { describe, it, expect, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  PUT as messagesPut,
  DELETE as messagesDelete,
} from '../app/api/messages/[id]/route';

const BACKEND = 'http://localhost:3002';

function jsonFetch(status: number, payload: unknown) {
  return vi.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify(payload), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
  );
}

function call(fetchMock: ReturnType<typeof jsonFetch>, idx = 0) {
  const c = fetchMock.mock.calls[idx]!;
  const init = (c[1] ?? {}) as RequestInit & { headers: Record<string, string> };
  return { url: String(c[0]), init, headers: init.headers };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('messages proxy PUT/DELETE (QC-F-529)', () => {
  it('P1: PUT forwards the edit body to the REAL backend path /conversations/messages/:id', async () => {
    const fetchMock = jsonFetch(200, {
      success: true,
      data: { id: 'msg-1', content: 'edited text', isEdited: true },
    });
    vi.stubGlobal('fetch', fetchMock);
    const req = new NextRequest('http://localhost:3000/api/messages/msg-1', {
      method: 'PUT',
      headers: { authorization: 'Bearer tok', 'content-type': 'application/json' },
      body: JSON.stringify({ content: 'edited text' }),
    });
    const res = await messagesPut(req, { params: Promise.resolve({ id: 'msg-1' }) });
    expect(res.status).toBe(200);
    const { url, init, headers } = call(fetchMock);
    // NOT `${BACKEND}/messages/msg-1` — that backend route does not exist.
    expect(url).toBe(`${BACKEND}/conversations/messages/msg-1`);
    expect(init.method).toBe('PUT');
    expect(JSON.parse(String(init.body))).toEqual({ content: 'edited text' });
    expect(headers['Authorization']).toBe('Bearer tok');
    const body = (await res.json()) as { data: { isEdited: boolean; content: string } };
    expect(body.data.isEdited).toBe(true);
    expect(body.data.content).toBe('edited text');
  });

  it('P2: DELETE forwards to the REAL backend path /conversations/messages/:id', async () => {
    const fetchMock = jsonFetch(200, {
      success: true,
      data: { id: 'msg-2', isDeleted: true },
    });
    vi.stubGlobal('fetch', fetchMock);
    const req = new NextRequest('http://localhost:3000/api/messages/msg-2', {
      method: 'DELETE',
      headers: { authorization: 'Bearer tok' },
    });
    const res = await messagesDelete(req, { params: Promise.resolve({ id: 'msg-2' }) });
    expect(res.status).toBe(200);
    const { url, init } = call(fetchMock);
    expect(url).toBe(`${BACKEND}/conversations/messages/msg-2`);
    expect(init.method).toBe('DELETE');
    const body = (await res.json()) as { data: { isDeleted: boolean } };
    expect(body.data.isDeleted).toBe(true);
  });

  it('P3: PUT relays a backend 400 EDIT_WINDOW_EXPIRED verbatim', async () => {
    const fetchMock = jsonFetch(400, {
      success: false,
      error: {
        code: 'EDIT_WINDOW_EXPIRED',
        message: 'Message can only be edited within 15 minutes',
        statusCode: 400,
      },
    });
    vi.stubGlobal('fetch', fetchMock);
    const req = new NextRequest('http://localhost:3000/api/messages/msg-old', {
      method: 'PUT',
      headers: { authorization: 'Bearer tok', 'content-type': 'application/json' },
      body: JSON.stringify({ content: 'too late' }),
    });
    const res = await messagesPut(req, { params: Promise.resolve({ id: 'msg-old' }) });
    expect(res.status).toBe(400);
    expect(call(fetchMock).url).toBe(`${BACKEND}/conversations/messages/msg-old`);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('EDIT_WINDOW_EXPIRED');
  });

  it('P4: DELETE relays a backend 403 NOT_MESSAGE_OWNER verbatim', async () => {
    const fetchMock = jsonFetch(403, {
      success: false,
      error: {
        code: 'NOT_MESSAGE_OWNER',
        message: 'Only the sender can delete this message',
        statusCode: 403,
      },
    });
    vi.stubGlobal('fetch', fetchMock);
    const req = new NextRequest('http://localhost:3000/api/messages/msg-peer', {
      method: 'DELETE',
      headers: { authorization: 'Bearer tok' },
    });
    const res = await messagesDelete(req, { params: Promise.resolve({ id: 'msg-peer' }) });
    expect(res.status).toBe(403);
    expect(call(fetchMock).url).toBe(`${BACKEND}/conversations/messages/msg-peer`);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('NOT_MESSAGE_OWNER');
  });
});
