// @vitest-environment jsdom
// ============================================================================
// QuantChat - ChatSocketManager K25 tests: contract §18 envelope handling.
//
// - §18 envelopes are normalized to the legacy consumer shape
//   ({ type: 'new_message' | 'typing_indicator' | 'presence:update' |
//     'message:read' | 'message:delivered', data, envelope }).
// - Redelivered envelopes are deduped by event_id (§18).
// - The latest cursor per conversation is tracked and sent on (re)join (§20).
// - `snapshot_required` fans a `new_message` hint so consumers refetch.
// - Legacy non-envelope frames pass through untouched.
// ============================================================================
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ChatSocketManager } from '../chat-socket';

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

function envelope(overrides: Record<string, unknown> = {}) {
  return {
    event_id: 'evt-1',
    event_type: 'chat.message.created.v1',
    event_version: 1,
    occurred_at: '2026-10-08T00:00:00.000Z',
    resource_ref: 'msg-1',
    aggregate_version: 1,
    sequence: 1,
    payload: { id: 'msg-1', content: 'hi' },
    cursor: 'conversation.conv-1:1',
    trace_id: 'trace-1',
    ...overrides,
  };
}

function openSocket(manager: ChatSocketManager) {
  manager.acquire();
  const socket = lastSocket();
  socket.readyState = MockWebSocket.OPEN;
  socket.onopen?.({});
  return socket;
}

beforeEach(() => {
  MockWebSocket.instances = [];
  vi.stubGlobal('WebSocket', MockWebSocket);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => ({ messages: [] }) })),
  );
  vi.useFakeTimers();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('K25 envelope normalization', () => {
  it('normalizes a chat.message.created.v1 envelope to new_message', () => {
    const manager = new ChatSocketManager();
    const received: unknown[] = [];
    manager.onMessage((e) => received.push(e));
    const socket = openSocket(manager);

    socket.onmessage?.({ data: JSON.stringify(envelope()) });

    expect(received.length).toBe(1);
    const event = received[0] as Record<string, unknown>;
    expect(event.type).toBe('new_message');
    expect(event.data).toEqual({ id: 'msg-1', content: 'hi' });
    expect((event.envelope as Record<string, unknown>).event_id).toBe('evt-1');
    manager.release();
  });

  it('dedupes redelivered envelopes by event_id (§18)', () => {
    const manager = new ChatSocketManager();
    const received: unknown[] = [];
    manager.onMessage((e) => received.push(e));
    const socket = openSocket(manager);

    const frame = JSON.stringify(envelope());
    socket.onmessage?.({ data: frame });
    socket.onmessage?.({ data: frame });

    expect(received.length).toBe(1);
    manager.release();
  });

  it('maps typing/presence/receipt envelopes to legacy types', () => {
    const manager = new ChatSocketManager();
    const received: Array<Record<string, unknown>> = [];
    manager.onMessage((e) => received.push(e as Record<string, unknown>));
    const socket = openSocket(manager);

    socket.onmessage?.({
      data: JSON.stringify(
        envelope({
          event_id: 'e-t',
          event_type: 'chat.typing.v1',
          payload: { userId: 'u1', isTyping: true },
          cursor: 'conversation.conv-1:2',
          sequence: 2,
        }),
      ),
    });
    socket.onmessage?.({
      data: JSON.stringify(
        envelope({
          event_id: 'e-p',
          event_type: 'chat.presence.v1',
          payload: { userId: 'u1', status: 'online' },
          cursor: 'presence:7',
          sequence: 7,
        }),
      ),
    });
    socket.onmessage?.({
      data: JSON.stringify(
        envelope({
          event_id: 'e-r',
          event_type: 'chat.message.receipt_updated.v1',
          payload: { messageId: 'm1', receipt: 'read' },
          cursor: 'conversation.conv-1:3',
          sequence: 3,
        }),
      ),
    });

    expect(received.map((e) => e.type)).toEqual([
      'typing_indicator',
      'presence:update',
      'message:read',
    ]);
    manager.release();
  });

  it('passes legacy non-envelope frames through untouched', () => {
    const manager = new ChatSocketManager();
    const received: unknown[] = [];
    manager.onMessage((e) => received.push(e));
    const socket = openSocket(manager);

    socket.onmessage?.({ data: JSON.stringify({ type: 'new_message', data: { id: 'x' } }) });

    expect(received).toEqual([{ type: 'new_message', data: { id: 'x' } }]);
    manager.release();
  });

  it('fans a new_message hint on snapshot_required (§20)', () => {
    const manager = new ChatSocketManager();
    const received: Array<Record<string, unknown>> = [];
    manager.onMessage((e) => received.push(e as Record<string, unknown>));
    const socket = openSocket(manager);

    socket.onmessage?.({ data: JSON.stringify({ type: 'snapshot_required', cursor: null }) });

    expect(received).toEqual([{ type: 'new_message', data: {} }]);
    manager.release();
  });
});

describe('K25 cursor resume (§20)', () => {
  it('sends last_event_cursor on subscribe after receiving events', () => {
    const manager = new ChatSocketManager();
    manager.onMessage(() => {});
    const socket = openSocket(manager);

    socket.onmessage?.({ data: JSON.stringify(envelope()) });

    manager.subscribe('conv-1');
    const join = JSON.parse(socket.sent[socket.sent.length - 1] as string) as Record<
      string,
      unknown
    >;
    expect(join.type).toBe('join_conversation');
    expect(join.conversationId).toBe('conv-1');
    expect(join.last_event_cursor).toBe('conversation.conv-1:1');
    manager.release();
  });

  it('omits last_event_cursor when nothing was received yet', () => {
    const manager = new ChatSocketManager();
    manager.onMessage(() => {});
    const socket = openSocket(manager);

    manager.subscribe('conv-9');
    const join = JSON.parse(socket.sent[socket.sent.length - 1] as string) as Record<
      string,
      unknown
    >;
    // JSON.stringify drops undefined — the server treats a missing cursor as a
    // fresh join.
    expect('last_event_cursor' in join).toBe(false);
    manager.release();
  });
});
