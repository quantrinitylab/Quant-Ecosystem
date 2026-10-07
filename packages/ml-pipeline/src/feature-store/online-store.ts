// ============================================================================
// Feature Store - Online Store (Redis-backed)
// ============================================================================

import { z } from 'zod';

export interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttl?: number): Promise<void>;
  mget(keys: string[]): Promise<(string | null)[]>;
  mset(entries: Record<string, string>, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
  lrange(key: string, start: number, stop: number): Promise<string[]>;
  lpush(key: string, ...values: string[]): Promise<void>;
  ltrim(key: string, start: number, stop: number): Promise<void>;
  ping(): Promise<string>;
}

export const OnlineStoreConfigSchema = z.object({
  keyPrefix: z.string().default('features:'),
  defaultTTL: z.number().int().positive().default(3600),
  maxRecentInteractions: z.number().int().positive().default(100),
  batchSize: z.number().int().positive().default(100),
});

export type OnlineStoreConfig = z.infer<typeof OnlineStoreConfigSchema>;

export interface FeatureRecord {
  entityId: string;
  features: Record<string, unknown>;
  updatedAt: number;
}

export interface InteractionRecord {
  userId: string;
  itemId: string;
  interactionType: string;
  timestamp: number;
  weight: number;
}

export class OnlineFeatureStore {
  private readonly redis: RedisClient;
  private readonly config: OnlineStoreConfig;

  constructor(redis: RedisClient, config?: Partial<OnlineStoreConfig>) {
    this.config = OnlineStoreConfigSchema.parse(config ?? {});
    this.redis = redis;
  }

  async getFeatures(
    entityId: string,
    featureNames?: string[],
  ): Promise<Record<string, unknown> | null> {
    const key = this.buildKey(entityId);
    const raw = await this.redis.get(key);
    if (!raw) return null;

    const record: FeatureRecord = JSON.parse(raw);
    if (!featureNames || featureNames.length === 0) {
      return record.features;
    }

    const filtered: Record<string, unknown> = {};
    for (const name of featureNames) {
      if (name in record.features) {
        filtered[name] = record.features[name];
      }
    }
    return filtered;
  }

  async setFeatures(
    entityId: string,
    features: Record<string, unknown>,
    ttl?: number,
  ): Promise<void> {
    const key = this.buildKey(entityId);
    const record: FeatureRecord = {
      entityId,
      features,
      updatedAt: Date.now(),
    };
    await this.redis.set(key, JSON.stringify(record), ttl ?? this.config.defaultTTL);
  }

  async getBatchFeatures(entityIds: string[]): Promise<Map<string, Record<string, unknown>>> {
    const keys = entityIds.map((id) => this.buildKey(id));
    const results = await this.redis.mget(keys);
    const featureMap = new Map<string, Record<string, unknown>>();

    for (let i = 0; i < entityIds.length; i++) {
      const raw = results[i];
      if (raw) {
        const record: FeatureRecord = JSON.parse(raw);
        featureMap.set(entityIds[i]!, record.features);
      }
    }

    return featureMap;
  }

  async setBatchFeatures(
    records: { entityId: string; features: Record<string, unknown> }[],
  ): Promise<void> {
    const entries: Record<string, string> = {};
    for (const record of records) {
      const key = this.buildKey(record.entityId);
      entries[key] = JSON.stringify({
        entityId: record.entityId,
        features: record.features,
        updatedAt: Date.now(),
      } satisfies FeatureRecord);
    }
    await this.redis.mset(entries, this.config.defaultTTL);
  }

  async getRecentInteractions(userId: string, limit?: number): Promise<InteractionRecord[]> {
    const key = `${this.config.keyPrefix}interactions:${userId}`;
    const maxItems = limit ?? this.config.maxRecentInteractions;
    const raw = await this.redis.lrange(key, 0, maxItems - 1);
    return raw.map((item) => JSON.parse(item) as InteractionRecord);
  }

  async recordInteraction(interaction: InteractionRecord): Promise<void> {
    const key = `${this.config.keyPrefix}interactions:${interaction.userId}`;
    await this.redis.lpush(key, JSON.stringify(interaction));
    await this.redis.ltrim(key, 0, this.config.maxRecentInteractions - 1);
  }

  async deleteFeatures(entityId: string): Promise<void> {
    const key = this.buildKey(entityId);
    await this.redis.delete(key);
  }

  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.redis.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }

  private buildKey(entityId: string): string {
    return `${this.config.keyPrefix}${entityId}`;
  }
}
