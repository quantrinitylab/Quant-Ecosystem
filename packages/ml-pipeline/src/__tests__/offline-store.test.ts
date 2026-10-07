import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OfflineFeatureStore } from '../feature-store/offline-store';
import type { S3Client, FeatureDataset } from '../feature-store/offline-store';

function createMockS3(): S3Client {
  const store = new Map<string, ArrayBuffer>();
  const metadata = new Map<string, Record<string, string>>();

  return {
    putObject: vi.fn(
      async (bucket: string, key: string, data: ArrayBuffer, meta?: Record<string, string>) => {
        store.set(`${bucket}/${key}`, data);
        if (meta) metadata.set(`${bucket}/${key}`, meta);
      },
    ),
    getObject: vi.fn(async (bucket: string, key: string) => store.get(`${bucket}/${key}`) ?? null),
    listObjects: vi.fn(async (bucket: string, prefix: string) => {
      return Array.from(store.keys())
        .filter((k) => k.startsWith(`${bucket}/${prefix}`))
        .map((k) => k.slice(bucket.length + 1));
    }),
    deleteObject: vi.fn(async (bucket: string, key: string) => {
      store.delete(`${bucket}/${key}`);
    }),
    headObject: vi.fn(async (bucket: string, key: string) => {
      const data = store.get(`${bucket}/${key}`);
      if (!data) return null;
      return { size: data.byteLength, lastModified: Date.now() };
    }),
  };
}

describe('OfflineFeatureStore', () => {
  let s3: S3Client;
  let store: OfflineFeatureStore;

  beforeEach(() => {
    s3 = createMockS3();
    store = new OfflineFeatureStore(s3, {
      bucket: 'test-bucket',
      basePath: 'features/',
      partitionBy: 'both',
      format: 'json',
    });
  });

  describe('writeFeatures', () => {
    it('writes a feature dataset to S3', async () => {
      const dataset: FeatureDataset = {
        entityType: 'user',
        records: [
          { entityId: 'user:1', clickRate: 0.5, sessionDuration: 120 },
          { entityId: 'user:2', clickRate: 0.3, sessionDuration: 80 },
        ],
        schema: 'user_features',
        createdAt: new Date('2024-01-15').getTime(),
      };

      const key = await store.writeFeatures(dataset);
      expect(s3.putObject).toHaveBeenCalledWith(
        'test-bucket',
        expect.stringContaining('features/user/'),
        expect.any(ArrayBuffer),
        expect.objectContaining({
          entityType: 'user',
          recordCount: '2',
        }),
      );
      expect(key).toContain('features/user/');
    });

    it('uses correct partition path format', async () => {
      const dataset: FeatureDataset = {
        entityType: 'item',
        records: [{ entityId: 'item:1', category: 'electronics' }],
        schema: 'item_features',
        createdAt: new Date('2024-03-20').getTime(),
      };

      const key = await store.writeFeatures(dataset);
      expect(key).toContain('item/2024/03/20/data.json');
    });
  });

  describe('readFeatures', () => {
    it('reads features with entity ID filter', async () => {
      const dataset: FeatureDataset = {
        entityType: 'user',
        records: [
          { entityId: 'user:1', score: 0.9 },
          { entityId: 'user:2', score: 0.7 },
          { entityId: 'user:3', score: 0.5 },
        ],
        schema: 'user_features',
        createdAt: Date.now(),
      };
      await store.writeFeatures(dataset);

      const results = await store.readFeatures({
        entityType: 'user',
        entityIds: ['user:1', 'user:3'],
      });

      expect(results).toHaveLength(2);
      expect(results.map((r) => r['entityId'])).toEqual(['user:1', 'user:3']);
    });

    it('reads features with specific feature names', async () => {
      const dataset: FeatureDataset = {
        entityType: 'user',
        records: [{ entityId: 'user:1', score: 0.9, category: 'power', age: 25 }],
        schema: 'user_features',
        createdAt: Date.now(),
      };
      await store.writeFeatures(dataset);

      const results = await store.readFeatures({
        entityType: 'user',
        featureNames: ['score', 'category'],
      });

      expect(results).toHaveLength(1);
      expect(results[0]).toHaveProperty('score', 0.9);
      expect(results[0]).toHaveProperty('category', 'power');
      expect(results[0]).not.toHaveProperty('age');
    });

    it('respects limit parameter', async () => {
      const dataset: FeatureDataset = {
        entityType: 'user',
        records: Array.from({ length: 50 }, (_, i) => ({
          entityId: `user:${i}`,
          score: i / 50,
        })),
        schema: 'user_features',
        createdAt: Date.now(),
      };
      await store.writeFeatures(dataset);

      const results = await store.readFeatures({
        entityType: 'user',
        limit: 5,
      });

      expect(results.length).toBeLessThanOrEqual(5);
    });
  });

  describe('getTrainingData', () => {
    it('retrieves training data within date range', async () => {
      const dataset: FeatureDataset = {
        entityType: 'user',
        records: [
          { entityId: 'user:1', score: 0.9, label: 1 },
          { entityId: 'user:2', score: 0.3, label: 0 },
        ],
        schema: 'user_features',
        createdAt: Date.now(),
      };
      await store.writeFeatures(dataset);

      const result = await store.getTrainingData({
        entityType: 'user',
        startDate: Date.now() - 86400000,
        endDate: Date.now() + 86400000,
        features: ['score', 'label'],
      });

      expect(result.totalCount).toBeGreaterThan(0);
      expect(result.featureNames).toEqual(['score', 'label']);
    });
  });

  describe('deletePartition', () => {
    it('deletes a specific partition', async () => {
      const dataset: FeatureDataset = {
        entityType: 'user',
        records: [{ entityId: 'user:1', score: 0.9 }],
        schema: 'user_features',
        createdAt: new Date('2024-01-15').getTime(),
      };
      await store.writeFeatures(dataset);

      await store.deletePartition('user', new Date('2024-01-15').getTime());
      expect(s3.deleteObject).toHaveBeenCalledWith(
        'test-bucket',
        expect.stringContaining('user/2024/01/15'),
      );
    });
  });

  describe('getPartitionInfo', () => {
    it('returns partition metadata', async () => {
      const timestamp = new Date('2024-02-10').getTime();
      const dataset: FeatureDataset = {
        entityType: 'item',
        records: [{ entityId: 'item:1', category: 'books' }],
        schema: 'item_features',
        createdAt: timestamp,
      };
      await store.writeFeatures(dataset);

      const info = await store.getPartitionInfo('item', timestamp);
      expect(info).not.toBeNull();
      expect(info!.size).toBeGreaterThan(0);
    });

    it('returns null for non-existent partition', async () => {
      const info = await store.getPartitionInfo('user', Date.now());
      expect(info).toBeNull();
    });
  });

  describe('format validation', () => {
    it('throws when parquet format is requested', () => {
      expect(
        () =>
          new OfflineFeatureStore(s3, {
            bucket: 'test-bucket',
            basePath: 'features/',
            format: 'parquet',
          }),
      ).toThrow('Parquet format is not yet supported');
    });

    it('accepts json format without throwing', () => {
      expect(
        () =>
          new OfflineFeatureStore(s3, {
            bucket: 'test-bucket',
            basePath: 'features/',
            format: 'json',
          }),
      ).not.toThrow();
    });
  });
});
