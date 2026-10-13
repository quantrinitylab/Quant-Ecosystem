// @vitest-environment jsdom
// ============================================================================
// QC-F-286 — composition test: the REAL degraded-mode poll chain, end to end.
//
// The chat-socket polling fallback was completely dead: the poller called
// `GET /api/messages/:id?limit=25`, whose Next proxy forwarded to a backend
// route that DOES NOT EXIST (backend messages routes live only under
// `/conversations`; the list route is `GET /conversations/:id/messages`), and
// the poller could not parse the real paginated envelope
// `{ success, data: { data: [...] } }` either. Every poll 404'd and was
// silently swallowed, so degraded mode never delivered a single message.
//
// This test wires the REAL chain with no shortcut mocks:
//   ChatSocketManager (MockWebSocket fails 3x -> degraded)
//     -> global fetch router that dispatches /api/* URLs to the REAL Next
//        route handlers (conversations messages route + legacy messages route)
//     -> the handlers' backend-boundary fetch is a stub that implements ONLY
//        the real backend route table: `GET /conversations/:id/messages`
//        answers the real envelope (F-024 shape); anything else — notably
//        `/messages/:id` — is a Fastify-style 404.
//
// NEGATIVE CONTROL: on the unfixed code this test FAILS twice over —
// (i) the poller calls the legacy path -> real proxy -> backend 404 ->
// swallowed -> no event; (ii) even with only the URL fixed, the old
// extractMessages returns [] for the real envelope -> still no event.
// ============================================================================
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ChatSocketManager } from '../services/chat-socket';
import { GET as conversationsMessagesGet } from '../app/api/conversations/[id]/messages/route';
import { GET as legacyMessagesGet } from '../app/api/messages/[id]/route';

class MockWebSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: MockWebSocket[] = [];

  url: string;
  protocols: string[];
  readyState = MockWebSocket.CONNECTING;
  sent: string[] = [];
  onopen: ((e: unknown) => void) | null = null;
  onclose: ((e: unknown) => void) | null = null;
  onmessage: ((e: unknown) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;

  constructor(url: string, protocols?: string[]) {
    this.url = url;
    this.protocols = protocols ?? [];
    MockWebSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({});
  }
}

const lastSocket = () => MockWebSocket.instances[MockWebSocket.instances.length - 1];

const BACKEND = 'http://localhost:3002';

/** Messages the stub backend currently holds for conv-1 (mutable per test). */
let backendMessages: Array<Record<string, unknown>> = [];
/** Every backend-boundary URL actually hit, in order. */
let backendCalls: string[] = [];

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * The stub backend: implements ONLY the real backend route table.
 * `GET /conversations/:id/messages` -> the real F-024 envelope; the auth
 * header is required (401 without it), exactly like the real handler.
 * Every other path — including `/messages/:id` — is a 404, exactly like
 * Fastify answers for an unmounted route.
 */
function backendFetch(url: string, init?: RequestInit): Response {
  backendCalls.push(url);
  const u = new URL(url);
  const headers = (init?.headers ?? {}) as Record<string, string>;
  const listMatch = u.pathname.match(/^\/conversations\/([^/]+)\/messages$/);
  if (listMatch && (init?.method ?? 'GET') === 'GET') {
    if (!headers['Authorization']) {
      return jsonResponse(401, {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required', statusCode: 401 },
      });
    }
    return jsonResponse(200, {
      success: true,
      data: {
        data: [...backendMessages],
        total: backendMessages.length,
        page: 1,
        pageSize: Number(u.searchParams.get('pageSize') ?? 50),
        totalPages: 1,
        hasNext: false,
        hasPrev: false,
      },
    });
  }
  return jsonResponse(404, {
    message: `Route ${init?.method ?? 'GET'}:${u.pathname} not found`,
    error: 'Not Found',
    statusCode: 404,
  });
}

/** Routes the manager's /api/* fetches to the REAL Next handlers. */
async function fetchRouter(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = String(input);
  if (url.startsWith(`${BACKEND}/`)) return backendFetch(url, init);
  const convMatch = url.match(/^\/api\/conversations\/([^/?]+)\/messages/);
  if (convMatch) {
    const req = new NextRequest(`http://localhost:3000${url}`, {
      method: 'GET',
      headers: init?.headers as Record<string, string> | undefined,
    });
    return conversationsMessagesGet(req, {
      params: Promise.resolve({ id: decodeURIComponent(convMatch[1]!) }),
    });
  }
  const legacyMatch = url.match(/^\/api\/messages\/([^/?]+)/);
  if (legacyMatch) {
    const req = new NextRequest(`http://localhost:3000${url}`, {
      method: 'GET',
      headers: init?.headers as Record<string, string> | undefined,
    });
    return legacyMessagesGet(req, {
      params: Promise.resolve({ id: decodeURIComponent(legacyMatch[1]!) }),
    });
  }
  throw new Error(`qc-f-286 composition: unexpected fetch URL ${url}`);
}

beforeEach(() => {
  MockWebSocket.instances = [];
  backendMessages = [{ id: 'm1', content: 'hello' }];
  backendCalls = [];
  vi.stubGlobal('WebSocket', MockWebSocket);
  vi.stubGlobal('fetch', vi.fn(fetchRouter));
  localStorage.clear();
  localStorage.setItem('token', 'tok');
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('QC-F-286 poll composition (real Next handlers + real backend shape)', () => {
  it('delivers a new message in degraded mode through the real chain', async () => {
    const mgr = new ChatSocketManager();
    const events: Array<{ type?: string; data?: { id?: string } }> = [];
    mgr.onMessage((e) => events.push(e as { type?: string; data?: { id?: string } }));
    mgr.acquire();
    mgr.subscribe('conv-1');

    // Fail the socket three times -> HTTP polling fallback engages.
    lastSocket().onclose?.({});
    await vi.advanceTimersByTimeAsync(1000);
    lastSocket().onclose?.({});
    await vi.advanceTimersByTimeAsync(2000);
    lastSocket().onclose?.({});
    await vi.advanceTimersByTimeAsync(0);

    expect(mgr.getState()).toBe('degraded');
    // The seed tick went through the REAL chain to the REAL backend route…
    expect(backendCalls.length).toBeGreaterThan(0);
    expect(backendCalls[0]).toContain(`${BACKEND}/conversations/conv-1/messages`);
    expect(backendCalls[0]).toContain('pageSize=25');
    // …and seeded m1 WITHOUT replaying it as a new event.
    expect(events).toHaveLength(0);

    // A new message lands on the backend while WS is still down.
    backendMessages = [
      { id: 'm2', content: 'world' },
      { id: 'm1', content: 'hello' },
    ];
    await vi.advanceTimersByTimeAsync(5000);

    // The next poll tick MUST fan m2 out as a new_message event. On the
    // unfixed code nothing ever arrives (404 swallowed / shape unparsed).
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('new_message');
    expect(events[0]!.data?.id).toBe('m2');
    mgr.release();
  });
});
