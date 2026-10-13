// @vitest-environment jsdom
// ============================================================================
// QuantChat - ChatSocketManager tests: subprotocol auth (P1) + HTTP long-poll
// fallback (P0-1 graceful degradation).
//
// - The WebSocket MUST be constructed with the token as a subprotocol and a
//   token-free URL (P1: no `?token=` in URLs).
// - After repeated unexpected WS failures the manager MUST engage the HTTP
//   long-poll fallback: state becomes `degraded`, subscribed conversations are
//   polled via GET /api/conversations/:id/messages (QC-F-286 — the real backend
//   list route; the old /api/messages/:id path 404'd on every poll), and
//   unseen messages are fanned out as `new_message` events (same shape the
//   backend emits over the socket).
// - The first successful WS open MUST stop polling and return to `open`.
// ============================================================================
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ChatSocketManager, type ChatConnectionState } from '../chat-socket';

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

let fetchMock: ReturnType<typeof vi.fn>;

/** The REAL backend list shape (QC-F-286): paginated envelope at data.data. */
function backendListBody(messages: Array<Record<string, unknown>>) {
  return {
    success: true,
    data: {
      data: messages,
      total: messages.length,
      page: 1,
      pageSize: 25,
      totalPages: 1,
      hasNext: false,
      hasPrev: false,
    },
  };
}

beforeEach(() => {
  MockWebSocket.instances = [];
  vi.stubGlobal('WebSocket', MockWebSocket);
  fetchMock = vi.fn(async () => ({ ok: true, json: async () => backendListBody([]) }));
  vi.stubGlobal('fetch', fetchMock);
  localStorage.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  localStorage.clear();
});

function trackStates(mgr: ChatSocketManager) {
  const states: ChatConnectionState[] = [mgr.getState()];
  mgr.onStateChange((s) => states.push(s));
  return states;
}

describe('subprotocol auth (P1)', () => {
  it('passes the token as subprotocol with a token-free URL', () => {
    localStorage.setItem('token', 'jwt-secret-token');
    const mgr = new ChatSocketManager();
    mgr.acquire();

    const socket = lastSocket();
    // jsdom default origin is http://localhost -> ws://localhost:3002 base.
    expect(socket.url).toBe('ws://localhost:3002/ws/chat');
    expect(socket.url).not.toContain('token=');
    expect(socket.url).not.toContain('jwt-secret-token');
    expect(socket.protocols).toEqual(['jwt-secret-token']);
    mgr.release();
  });

  it('opens without protocols when there is no session', () => {
    const mgr = new ChatSocketManager();
    mgr.acquire();
    expect(lastSocket().protocols).toEqual([]);
    mgr.release();
  });
});

