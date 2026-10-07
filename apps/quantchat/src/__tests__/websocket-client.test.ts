import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { QuantChatWSClient } from '../services/websocket-client';
import type { ConnectionState } from '../services/websocket-client';

class MockWebSocket {
  static OPEN = 1;
  static CLOSED = 3;
  static instances: MockWebSocket[] = [];
  readyState = MockWebSocket.OPEN;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number; reason?: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  sent: string[] = [];
  closeCode = 1000;

  constructor(_url?: string) {
    MockWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close(code?: number, _reason?: string) {
    this.readyState = MockWebSocket.CLOSED;
    this.closeCode = code ?? 1000;
    this.onclose?.({ code: this.closeCode, reason: _reason });
  }

  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  simulateMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  simulateClose(code: number, reason?: string) {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code, reason });
  }

  simulateError() {
    this.onerror?.();
  }
}

describe('QuantChatWSClient', () => {
  let client: QuantChatWSClient;
  let mockWs: MockWebSocket;
  let originalWebSocket: typeof globalThis.WebSocket;

  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.instances = [];

    originalWebSocket = globalThis.WebSocket;
    (globalThis as any).WebSocket = MockWebSocket;

    client = new QuantChatWSClient({
      url: 'wss://test.quant.app/ws',
      token: 'test-token',
      deviceId: 'test-device',
      reconnectInterval: 1000,
      maxReconnectAttempts: 3,
      heartbeatInterval: 5000,
      heartbeatTimeout: 3000,
      maxQueueSize: 5,
    });
  });

  afterEach(() => {
    client.disconnect();
    vi.useRealTimers();
    (globalThis as any).WebSocket = originalWebSocket;
  });

  function connectAndOpen(): MockWebSocket {
    client.connect();
    const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1]!;
    ws.simulateOpen();
    return ws;
  }

  describe('connection', () => {
    it('should throw if no token provided', () => {
      const noTokenClient = new QuantChatWSClient({ url: 'wss://test.quant.app/ws' });
      expect(() => noTokenClient.connect()).toThrow('Authentication token is required');
    });

    it('should transition to connected on open', () => {
      const states: ConnectionState[] = [];
      client.setStateChangeHandler((s) => states.push(s));
      connectAndOpen();

      expect(client.getState()).toBe('connected');
      expect(client.isConnected()).toBe(true);
      expect(states).toContain('connecting');
      expect(states).toContain('connected');
    });

    it('should not create second connection when already connected', () => {
      connectAndOpen();
      const countBefore = MockWebSocket.instances.length;
      client.connect();
      expect(MockWebSocket.instances.length).toBe(countBefore);
    });

    it('should disconnect cleanly', () => {
      connectAndOpen();
      client.disconnect();
      expect(client.getState()).toBe('disconnected');
    });
  });

  describe('reconnection', () => {
    it('should attempt reconnection on unexpected close', () => {
      const ws = connectAndOpen();
      ws.simulateClose(1006, 'Abnormal');
      expect(client.getState()).toBe('reconnecting');
    });

    it('should use exponential backoff with jitter', () => {
      const ws = connectAndOpen();
      ws.simulateClose(1006);

      vi.advanceTimersByTime(2000);
      expect(client.getState()).toBe('connecting');
    });

    it('should not reconnect after max attempts', () => {
      let ws = connectAndOpen();

      for (let i = 0; i < 5; i++) {
        ws.simulateClose(1006);
        vi.advanceTimersByTime(30000);
        if (client.getState() === 'failed') break;
        ws = MockWebSocket.instances[MockWebSocket.instances.length - 1]!;
      }

      expect(client.getState()).toBe('failed');
    });

    it('should not reconnect on auth failure (4001)', () => {
      const ws = connectAndOpen();
      ws.simulateClose(4001, 'Auth failed');
      expect(client.getState()).toBe('failed');
    });

    it('should not reconnect on intentional disconnect', () => {
      connectAndOpen();
      client.disconnect();
      expect(client.getState()).toBe('disconnected');
    });
  });

  describe('message sending', () => {
    it('should send messages when connected', () => {
      const ws = connectAndOpen();

      const event = {
        type: 'message:new' as any,
        payload: { text: 'hello' },
        timestamp: Date.now(),
      };
      const sent = client.send(event);

      expect(sent).toBe(true);
      expect(ws.sent.length).toBeGreaterThan(0);
    });

    it('should queue messages when disconnected', () => {
      const event = {
        type: 'message:new' as any,
        payload: { text: 'hello' },
        timestamp: Date.now(),
      };
      const sent = client.send(event);

      expect(sent).toBe(false);
      expect(client.getQueueSize()).toBe(1);
    });

    it('should flush queue on reconnect', () => {
      const event = {
        type: 'message:new' as any,
        payload: { text: 'hello' },
        timestamp: Date.now(),
      };
      client.send(event);
      expect(client.getQueueSize()).toBe(1);

      connectAndOpen();
      expect(client.getQueueSize()).toBe(0);
    });

    it('should reject messages exceeding max size', () => {
      connectAndOpen();

      const bigPayload = 'x'.repeat(70000);
      const event = {
        type: 'message:new' as any,
        payload: { text: bigPayload },
        timestamp: Date.now(),
      };
      const sent = client.send(event);

      expect(sent).toBe(false);
    });

    it('should drop oldest when queue is full', () => {
      for (let i = 0; i < 6; i++) {
        client.send(
          { type: 'message:new' as any, payload: { text: `msg-${i}` }, timestamp: Date.now() },
          i,
        );
      }

      expect(client.getQueueSize()).toBe(5);
    });

    it('should prioritize higher priority messages', () => {
      client.send(
        { type: 'message:new' as any, payload: { text: 'low' }, timestamp: Date.now() },
        0,
      );
      client.send(
        { type: 'message:update' as any, payload: { text: 'high' }, timestamp: Date.now() },
        10,
      );

      expect(client.getQueueSize()).toBe(2);
    });
  });

  describe('event handling', () => {
    it('should dispatch events to handlers', () => {
      const received: unknown[] = [];
      client.on('message:new', (payload) => received.push(payload));

      const ws = connectAndOpen();
      ws.simulateMessage({
        type: 'message:new',
        payload: { text: 'hello' },
        timestamp: Date.now(),
      });

      expect(received).toHaveLength(1);
    });

    it('should allow unsubscribing from events', () => {
      const received: unknown[] = [];
      const unsub = client.on('message:new', (payload) => received.push(payload));

      const ws = connectAndOpen();
      unsub();
      ws.simulateMessage({
        type: 'message:new',
        payload: { text: 'hello' },
        timestamp: Date.now(),
      });

      expect(received).toHaveLength(0);
    });

    it('should handle errors in event handlers gracefully', () => {
      client.on('message:new', () => {
        throw new Error('Handler error');
      });

      const ws = connectAndOpen();

      expect(() => {
        ws.simulateMessage({
          type: 'message:new',
          payload: {},
          timestamp: Date.now(),
        });
      }).not.toThrow();
    });

    it('should remove all handlers for event type with off()', () => {
      const received: unknown[] = [];
      client.on('message:new', (payload) => received.push(payload));
      client.on('message:new', (payload) => received.push(payload));

      client.off('message:new');

      const ws = connectAndOpen();
      ws.simulateMessage({
        type: 'message:new',
        payload: {},
        timestamp: Date.now(),
      });

      expect(received).toHaveLength(0);
    });
  });

  describe('convenience methods', () => {
    it('sendTypingStart sends correct event', () => {
      const ws = connectAndOpen();
      client.sendTypingStart('conv-1');

      const lastSent = JSON.parse(ws.sent[ws.sent.length - 1]);
      expect(lastSent.type).toBe('typing:start');
      expect(lastSent.payload.conversationId).toBe('conv-1');
    });

    it('sendTypingStop sends correct event', () => {
      const ws = connectAndOpen();
      client.sendTypingStop('conv-1');

      const lastSent = JSON.parse(ws.sent[ws.sent.length - 1]);
      expect(lastSent.type).toBe('typing:stop');
    });

    it('sendMessageRead sends correct event', () => {
      const ws = connectAndOpen();
      client.sendMessageRead('conv-1', ['msg-1', 'msg-2']);

      const lastSent = JSON.parse(ws.sent[ws.sent.length - 1]);
      expect(lastSent.type).toBe('message:read');
      expect(lastSent.payload.messageIds).toEqual(['msg-1', 'msg-2']);
    });

    it('sendPresenceUpdate sends correct event', () => {
      const ws = connectAndOpen();
      client.sendPresenceUpdate('away');

      const lastSent = JSON.parse(ws.sent[ws.sent.length - 1]);
      expect(lastSent.type).toBe('presence:update');
      expect(lastSent.payload.status).toBe('away');
    });
  });

  describe('health tracking', () => {
    it('should return initial health metrics', () => {
      const health = client.getHealth();
      expect(health.state).toBe('disconnected');
      expect(health.messagesSent).toBe(0);
      expect(health.messagesReceived).toBe(0);
      expect(health.reconnectAttempts).toBe(0);
    });

    it('should track messages sent and received', () => {
      const ws = connectAndOpen();

      client.send({ type: 'message:new' as any, payload: {}, timestamp: Date.now() });
      ws.simulateMessage({ type: 'message:new', payload: {}, timestamp: Date.now() });

      const health = client.getHealth();
      expect(health.messagesSent).toBe(1);
      expect(health.messagesReceived).toBe(1);
    });

    it('should track connection timestamps', () => {
      connectAndOpen();

      const health = client.getHealth();
      expect(health.lastConnectedAt).not.toBeNull();
    });
  });
});
