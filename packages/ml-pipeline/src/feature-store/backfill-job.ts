// ============================================================================
// Feature Store - Backfill Job (Online -> Offline snapshot)
// ============================================================================

import type { OnlineFeatureStore } from './online-store';
import type { OfflineFeatureStore, FeatureDataset } from './offline-store';

export class BackfillJob {
  private readonly onlineStore: OnlineFeatureStore;
  private readonly offlineStore: OfflineFeatureStore;

  constructor(onlineStore: OnlineFeatureStore, offlineStore: OfflineFeatureStore) {
    this.onlineStore = onlineStore;
    this.offlineStore = offlineStore;
  }

  async runBackfill(entityType: string, entityIds: string[]): Promise<string> {
    const featureMap = await this.onlineStore.getBatchFeatures(entityIds);

    const records: Record<string, unknown>[] = [];
    for (const [entityId, features] of featureMap.entries()) {
      records.push({
        entityId,
        ...features,
        _snapshotTimestamp: Date.now(),
      });
    }

    const dataset: FeatureDataset = {
      entityType,
      records,
      schema: entityType,
      createdAt: Date.now(),
    };

    const key = await this.offlineStore.writeFeatures(dataset);
    return key;
  }

  scheduleNightly(): { cron: string; description: string } {
    // Stub: describes the intended cron schedule for nightly backfill
    return {
      cron: '0 2 * * *',
      description:
        'Nightly backfill job runs at 2:00 AM UTC. Reads all active entity features from the online store and writes a daily snapshot to the offline store for training data generation.',
    };
  }
}
