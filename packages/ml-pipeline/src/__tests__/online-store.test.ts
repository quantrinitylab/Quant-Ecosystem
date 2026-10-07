import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OnlineFeatureStore } from '../feature-store/online-store';
import type { RedisClient, InteractionRecord } from '../feature-store/online-store';

function createMockRedis(): RedisClient {
  const store = new Map<string, string>();
  const lists = new Map<string, string[]>();

  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    mget: vi.fn(async (keys: string[]) => keys.map((k) => store.get(k) ?? null)),
    mset: vi.fn(async (entries: Record<string, string>) => {
      for (const [key, value] of Object.entries(entries)) {
        store.set(key, value);
      }
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key);
    }),
    lrange: vi.fn(async (key: string, start: number, stop: number) => {
      const list = lists.get(key) ?? [];
      return list.slice(start, stop + 1);
    }),
    lpush: vi.fn(async (key: string, ...values: string[]) => {
      const list = lists.get(key) ?? [];
      list.unshift(...values);
      lists.set(key, list);
    }),
    ltrim: vi.fn(async (key: string, start: number, stop: number) => {
      const list = lists.get(key) ?? [];
      lists.set(key, list.slice(start, stop + 1));
    }),
    ping: vi.fn(async () => 'PONG'),
  };
}

describe('OnlineFeatureStore', () => {
  let redis: RedisClient;
  let store: OnlineFeatureStore;

  beforeEach(() => {
    redis = createMockRedis();
    store = new OnlineFeatureStore(redis, { keyPrefix: 'test:' });
  });

  describe('getFeatures', () => {
    it('returns null for non-existent entity', async () => {
      const result = await store.getFeatures('user:unknown');
      expect(result).toBeNull();
    });

    it('returns all features for an entity', async () => {
      const features = { clickRate: 0.5, sessionDuration: 120 };
      await store.setFeatures('user:123', features);
      const result = await store.getFeatures('user:123');
      expect(result).toEqual(features);
    });

    it('returns only requested feature names', async () => {
      const features = { clickRate: 0.5, sessionDuration: 120, category: 'power' };
      await store.setFeatures('user:123', features);
      const result = await store.getFeatures('user:123', ['clickRate']);
      expect(result).toEqual({ clickRate: 0.5 });
    });

    it('performs reads with low latency (mocked)', async () => {
      await store.setFeatures('user:fast', { score: 0.9 });
      const start = performance.now();
      await store.getFeatures('user:fast');
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(10);
    });
  });

  describe('setFeatures', () => {
    it('stores features with default TTL', async () => {
      await store.setFeatures('user:123', { level: 'high' });
      expect(redis.set).toHaveBeenCalledWith('test:user:123', expect.any(String), 3600);
    });

    it('stores features with custom TTL', async () => {
      await store.setFeatures('user:123', { level: 'high' }, 7200);
      expect(redis.set).toHaveBeenCalledWith('test:user:123', expect.any(String), 7200);
    });
  });

  describe('getBatchFeatures', () => {
    it('returns features for multiple entities', async () => {
      await store.setFeatures('user:1', { score: 0.8 });
      await store.setFeatures('user:2', { score: 0.6 });

      const result = await store.getBatchFeatures(['user:1', 'user:2', 'user:3']);
      expect(result.size).toBe(2);
      expect(result.get('user:1')).toEqual({ score: 0.8 });
      expect(result.get('user:2')).toEqual({ score: 0.6 });
      expect(result.has('user:3')).toBe(false);
    });
  });

  describe('setBatchFeatures', () => {
    it('stores multiple feature records', async () => {
      await store.setBatchFeatures([
        { entityId: 'user:1', features: { x: 1 } },
        { entityId: 'user:2', features: { x: 2 } },
      ]);
      expect(redis.mset).toHaveBeenCalledWith(
        expect.objectContaining({
          'test:user:1': expect.any(String),
          'test:user:2': expect.any(String),
        }),
        3600,
      );
    });
  });

  describe('getRecentInteractions', () => {
    it('returns recent interactions for a user', async () => {
      const interaction: InteractionRecord = {
        userId: 'user:1',
        itemId: 'item:10',
        interactionType: 'click',
        timestamp: Date.now(),
        weight: 0.3,
      };
      await store.recordInteraction(interaction);

      const result = await store.getRecentInteractions('user:1');
      expect(result).toHaveLength(1);
      expect(result[0]!.itemId).toBe('item:10');
      expect(result[0]!.interactionType).toBe('click');
    });

    it('limits results by max count', async () => {
      const limitedStore = new OnlineFeatureStore(redis, {
        keyPrefix: 'test:',
        maxRecentInteractions: 2,
      });

      for (let i = 0; i < 5; i++) {
        await limitedStore.recordInteraction({
          userId: 'user:1',
          itemId: `item:${i}`,
          interactionType: 'view',
          timestamp: Date.now(),
          weight: 0.1,
        });
      }

      const result = await limitedStore.getRecentInteractions('user:1');
      expect(result.length).toBeLessThanOrEqual(2);
    });
  });

  describe('deleteFeatures', () => {
    it('removes features for an entity', async () => {
      await store.setFeatures('user:123', { level: 'high' });
      await store.deleteFeatures('user:123');
      expect(redis.delete).toHaveBeenCalledWith('test:user:123');
    });
  });

  describe('healthCheck', () => {
    it('returns true when Redis responds', async () => {
      const healthy = await store.healthCheck();
      expect(healthy).toBe(true);
    });

    it('returns false when Redis fails', async () => {
      (redis.ping as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Connection refused'),
      );
      const healthy = await store.healthCheck();
      expect(healthy).toBe(false);
    });
  });
});