describe('HTTP long-poll fallback (P0-1)', () => {
  it('engages polling after 3 consecutive failures and reports degraded', async () => {
    localStorage.setItem('token', 'tok');
    const mgr = new ChatSocketManager();
    const states = trackStates(mgr);
    const events: unknown[] = [];
    mgr.onMessage((e) => events.push(e));
    mgr.acquire();
    mgr.subscribe('conv-1');

    // Fail three times in a row (reconnect backoff: 1s, 2s).
    lastSocket().onclose?.({});
    await vi.advanceTimersByTimeAsync(1000);
    lastSocket().onclose?.({});
    await vi.advanceTimersByTimeAsync(2000);
    lastSocket().onclose?.({});

    expect(states).toContain('degraded');
    expect(mgr.getState()).toBe('degraded');
    // Seed poll ran immediately on fallback start — via the REAL list route
    // (QC-F-286 pin change: was '/api/messages/conv-1?limit=25').
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/conversations/conv-1/messages?pageSize=25',
      expect.objectContaining({ headers: { Authorization: 'Bearer tok' } }),
    );
    // Seed must not replay history as new events.
    expect(events).toHaveLength(0);
    mgr.release();
  });

  it('fans unseen polled messages as new_message events, ignoring repeats', async () => {
    const mgr = new ChatSocketManager();
    const events: Array<{ type?: string; data?: { id?: string } }> = [];
    mgr.onMessage((e) => events.push(e as { type?: string; data?: { id?: string } }));
    mgr.acquire();
    mgr.subscribe('conv-9');

    // Seed poll sees m1 (real backend envelope shape).
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => backendListBody([{ id: 'm1', content: 'hello' }]),
    });
    lastSocket().onclose?.({});
    await vi.advanceTimersByTimeAsync(1000);
    lastSocket().onclose?.({});
    await vi.advanceTimersByTimeAsync(2000);
    lastSocket().onclose?.({});
    await vi.advanceTimersByTimeAsync(0);
    expect(events).toHaveLength(0);

    // Next tick: m1 again + new m2 -> only m2 is fanned out.
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () =>
        backendListBody([
          { id: 'm1', content: 'hello' },
          { id: 'm2', content: 'world' },
        ]),
    });
    await vi.advanceTimersByTimeAsync(5000);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('new_message');
    expect(events[0].data?.id).toBe('m2');
    mgr.release();
  });

  it('stops polling and returns to open when the socket recovers', async () => {
    const mgr = new ChatSocketManager();
    const states = trackStates(mgr);
    mgr.acquire();
    mgr.subscribe('conv-1');

    lastSocket().onclose?.({});
    await vi.advanceTimersByTimeAsync(1000);
    lastSocket().onclose?.({});
    await vi.advanceTimersByTimeAsync(2000);
    lastSocket().onclose?.({});
    expect(mgr.getState()).toBe('degraded');
    const pollsWhileDegraded = fetchMock.mock.calls.length;

    // A background reconnect (4s backoff) succeeds.
    await vi.advanceTimersByTimeAsync(4000);
    lastSocket().onopen?.({});
    expect(mgr.getState()).toBe('open');
    expect(states).toContain('open');

    // No further polls after recovery.
    await vi.advanceTimersByTimeAsync(15000);
    expect(fetchMock.mock.calls.length).toBe(pollsWhileDegraded);
    mgr.release();
  });

  it('release() stops polling and closes the state', async () => {
    const mgr = new ChatSocketManager();
    mgr.acquire();
    mgr.subscribe('conv-1');
    lastSocket().onclose?.({});
    await vi.advanceTimersByTimeAsync(1000);
    lastSocket().onclose?.({});
    await vi.advanceTimersByTimeAsync(2000);
    lastSocket().onclose?.({});
    expect(mgr.getState()).toBe('degraded');

    mgr.release();
    expect(mgr.getState()).toBe('closed');
    const calls = fetchMock.mock.calls.length;
    await vi.advanceTimersByTimeAsync(15000);
    expect(fetchMock.mock.calls.length).toBe(calls);
  });

  it('keeps WS reconnecting in the background while degraded', async () => {
    const mgr = new ChatSocketManager();
    mgr.acquire();
    mgr.subscribe('conv-1');
    const socketsBefore = MockWebSocket.instances.length;

    lastSocket().onclose?.({});
    await vi.advanceTimersByTimeAsync(1000);
    lastSocket().onclose?.({});
    await vi.advanceTimersByTimeAsync(2000);
    lastSocket().onclose?.({});
    expect(mgr.getState()).toBe('degraded');

    // Background reconnect attempts continue on the backoff schedule.
    await vi.advanceTimersByTimeAsync(4000);
    expect(MockWebSocket.instances.length).toBeGreaterThan(socketsBefore);
    mgr.release();
  });

  it('still fans out the legacy { messages: [...] } shape (back-compat)', async () => {
    const mgr = new ChatSocketManager();
    const events: Array<{ type?: string; data?: { id?: string } }> = [];
    mgr.onMessage((e) => events.push(e as { type?: string; data?: { id?: string } }));
    mgr.acquire();
    mgr.subscribe('conv-legacy');

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ messages: [{ id: 'm1' }] }),
    });
    lastSocket().onclose?.({});
    await vi.advanceTimersByTimeAsync(1000);
    lastSocket().onclose?.({});
    await vi.advanceTimersByTimeAsync(2000);
    lastSocket().onclose?.({});
    await vi.advanceTimersByTimeAsync(0);
    expect(events).toHaveLength(0);

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ messages: [{ id: 'm1' }, { id: 'm2' }] }),
    });
    await vi.advanceTimersByTimeAsync(5000);
    expect(events).toHaveLength(1);
    expect(events[0].data?.id).toBe('m2');
    mgr.release();
  });

  it('surfaces a failed poll exactly once per failure episode (QC-F-286)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const mgr = new ChatSocketManager();
      mgr.acquire();
      mgr.subscribe('conv-err');

      // Every poll fails with HTTP 503.
      fetchMock.mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({ success: false }),
      });
      lastSocket().onclose?.({});
      await vi.advanceTimersByTimeAsync(1000);
      lastSocket().onclose?.({});
      await vi.advanceTimersByTimeAsync(2000);
      lastSocket().onclose?.({}); // 3rd failure -> polling starts, seed tick fails
      await vi.advanceTimersByTimeAsync(0);
      expect(mgr.getState()).toBe('degraded');
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(
        '[chat-socket] HTTP polling failed',
        expect.objectContaining({ status: 503, conversationId: 'conv-err' }),
      );

      // More failing ticks in the SAME episode: still exactly one warning.
      await vi.advanceTimersByTimeAsync(10000);
      expect(warnSpy).toHaveBeenCalledTimes(1);

      // A successful tick ends the episode...
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => backendListBody([]),
      });
      await vi.advanceTimersByTimeAsync(5000);
      expect(warnSpy).toHaveBeenCalledTimes(1);

      // ...so the NEXT failure episode warns again (exactly once more).
      fetchMock.mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ success: false }),
      });
      await vi.advanceTimersByTimeAsync(5000);
      expect(warnSpy).toHaveBeenCalledTimes(2);
      mgr.release();
    } finally {
      warnSpy.mockRestore();
    }
  });
});
