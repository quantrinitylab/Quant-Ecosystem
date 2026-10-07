import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FeatureMaterializationPipeline } from '../feature-store/pipeline';
import type { RawEvent } from '../feature-store/pipeline';
import type { OnlineFeatureStore } from '../feature-store/online-store';
import type { OfflineFeatureStore } from '../feature-store/offline-store';

function createMockOnlineStore(): OnlineFeatureStore {
  return {
    getFeatures: vi.fn(async () => ({ score: 0.5 })),
    setFeatures: vi.fn(async () => undefined),
    getBatchFeatures: vi.fn(async () => new Map()),
    setBatchFeatures: vi.fn(async () => undefined),
    getRecentInteractions: vi.fn(async () => []),
    recordInteraction: vi.fn(async () => undefined),
    deleteFeatures: vi.fn(async () => undefined),
    healthCheck: vi.fn(async () => true),
  } as unknown as OnlineFeatureStore;
}

function createMockOfflineStore(): OfflineFeatureStore {
  return {
    writeFeatures: vi.fn(async () => 'key'),
    readFeatures: vi.fn(async () => [{ entityId: 'user:1', score: 0.5 }]),
    getTrainingData: vi.fn(async () => ({
      records: [],
      totalCount: 0,
      dateRange: { start: 0, end: 0 },
      featureNames: [],
    })),
    deletePartition: vi.fn(async () => undefined),
    getPartitionInfo: vi.fn(async () => null),
  } as unknown as OfflineFeatureStore;
}

describe('FeatureMaterializationPipeline', () => {
  let onlineStore: OnlineFeatureStore;
  let offlineStore: OfflineFeatureStore;
  let pipeline: FeatureMaterializationPipeline;

  beforeEach(() => {
    onlineStore = createMockOnlineStore();
    offlineStore = createMockOfflineStore();
    pipeline = new FeatureMaterializationPipeline(onlineStore, offlineStore, {
      maxBufferSize: 10,
    });
  });

  describe('processEvent', () => {
    it('processes user event and writes to online store', async () => {
      const event: RawEvent = {
        eventId: 'evt:1',
        eventType: 'view',
        userId: 'user:1',
        itemId: 'item:1',
        timestamp: Date.now(),
        properties: { category: 'tech' },
      };

      const features = await pipeline.processEvent(event);
      expect(features.length).toBeGreaterThan(0);
      expect(onlineStore.setFeatures).toHaveBeenCalled();
    });

    it('materializes user, item, and interaction features', async () => {
      const event: RawEvent = {
        eventId: 'evt:2',
        eventType: 'click',
        userId: 'user:1',
        itemId: 'item:2',
        timestamp: Date.now(),
        properties: {},
      };

      const features = await pipeline.processEvent(event);
      const types = features.map((f) => f.entityType);
      expect(types).toContain('user');
      expect(types).toContain('item');
      expect(types).toContain('interaction');
    });

    it('records interaction for real-time retrieval', async () => {
      const event: RawEvent = {
        eventId: 'evt:3',
        eventType: 'purchase',
        userId: 'user:1',
        itemId: 'item:3',
        timestamp: Date.now(),
        properties: {},
      };

      await pipeline.processEvent(event);
      expect(onlineStore.recordInteraction).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user:1',
          itemId: 'item:3',
          interactionType: 'purchase',
          weight: 1.0,
        }),
      );
    });

    it('does not create item features for events without itemId', async () => {
      const event: RawEvent = {
        eventId: 'evt:4',
        eventType: 'login',
        userId: 'user:1',
        timestamp: Date.now(),
        properties: {},
      };

      const features = await pipeline.processEvent(event);
      const types = features.map((f) => f.entityType);
      expect(types).not.toContain('item');
      expect(types).not.toContain('interaction');
    });

    it('updates pipeline statistics', async () => {
      const event: RawEvent = {
        eventId: 'evt:5',
        eventType: 'click',
        userId: 'user:1',
        itemId: 'item:1',
        timestamp: Date.now(),
        properties: {},
      };

      await pipeline.processEvent(event);
      const stats = pipeline.getStats();
      expect(stats.eventsProcessed).toBe(1);
      expect(stats.featuresWritten).toBeGreaterThan(0);
      expect(stats.errors).toBe(0);
      expect(stats.lastProcessedAt).not.toBeNull();
    });
  });

  describe('materializeBatch', () => {
    it('processes multiple events and flushes buffer', async () => {
      const events: RawEvent[] = Array.from({ length: 5 }, (_, i) => ({
        eventId: `evt:${i}`,
        eventType: 'click',
        userId: `user:${i}`,
        itemId: `item:${i}`,
        timestamp: Date.now(),
        properties: {},
      }));

      const features = await pipeline.materializeBatch(events);
      expect(features.length).toBeGreaterThan(0);
      expect(pipeline.getBufferSize()).toBe(0);
      expect(offlineStore.writeFeatures).toHaveBeenCalled();
    });

    it('flushes buffer when maxBufferSize is exceeded', async () => {
      const events: RawEvent[] = Array.from({ length: 12 }, (_, i) => ({
        eventId: `evt:${i}`,
        eventType: 'view',
        userId: `user:${i}`,
        itemId: `item:${i}`,
        timestamp: Date.now(),
        properties: {},
      }));

      await pipeline.materializeBatch(events);
      // Buffer should have been flushed at least once (maxBufferSize=10)
      const writeCount = (offlineStore.writeFeatures as ReturnType<typeof vi.fn>).mock.calls.length;
      expect(writeCount).toBeGreaterThan(0);
    });
  });

  describe('refreshFeatures', () => {
    it('reads from offline store and writes to online store', async () => {
      await pipeline.refreshFeatures('user:1');
      expect(offlineStore.readFeatures).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'user',
          entityIds: ['user:1'],
        }),
      );
      expect(onlineStore.setFeatures).toHaveBeenCalledWith(
        'user:1',
        expect.objectContaining({ entityId: 'user:1', score: 0.5 }),
      );
    });
  });

  describe('getStats', () => {
    it('returns copy of pipeline statistics', () => {
      const stats = pipeline.getStats();
      expect(stats.eventsProcessed).toBe(0);
      expect(stats.featuresWritten).toBe(0);
      expect(stats.errors).toBe(0);
      expect(stats.lastProcessedAt).toBeNull();
    });
  });
});
