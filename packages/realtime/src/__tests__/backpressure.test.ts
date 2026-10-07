// ============================================================================
// Backpressure Handler Tests
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BackpressureHandler } from '../backpressure';
import type { BufferedSocket } from '../backpressure';

function createMockSocket(bufferedAmount: number = 0): BufferedSocket {
  return {
    bufferedAmount,
    send: vi.fn(),
  };
}

describe('BackpressureHandler', () => {
  let handler: BackpressureHandler;

  beforeEach(() => {
    handler = new BackpressureHandler({
      highWaterMark: 1024,
      maxQueueSize: 5,
    });
  });

  describe('send', () => {
    it('should send immediately when buffer is below high-water mark', () => {
      const socket = createMockSocket(0);
      const result = handler.send('conn1', socket, 'hello');
      expect(result).toBe(true);
      expect(socket.send).toHaveBeenCalledWith('hello');
    });

    it('should queue message when buffer is at or above high-water mark', () => {
      const socket = createMockSocket(1024);
      const result = handler.send('conn1', socket, 'hello');
      expect(result).toBe(false);
      expect(socket.send).not.toHaveBeenCalled();
    });

    it('should track queued messages in stats', () => {
      const socket = createMockSocket(2000);
      handler.send('conn1', socket, 'msg1');
      handler.send('conn1', socket, 'msg2');
      const stats = handler.getStats('conn1');
      expect(stats.messagesQueued).toBe(2);
      expect(stats.currentQueueLength).toBe(2);
    });

    it('should drop oldest messages when queue exceeds max size', () => {
      const socket = createMockSocket(2000);
      for (let i = 0; i < 7; i++) {
        handler.send('conn1', socket, `msg${i}`);
      }
      const stats = handler.getStats('conn1');
      expect(stats.currentQueueLength).toBe(5);
      expect(stats.messagesDropped).toBe(2);
    });

    it('should track peak buffer size', () => {
      const socket1 = createMockSocket(500);
      handler.send('conn1', socket1, 'msg1');
      const socket2 = createMockSocket(2000);
      handler.send('conn1', socket2, 'msg2');
      const stats = handler.getStats('conn1');
      expect(stats.peakBufferSize).toBe(2000);
    });
  });

  describe('drain', () => {
    it('should flush queued messages when socket is ready', () => {
      const highSocket = createMockSocket(2000);
      handler.send('conn1', highSocket, 'msg1');
      handler.send('conn1', highSocket, 'msg2');
      handler.send('conn1', highSocket, 'msg3');

      const readySocket = createMockSocket(0);
      const flushed = handler.drain('conn1', readySocket);
      expect(flushed).toBe(3);
      expect(readySocket.send).toHaveBeenCalledTimes(3);
      expect(readySocket.send).toHaveBeenCalledWith('msg1');
      expect(readySocket.send).toHaveBeenCalledWith('msg2');
      expect(readySocket.send).toHaveBeenCalledWith('msg3');
    });

    it('should stop draining when buffer fills again', () => {
      const highSocket = createMockSocket(2000);
      handler.send('conn1', highSocket, 'msg1');
      handler.send('conn1', highSocket, 'msg2');

      // Socket that fills up after first send
      let sendCount = 0;
      const socket: BufferedSocket = {
        get bufferedAmount() {
          return sendCount >= 1 ? 2000 : 0;
        },
        send: vi.fn(() => {
          sendCount++;
        }),
      };

      const flushed = handler.drain('conn1', socket);
      expect(flushed).toBe(1);
    });

    it('should return 0 when no queued messages', () => {
      const socket = createMockSocket(0);
      const flushed = handler.drain('conn1', socket);
      expect(flushed).toBe(0);
    });
  });

  describe('hasQueuedMessages', () => {
    it('should return false for empty queue', () => {
      expect(handler.hasQueuedMessages('conn1')).toBe(false);
    });

    it('should return true when messages are queued', () => {
      const socket = createMockSocket(2000);
      handler.send('conn1', socket, 'msg');
      expect(handler.hasQueuedMessages('conn1')).toBe(true);
    });
  });

  describe('getQueueLength', () => {
    it('should return 0 for unknown connection', () => {
      expect(handler.getQueueLength('unknown')).toBe(0);
    });

    it('should return current queue length', () => {
      const socket = createMockSocket(2000);
      handler.send('conn1', socket, 'msg1');
      handler.send('conn1', socket, 'msg2');
      expect(handler.getQueueLength('conn1')).toBe(2);
    });
  });

  describe('clearConnection', () => {
    it('should remove all state for a connection', () => {
      const socket = createMockSocket(2000);
      handler.send('conn1', socket, 'msg1');
      handler.clearConnection('conn1');
      expect(handler.hasQueuedMessages('conn1')).toBe(false);
      expect(handler.getQueueLength('conn1')).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return default stats for new connection', () => {
      const stats = handler.getStats('new-conn');
      expect(stats.messagesQueued).toBe(0);
      expect(stats.messagesDropped).toBe(0);
      expect(stats.peakBufferSize).toBe(0);
      expect(stats.currentQueueLength).toBe(0);
    });
  });
});
