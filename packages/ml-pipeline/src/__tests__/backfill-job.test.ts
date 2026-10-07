import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BackfillJob } from '../feature-store/backfill-job';
import type { OnlineFeatureStore } from '../feature-store/online-store';
import type { OfflineFeatureStore } from '../feature-store/offline-store';

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

function createMockOfflineStore(): OfflineFeatureStore {
  return {
    writeFeatures: vi.fn().mockResolvedValue('features/user/2024/01/01/data.json'),
    readFeatures: vi.fn().mockResolvedValue([]),
    getTrainingData: vi
      .fn()
      .mockResolvedValue({
        records: [],
        totalCount: 0,
        dateRange: { start: 0, end: 0 },
        featureNames: [],
      }),
    deletePartition: vi.fn().mockResolvedValue(undefined),
    getPartitionInfo: vi.fn().mockResolvedValue(null),
  } as unknown as OfflineFeatureStore;
}

describe('BackfillJob', () => {
  let onlineStore: OnlineFeatureStore;
  let offlineStore: OfflineFeatureStore;
  let backfillJob: BackfillJob;

  beforeEach(() => {
    onlineStore = createMockOnlineStore();
    offlineStore = createMockOfflineStore();
    backfillJob = new BackfillJob(onlineStore, offlineStore);
  });

  describe('runBackfill', () => {
    it('reads features from online store for given entity IDs', async () => {
      const featureMap = new Map([
        ['user-1', { total_views: 100, ctr: 0.5 }],
        ['user-2', { total_views: 50, ctr: 0.3 }],
      ]);
      (onlineStore.getBatchFeatures as ReturnType<typeof vi.fn>).mockResolvedValue(featureMap);

      await backfillJob.runBackfill('user', ['user-1', 'user-2']);

      expect(onlineStore.getBatchFeatures).toHaveBeenCalledWith(['user-1', 'user-2']);
    });

    it('writes snapshot to offline store', async () => {
      const featureMap = new Map([['user-1', { total_views: 100 }]]);
      (onlineStore.getBatchFeatures as ReturnType<typeof vi.fn>).mockResolvedValue(featureMap);

      await backfillJob.runBackfill('user', ['user-1']);

      expect(offlineStore.writeFeatures).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'user',
          schema: 'user',
          records: expect.arrayContaining([
            expect.objectContaining({
              entityId: 'user-1',
              total_views: 100,
            }),
          ]),
        }),
      );
    });

    it('includes snapshot timestamp in records', async () => {
      const featureMap = new Map([['user-1', { score: 0.9 }]]);
      (onlineStore.getBatchFeatures as ReturnType<typeof vi.fn>).mockResolvedValue(featureMap);

      await backfillJob.runBackfill('user', ['user-1']);

      const writeCall = (offlineStore.writeFeatures as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(writeCall.records[0]._snapshotTimestamp).toBeDefined();
      expect(typeof writeCall.records[0]._snapshotTimestamp).toBe('number');
    });

    it('returns the key from offline store write', async () => {
      const featureMap = new Map([['user-1', { score: 0.9 }]]);
      (onlineStore.getBatchFeatures as ReturnType<typeof vi.fn>).mockResolvedValue(featureMap);

      const key = await backfillJob.runBackfill('user', ['user-1']);
      expect(key).toBe('features/user/2024/01/01/data.json');
    });

    it('handles empty feature map gracefully', async () => {
      (onlineStore.getBatchFeatures as ReturnType<typeof vi.fn>).mockResolvedValue(new Map());

      await backfillJob.runBackfill('user', ['user-1']);

      expect(offlineStore.writeFeatures).toHaveBeenCalledWith(
        expect.objectContaining({
          records: [],
        }),
      );
    });
  });

  describe('scheduleNightly', () => {
    it('returns cron schedule configuration', () => {
      const schedule = backfillJob.scheduleNightly();
      expect(schedule.cron).toBe('0 2 * * *');
      expect(schedule.description).toContain('Nightly');
    });
  });
});
