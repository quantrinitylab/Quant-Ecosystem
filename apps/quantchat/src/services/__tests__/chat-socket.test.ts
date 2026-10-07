// @vitest-environment jsdom
// ============================================================================
// QuantChat - ChatSocketManager tests: subprotocol auth (P1) + HTTP long-poll
// fallback (P0-1 graceful degradation).
//
// - The WebSocket MUST be constructed with the token as a subprotocol and a
//   token-free URL (P1: no `?token=` in URLs).
// - After repeated unexpected WS failures the manager MUST engage the HTTP
//   long-poll fallback: state becomes `degraded`, subscribed conversations are
//   polled via GET /api/messages/:id, and unseen messages are fanned out as
//   `new_message` events (same shape the backend emits over the socket).
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

beforeEach(() => {
  MockWebSocket.instances = [];
  vi.stubGlobal('WebSocket', MockWebSocket);
  fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ messages: [] }) }));
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
    // Seed poll ran immediately on fallback start.
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/messages/conv-1?limit=25',
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

    // Seed poll sees m1.
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ messages: [{ id: 'm1', content: 'hello' }] }),
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
      json: async () => ({
        messages: [
          { id: 'm1', content: 'hello' },
          { id: 'm2', content: 'world' },
        ],
      }),
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
});
