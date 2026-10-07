// ============================================================================
// Feature Store - Feature Materialization Pipeline
// ============================================================================

import { z } from 'zod';
import type { OnlineFeatureStore, InteractionRecord } from './online-store';
import type { OfflineFeatureStore, FeatureDataset } from './offline-store';

export const PipelineConfigSchema = z.object({
  batchSize: z.number().int().positive().default(100),
  flushIntervalMs: z.number().int().positive().default(5000),
  enableOnlineWrite: z.boolean().default(true),
  enableOfflineWrite: z.boolean().default(true),
  maxBufferSize: z.number().int().positive().default(1000),
});

export type PipelineConfig = z.infer<typeof PipelineConfigSchema>;

export interface RawEvent {
  eventId: string;
  eventType: string;
  userId: string;
  itemId?: string;
  timestamp: number;
  properties: Record<string, unknown>;
}

export interface MaterializedFeature {
  entityId: string;
  entityType: 'user' | 'item' | 'interaction';
  features: Record<string, unknown>;
  timestamp: number;
}

export interface PipelineStats {
  eventsProcessed: number;
  featuresWritten: number;
  errors: number;
  lastProcessedAt: number | null;
}

export class FeatureMaterializationPipeline {
  private readonly onlineStore: OnlineFeatureStore;
  private readonly offlineStore: OfflineFeatureStore;
  private readonly config: PipelineConfig;
  private buffer: MaterializedFeature[] = [];
  private stats: PipelineStats = {
    eventsProcessed: 0,
    featuresWritten: 0,
    errors: 0,
    lastProcessedAt: null,
  };

  constructor(
    onlineStore: OnlineFeatureStore,
    offlineStore: OfflineFeatureStore,
    config?: Partial<PipelineConfig>,
  ) {
    this.config = PipelineConfigSchema.parse(config ?? {});
    this.onlineStore = onlineStore;
    this.offlineStore = offlineStore;
  }

  async processEvent(event: RawEvent): Promise<MaterializedFeature[]> {
    const features: MaterializedFeature[] = [];

    try {
      // Materialize user features from event
      const userFeature = this.extractUserFeatures(event);
      if (userFeature) {
        features.push(userFeature);
      }

      // Materialize item features if item-related event
      if (event.itemId) {
        const itemFeature = this.extractItemFeatures(event);
        if (itemFeature) {
          features.push(itemFeature);
        }

        // Record interaction
        const interaction = this.extractInteraction(event);
        if (interaction) {
          features.push(interaction);
        }
      }

      // Write to online store
      if (this.config.enableOnlineWrite) {
        for (const feature of features) {
          await this.onlineStore.setFeatures(feature.entityId, feature.features);
        }

        // Record interaction for real-time retrieval
        if (event.itemId) {
          const interactionRecord: InteractionRecord = {
            userId: event.userId,
            itemId: event.itemId,
            interactionType: event.eventType,
            timestamp: event.timestamp,
            weight: this.getInteractionWeight(event.eventType),
          };
          await this.onlineStore.recordInteraction(interactionRecord);
        }
      }

      // Buffer for offline batch write
      this.buffer.push(...features);
      if (this.buffer.length >= this.config.maxBufferSize) {
        await this.flushBuffer();
      }

      this.stats.eventsProcessed++;
      this.stats.featuresWritten += features.length;
      this.stats.lastProcessedAt = Date.now();
    } catch {
      this.stats.errors++;
    }

    return features;
  }

  async materializeBatch(events: RawEvent[]): Promise<MaterializedFeature[]> {
    const allFeatures: MaterializedFeature[] = [];

    for (const event of events) {
      const features = await this.processEvent(event);
      allFeatures.push(...features);
    }

    // Ensure buffer is flushed after batch
    if (this.buffer.length > 0) {
      await this.flushBuffer();
    }

    return allFeatures;
  }

  async refreshFeatures(entityId: string): Promise<void> {
    // Read current features from offline store
    const records = await this.offlineStore.readFeatures({
      entityType: 'user',
      entityIds: [entityId],
      limit: 1,
    });

    if (records.length > 0) {
      // Write latest features to online store
      await this.onlineStore.setFeatures(entityId, records[0]!);
    }
  }

  async flushBuffer(): Promise<void> {
    if (this.buffer.length === 0) return;

    if (this.config.enableOfflineWrite) {
      // Group by entity type for partitioned storage
      const byType = new Map<string, MaterializedFeature[]>();
      for (const feature of this.buffer) {
        const existing = byType.get(feature.entityType) ?? [];
        existing.push(feature);
        byType.set(feature.entityType, existing);
      }

      for (const [entityType, features] of byType.entries()) {
        const dataset: FeatureDataset = {
          entityType,
          records: features.map((f) => ({
            entityId: f.entityId,
            ...f.features,
            _timestamp: f.timestamp,
          })),
          schema: entityType,
          createdAt: Date.now(),
        };
        await this.offlineStore.writeFeatures(dataset);
      }
    }

    this.buffer = [];
  }

  getStats(): PipelineStats {
    return { ...this.stats };
  }

  getBufferSize(): number {
    return this.buffer.length;
  }

  private extractUserFeatures(event: RawEvent): MaterializedFeature | null {
    const features: Record<string, unknown> = {
      lastActiveAt: event.timestamp,
      lastEventType: event.eventType,
    };

    if (event.properties['sessionDuration']) {
      features['avgSessionDuration'] = event.properties['sessionDuration'];
    }
    if (event.properties['platform']) {
      features['lastPlatform'] = event.properties['platform'];
    }

    return {
      entityId: event.userId,
      entityType: 'user',
      features,
      timestamp: event.timestamp,
    };
  }

  private extractItemFeatures(event: RawEvent): MaterializedFeature | null {
    if (!event.itemId) return null;

    const features: Record<string, unknown> = {
      lastInteractionAt: event.timestamp,
      lastInteractionType: event.eventType,
    };

    if (event.properties['category']) {
      features['category'] = event.properties['category'];
    }
    if (event.properties['rating']) {
      features['latestRating'] = event.properties['rating'];
    }

    return {
      entityId: event.itemId,
      entityType: 'item',
      features,
      timestamp: event.timestamp,
    };
  }

  private extractInteraction(event: RawEvent): MaterializedFeature | null {
    if (!event.itemId) return null;

    return {
      entityId: `${event.userId}:${event.itemId}`,
      entityType: 'interaction',
      features: {
        userId: event.userId,
        itemId: event.itemId,
        interactionType: event.eventType,
        weight: this.getInteractionWeight(event.eventType),
        ...event.properties,
      },
      timestamp: event.timestamp,
    };
  }

  private getInteractionWeight(eventType: string): number {
    const weights: Record<string, number> = {
      view: 0.1,
      click: 0.3,
      like: 0.5,
      share: 0.7,
      bookmark: 0.6,
      comment: 0.8,
      purchase: 1.0,
    };
    return weights[eventType] ?? 0.2;
  }
}
