import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NatsFeatureConsumer, type NatsSubscriber } from '../feature-store/nats-consumer';
import { FeatureAggregator } from '../feature-store/aggregator';
import type { OnlineFeatureStore } from '../feature-store/online-store';

function createMockNats(): NatsSubscriber & {
  _handlers: Map<string, (data: Uint8Array) => void>;
  _simulateMessage: (subject: string, data: unknown) => void;
} {
  const handlers = new Map<string, (data: Uint8Array) => void>();
  return {
    _handlers: handlers,
    _simulateMessage(subject: string, data: unknown) {
      const handler = handlers.get(subject);
      if (handler) {
        const encoded = new TextEncoder().encode(JSON.stringify(data));
        handler(encoded);
      }
    },
    subscribe: vi.fn((subject: string, handler: (data: Uint8Array) => void) => {
      handlers.set(subject, handler);
    }),
    unsubscribe: vi.fn((subject: string) => {
      handlers.delete(subject);
    }),
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockOnlineStore(): OnlineFeatureStore {
  return {
    getFeatures: vi.fn().mockResolvedValue(null),
    setFeatures: vi.fn().mockResolvedValue(undefined),
    getBatchFeatures: vi.fn().mockResolvedValue(new Map()),
    setBatchFeatures: vi.fn().mockResolvedValue(undefined),
    getRecentInteractions: vi.fn().mockResolvedValue([]),
    recordInteraction: vi.fn().mockResolvedValue(undefined),
    deleteFeatures: vi.fn().mockResolvedValue(undefined),
    healthCheck: vi.fn().mockResolvedValue(true),
  } as unknown as OnlineFeatureStore;
}

describe('NatsFeatureConsumer', () => {
  let mockNats: ReturnType<typeof createMockNats>;
  let aggregator: FeatureAggregator;
  let consumer: NatsFeatureConsumer;

  beforeEach(() => {
    mockNats = createMockNats();
    aggregator = new FeatureAggregator(createMockOnlineStore());
    consumer = new NatsFeatureConsumer(mockNats, aggregator);
  });

  describe('start', () => {
    it('connects to NATS and subscribes to user.events.*', async () => {
      await consumer.start();

      expect(mockNats.connect).toHaveBeenCalled();
      expect(mockNats.subscribe).toHaveBeenCalledWith('user.events.*', expect.any(Function));
      expect(consumer.isRunning()).toBe(true);
    });
  });

  describe('stop', () => {
    it('unsubscribes and disconnects', async () => {
      await consumer.start();
      await consumer.stop();

      expect(mockNats.unsubscribe).toHaveBeenCalledWith('user.events.*');
      expect(mockNats.disconnect).toHaveBeenCalled();
      expect(consumer.isRunning()).toBe(false);
    });

    it('does nothing if not running', async () => {
      await consumer.stop();
      expect(mockNats.unsubscribe).not.toHaveBeenCalled();
      expect(mockNats.disconnect).not.toHaveBeenCalled();
    });
  });

  describe('event parsing and forwarding', () => {
    it('parses valid event and forwards to aggregator', async () => {
      const processEventSpy = vi.spyOn(aggregator, 'processEvent');
      await consumer.start();

      mockNats._simulateMessage('user.events.*', {
        userId: 'user-1',
        eventType: 'view',
        itemId: 'item-1',
        timestamp: 1700000000000,
      });

      expect(processEventSpy).toHaveBeenCalledWith({
        userId: 'user-1',
        eventType: 'view',
        itemId: 'item-1',
        timestamp: 1700000000000,
      });
    });

    it('includes optional fields when present', async () => {
      const processEventSpy = vi.spyOn(aggregator, 'processEvent');
      await consumer.start();

      mockNats._simulateMessage('user.events.*', {
        userId: 'user-1',
        eventType: 'dwell',
        itemId: 'item-2',
        topicId: 'tech',
        durationMs: 5000,
        timestamp: 1700000000000,
      });

      expect(processEventSpy).toHaveBeenCalledWith({
        userId: 'user-1',
        eventType: 'dwell',
        itemId: 'item-2',
        topicId: 'tech',
        durationMs: 5000,
        timestamp: 1700000000000,
      });
    });

    it('silently drops malformed JSON', async () => {
      const processEventSpy = vi.spyOn(aggregator, 'processEvent');
      await consumer.start();

      // Simulate raw invalid bytes
      const handler = mockNats._handlers.get('user.events.*')!;
      handler(new TextEncoder().encode('not json'));

      expect(processEventSpy).not.toHaveBeenCalled();
    });

    it('silently drops events with missing required fields', async () => {
      const processEventSpy = vi.spyOn(aggregator, 'processEvent');
      await consumer.start();

      mockNats._simulateMessage('user.events.*', {
        userId: 'user-1',
        // missing eventType, itemId, timestamp
      });

      expect(processEventSpy).not.toHaveBeenCalled();
    });

    it('silently drops events with invalid eventType', async () => {
      const processEventSpy = vi.spyOn(aggregator, 'processEvent');
      await consumer.start();

      mockNats._simulateMessage('user.events.*', {
        userId: 'user-1',
        eventType: 'invalid_type',
        itemId: 'item-1',
        timestamp: 1700000000000,
      });

      expect(processEventSpy).not.toHaveBeenCalled();
    });

    it('invokes onError callback when a malformed message arrives', async () => {
      const onError = vi.fn();
      const consumerWithCallback = new NatsFeatureConsumer(mockNats, aggregator, { onError });
      await consumerWithCallback.start();

      // Simulate raw invalid bytes that will cause JSON.parse to throw
      const handler = mockNats._handlers.get('user.events.*')!;
      const rawData = new TextEncoder().encode('not json');
      handler(rawData);

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(expect.any(SyntaxError), rawData);
    });

    it('handles all valid event types', async () => {
      const processEventSpy = vi.spyOn(aggregator, 'processEvent');
      await consumer.start();

      const eventTypes = ['view', 'click', 'like', 'share', 'dwell', 'dismiss'] as const;
      for (const eventType of eventTypes) {
        mockNats._simulateMessage('user.events.*', {
          userId: 'user-1',
          eventType,
          itemId: 'item-1',
          timestamp: 1700000000000,
        });
      }

      expect(processEventSpy).toHaveBeenCalledTimes(6);
    });
  });
});
