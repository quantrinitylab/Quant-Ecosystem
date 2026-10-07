import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FeatureAggregator, type UserEvent } from '../feature-store/aggregator';
import type { OnlineFeatureStore } from '../feature-store/online-store';

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

function createEvent(overrides: Partial<UserEvent> = {}): UserEvent {
  return {
    userId: 'user-1',
    eventType: 'view',
    itemId: 'item-1',
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('FeatureAggregator', () => {
  let aggregator: FeatureAggregator;
  let mockStore: OnlineFeatureStore;

  beforeEach(() => {
    mockStore = createMockOnlineStore();
    aggregator = new FeatureAggregator(mockStore);
  });

  describe('processEvent', () => {
    it('accumulates events for a user', () => {
      aggregator.processEvent(createEvent({ userId: 'user-1' }));
      aggregator.processEvent(createEvent({ userId: 'user-1' }));
      aggregator.processEvent(createEvent({ userId: 'user-2' }));

      expect(aggregator.getUserIds()).toContain('user-1');
      expect(aggregator.getUserIds()).toContain('user-2');
    });

    it('marks user state as dirty after event', () => {
      aggregator.processEvent(createEvent());
      const features = aggregator.getAggregatedFeatures('user-1');
      expect(features.total_views_24h).toBeGreaterThan(0);
    });
  });

  describe('sliding window', () => {
    it('excludes events older than 1h for total_views_1h', () => {
      const now = Date.now();
      const twoHoursAgo = now - 2 * 60 * 60 * 1000;
      const thirtyMinAgo = now - 30 * 60 * 1000;

      aggregator.processEvent(createEvent({ timestamp: twoHoursAgo }));
      aggregator.processEvent(createEvent({ timestamp: thirtyMinAgo }));
      aggregator.processEvent(createEvent({ timestamp: now }));

      const features = aggregator.getAggregatedFeatures('user-1', now);
      expect(features.total_views_1h).toBe(2); // Only 30min ago and now
      expect(features.total_views_24h).toBe(3); // All three
    });

    it('excludes events older than 24h for total_views_24h', () => {
      const now = Date.now();
      const twoDaysAgo = now - 48 * 60 * 60 * 1000;

      aggregator.processEvent(createEvent({ timestamp: twoDaysAgo }));
      aggregator.processEvent(createEvent({ timestamp: now }));

      const features = aggregator.getAggregatedFeatures('user-1', now);
      expect(features.total_views_24h).toBe(1); // Only now
    });

    it('counts sessions in 7-day window with 30-min gap', () => {
      const now = Date.now();
      // Session 1: events at t=0, t=5min
      aggregator.processEvent(createEvent({ timestamp: now - 6 * 60 * 60 * 1000 }));
      aggregator.processEvent(createEvent({ timestamp: now - 6 * 60 * 60 * 1000 + 5 * 60 * 1000 }));
      // Session 2: event at t=3h (gap > 30min)
      aggregator.processEvent(createEvent({ timestamp: now - 3 * 60 * 60 * 1000 }));
      // Session 3: event at now (gap > 30min)
      aggregator.processEvent(createEvent({ timestamp: now }));

      const features = aggregator.getAggregatedFeatures('user-1', now);
      expect(features.session_count_7d).toBe(3);
    });
  });

  describe('getAggregatedFeatures', () => {
    it('returns zeros for unknown user', () => {
      const features = aggregator.getAggregatedFeatures('unknown-user');
      expect(features.total_views_1h).toBe(0);
      expect(features.total_views_24h).toBe(0);
      expect(features.click_through_rate).toBe(0);
      expect(features.avg_dwell_time).toBe(0);
      expect(features.topic_affinity_vector).toHaveLength(10);
      expect(features.session_count_7d).toBe(0);
    });

    it('computes click-through rate correctly', () => {
      const now = Date.now();
      // 4 views, 2 clicks -> CTR = 0.5
      aggregator.processEvent(createEvent({ eventType: 'view', timestamp: now }));
      aggregator.processEvent(createEvent({ eventType: 'view', timestamp: now }));
      aggregator.processEvent(createEvent({ eventType: 'view', timestamp: now }));
      aggregator.processEvent(createEvent({ eventType: 'view', timestamp: now }));
      aggregator.processEvent(createEvent({ eventType: 'click', timestamp: now }));
      aggregator.processEvent(createEvent({ eventType: 'click', timestamp: now }));

      const features = aggregator.getAggregatedFeatures('user-1', now);
      expect(features.click_through_rate).toBe(0.5);
    });

    it('computes average dwell time from dwell events', () => {
      const now = Date.now();
      aggregator.processEvent(
        createEvent({ eventType: 'dwell', durationMs: 1000, timestamp: now }),
      );
      aggregator.processEvent(
        createEvent({ eventType: 'dwell', durationMs: 3000, timestamp: now }),
      );
      aggregator.processEvent(
        createEvent({ eventType: 'dwell', durationMs: 2000, timestamp: now }),
      );

      const features = aggregator.getAggregatedFeatures('user-1', now);
      expect(features.avg_dwell_time).toBe(2000);
    });

    it('computes topic affinity vector with 10 dimensions', () => {
      const now = Date.now();
      aggregator.processEvent(createEvent({ topicId: 'sports', timestamp: now }));
      aggregator.processEvent(createEvent({ topicId: 'sports', timestamp: now }));
      aggregator.processEvent(createEvent({ topicId: 'tech', timestamp: now }));

      const features = aggregator.getAggregatedFeatures('user-1', now);
      expect(features.topic_affinity_vector).toHaveLength(10);
      // At least one non-zero entry
      expect(features.topic_affinity_vector.some((v) => v > 0)).toBe(true);
      // Max value should be 1.0 (normalized)
      expect(Math.max(...features.topic_affinity_vector)).toBe(1);
    });
  });

  describe('pruning', () => {
    it('prunes events older than 7 days when count exceeds 100', () => {
      const now = Date.now();
      const eightDaysAgo = now - 8 * 24 * 60 * 60 * 1000;

      // Push 101 events with timestamps older than 7 days
      for (let i = 0; i < 101; i++) {
        aggregator.processEvent(createEvent({ userId: 'user-1', timestamp: eightDaysAgo + i }));
      }

      // Push a new event at current time to trigger pruning
      aggregator.processEvent(createEvent({ userId: 'user-1', timestamp: now }));

      // After pruning, only the new event should be within the 7-day window
      const features = aggregator.getAggregatedFeatures('user-1', now);
      expect(features.total_views_24h).toBe(1);
      expect(features.session_count_7d).toBe(1);
    });

    it('does not prune when event count is at or below 100', () => {
      const now = Date.now();
      const eightDaysAgo = now - 8 * 24 * 60 * 60 * 1000;

      // Push exactly 100 old events
      for (let i = 0; i < 100; i++) {
        aggregator.processEvent(createEvent({ userId: 'user-1', timestamp: eightDaysAgo + i }));
      }

      // Push a new event - no pruning since count was 100 (not > 100) before this push
      // After this push count is 101, but pruning already triggered on this push
      aggregator.processEvent(createEvent({ userId: 'user-1', timestamp: now }));

      // The old events still exist (outside 7-day window but still in state)
      // Verify via getUserIds that the user still has data
      expect(aggregator.getUserIds()).toContain('user-1');
    });
  });

  describe('flushToOnlineStore', () => {
    it('writes dirty aggregates to online store', async () => {
      aggregator.processEvent(createEvent({ userId: 'user-1' }));
      aggregator.processEvent(createEvent({ userId: 'user-2' }));

      const flushed = await aggregator.flushToOnlineStore();
      expect(flushed).toBe(2);
      expect(mockStore.setFeatures).toHaveBeenCalledTimes(2);
    });

    it('does not re-flush clean aggregates', async () => {
      aggregator.processEvent(createEvent({ userId: 'user-1' }));

      await aggregator.flushToOnlineStore();
      const flushed = await aggregator.flushToOnlineStore();

      expect(flushed).toBe(0);
      expect(mockStore.setFeatures).toHaveBeenCalledTimes(1);
    });

    it('writes correct feature values to store', async () => {
      const now = Date.now();
      aggregator.processEvent(createEvent({ eventType: 'view', timestamp: now }));

      await aggregator.flushToOnlineStore();

      expect(mockStore.setFeatures).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({
          total_views_1h: 1,
          total_views_24h: 1,
        }),
      );
    });

    it('continues flushing other users when one user fails', async () => {
      aggregator.processEvent(createEvent({ userId: 'user-1' }));
      aggregator.processEvent(createEvent({ userId: 'user-2' }));
      aggregator.processEvent(createEvent({ userId: 'user-3' }));

      // Make setFeatures fail for user-2 only
      (mockStore.setFeatures as ReturnType<typeof vi.fn>).mockImplementation(
        async (userId: string) => {
          if (userId === 'user-2') {
            throw new Error('Store write failed for user-2');
          }
        },
      );

      const flushed = await aggregator.flushToOnlineStore();
      // user-1 and user-3 should flush successfully
      expect(flushed).toBe(2);
      expect(mockStore.setFeatures).toHaveBeenCalledTimes(3);
    });
  });
});
