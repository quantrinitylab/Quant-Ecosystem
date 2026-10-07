// ============================================================================
// Performance Package - Multi-Layer Cache
// L1 (in-memory LRU), L2 (distributed sharding), L3 (CDN edge simulation)
// ============================================================================

import type {
  MultiLayerCacheConfig,
  CacheEntry,
  CacheLayerType,
  CoherenceState,
  CacheShard,
  CDNEdgeLocation,
} from '../types';
import { LRUCache } from './lru-cache';

/** Cache coherence entry tracking */
interface CoherenceEntry {
  key: string;
  state: CoherenceState;
  version: number;
  lastModified: number;
  owner: CacheLayerType;
}

/** Cache operation metrics */
interface LayerMetrics {
  reads: number;
  writes: number;
  hits: number;
  misses: number;
  invalidations: number;
  promotions: number;
  demotions: number;
}

/**
 * Multi-layer cache with L1 in-memory, L2 distributed simulation,
 * and L3 CDN edge simulation. Implements cache coherence protocols.
 */
export class MultiLayerCache<T = unknown> {
  private readonly config: MultiLayerCacheConfig;
  private readonly l1: LRUCache<T>;
  private readonly l2Shards: Map<string, Map<string, CacheEntry<T>>>;
  private readonly l3Edges: Map<string, Map<string, CacheEntry<T>>>;
  private readonly coherenceTable: Map<string, CoherenceEntry>;
  private readonly shardConfig: CacheShard[];
  private readonly edgeLocations: CDNEdgeLocation[];
  private readonly metrics: Map<CacheLayerType, LayerMetrics>;
  private versionCounter: number;

  constructor(config: Partial<MultiLayerCacheConfig> = {}) {
    this.config = {
      l1: {
        type: 'L1_MEMORY',
        maxSize: config.l1?.maxSize ?? 1000,
        ttlMs: config.l1?.ttlMs ?? 30000,
        enabled: config.l1?.enabled ?? true,
        readThrough: config.l1?.readThrough ?? true,
        writeThrough: config.l1?.writeThrough ?? true,
      },
      l2: {
        type: 'L2_DISTRIBUTED',
        maxSize: config.l2?.maxSize ?? 10000,
        ttlMs: config.l2?.ttlMs ?? 300000,
        enabled: config.l2?.enabled ?? true,
        readThrough: config.l2?.readThrough ?? true,
        writeThrough: config.l2?.writeThrough ?? true,
      },
      l3: {
        type: 'L3_CDN',
        maxSize: config.l3?.maxSize ?? 100000,
        ttlMs: config.l3?.ttlMs ?? 3600000,
        enabled: config.l3?.enabled ?? true,
        readThrough: config.l3?.readThrough ?? false,
        writeThrough: config.l3?.writeThrough ?? false,
      },
      coherenceProtocol: config.coherenceProtocol ?? 'MESI',
      enableMetrics: config.enableMetrics ?? true,
    };

    this.l1 = new LRUCache<T>({
      maxSize: this.config.l1.maxSize,
      ttlMs: this.config.l1.ttlMs,
      enableStats: true,
    });

    this.l2Shards = new Map();
    this.l3Edges = new Map();
    this.coherenceTable = new Map();
    this.versionCounter = 0;

    // Initialize L2 shards (consistent hashing simulation)
    this.shardConfig = this.initializeShards(4);
    for (const shard of this.shardConfig) {
      this.l2Shards.set(shard.id, new Map());
    }

    // Initialize L3 CDN edge locations
    this.edgeLocations = this.initializeEdges();
    for (const edge of this.edgeLocations) {
      this.l3Edges.set(edge.id, new Map());
    }

    // Initialize metrics
    this.metrics = new Map();
    this.metrics.set('L1_MEMORY', this.createEmptyMetrics());
    this.metrics.set('L2_DISTRIBUTED', this.createEmptyMetrics());
    this.metrics.set('L3_CDN', this.createEmptyMetrics());
  }

  /**
   * Get a value using read-through pattern across all layers.
   * Checks L1 first, then L2, then L3. Promotes found values upward.
   */
  async get(key: string, region?: string): Promise<T | undefined> {
    // L1 lookup
    if (this.config.l1.enabled) {
      const l1Value = this.l1.get(key);
      if (l1Value !== undefined) {
        this.recordHit('L1_MEMORY');
        return l1Value;
      }
      this.recordMiss('L1_MEMORY');
    }

    // L2 lookup (find correct shard)
    if (this.config.l2.enabled) {
      const shard = this.getShardForKey(key);
      const shardMap = this.l2Shards.get(shard.id);
      const l2Entry = shardMap?.get(key);

      if (l2Entry && !this.isEntryExpired(l2Entry)) {
        this.recordHit('L2_DISTRIBUTED');
        // Promote to L1
        if (this.config.l1.readThrough) {
          this.l1.put(key, l2Entry.value);
          this.recordPromotion('L1_MEMORY');
        }
        return l2Entry.value;
      }
      this.recordMiss('L2_DISTRIBUTED');
    }

    // L3 CDN lookup (find nearest edge)
    if (this.config.l3.enabled) {
      const edge = this.getNearestEdge(region ?? 'us-east-1');
      const edgeMap = this.l3Edges.get(edge.id);
      const l3Entry = edgeMap?.get(key);

      if (l3Entry && !this.isEntryExpired(l3Entry)) {
        this.recordHit('L3_CDN');
        // Promote to L2 and L1
        if (this.config.l2.readThrough) {
          await this.writeToL2(key, l3Entry.value, l3Entry.tags);
          this.recordPromotion('L2_DISTRIBUTED');
        }
        if (this.config.l1.readThrough) {
          this.l1.put(key, l3Entry.value);
          this.recordPromotion('L1_MEMORY');
        }
        return l3Entry.value;
      }
      this.recordMiss('L3_CDN');
    }

    return undefined;
  }

  /**
   * Set a value with write-through to all enabled layers.
   * Updates coherence state across all layers.
   */
  async set(key: string, value: T, tags: string[] = []): Promise<void> {
    const version = ++this.versionCounter;

    // Write to L1
    if (this.config.l1.enabled) {
      this.l1.put(key, value);
      this.recordWrite('L1_MEMORY');
    }

    // Write-through to L2
    if (this.config.l2.enabled && this.config.l2.writeThrough) {
      await this.writeToL2(key, value, tags);
      this.recordWrite('L2_DISTRIBUTED');
    }

    // Write-through to L3
    if (this.config.l3.enabled && this.config.l3.writeThrough) {
      await this.writeToL3(key, value, tags);
      this.recordWrite('L3_CDN');
    }

    // Update coherence table
    this.updateCoherence(key, 'MODIFIED', version, 'L1_MEMORY');
  }

  /**
   * Invalidate a key across all cache layers using coherence protocol.
   */
  async invalidate(key: string): Promise<void> {
    // Invalidate L1
    if (this.config.l1.enabled) {
      this.l1.delete(key);
      this.recordInvalidation('L1_MEMORY');
    }

    // Invalidate L2 (all shards)
    if (this.config.l2.enabled) {
      const shard = this.getShardForKey(key);
      const shardMap = this.l2Shards.get(shard.id);
      shardMap?.delete(key);
      this.recordInvalidation('L2_DISTRIBUTED');
    }

    // Invalidate L3 (all edge locations)
    if (this.config.l3.enabled) {
      for (const [, edgeMap] of this.l3Edges) {
        edgeMap.delete(key);
      }
      this.recordInvalidation('L3_CDN');
    }

    // Update coherence state
    this.updateCoherence(key, 'INVALID', this.versionCounter, 'L1_MEMORY');
  }

  /**
   * Invalidate all entries with a matching tag across all layers.
   */
  async invalidateByTag(tag: string): Promise<number> {
    let invalidated = 0;

    // Find keys with matching tag in L2
    for (const [, shardMap] of this.l2Shards) {
      for (const [key, entry] of shardMap) {
        if (entry.tags.includes(tag)) {
          await this.invalidate(key);
          invalidated++;
        }
      }
    }

    return invalidated;
  }

  /** Get metrics for all layers */
  getMetrics(): Map<CacheLayerType, LayerMetrics> {
    return new Map(this.metrics);
  }

  /** Get coherence state for a key */
  getCoherenceState(key: string): CoherenceEntry | undefined {
    return this.coherenceTable.get(key);
  }

  /** Get shard distribution info */
  getShardInfo(): CacheShard[] {
    return this.shardConfig.map((shard) => ({
      ...shard,
      entries: this.l2Shards.get(shard.id)?.size ?? 0,
    }));
  }

  /** Get CDN edge location info */
  getEdgeInfo(): CDNEdgeLocation[] {
    return this.edgeLocations.map((edge) => ({
      ...edge,
      used: this.l3Edges.get(edge.id)?.size ?? 0,
    }));
  }

  /** Clear all layers */
  async clear(): Promise<void> {
    this.l1.clear();
    for (const [, shardMap] of this.l2Shards) {
      shardMap.clear();
    }
    for (const [, edgeMap] of this.l3Edges) {
      edgeMap.clear();
    }
    this.coherenceTable.clear();
  }

  // ===========================================================================
  // Private methods
  // ===========================================================================

  private async writeToL2(key: string, value: T, tags: string[]): Promise<void> {
    const shard = this.getShardForKey(key);
    const shardMap = this.l2Shards.get(shard.id);
    if (!shardMap) return;

    const entry: CacheEntry<T> = {
      key,
      value,
      createdAt: Date.now(),
      expiresAt: Date.now() + this.config.l2.ttlMs,
      tags,
      layer: 'L2_DISTRIBUTED',
      hitCount: 0,
      size: 1,
    };
    shardMap.set(key, entry);
  }

  private async writeToL3(key: string, value: T, tags: string[]): Promise<void> {
    // Write to all edge locations (simulating CDN push)
    for (const [edgeId, edgeMap] of this.l3Edges) {
      const entry: CacheEntry<T> = {
        key,
        value,
        createdAt: Date.now(),
        expiresAt: Date.now() + this.config.l3.ttlMs,
        tags,
        layer: 'L3_CDN',
        hitCount: 0,
        size: 1,
      };
      edgeMap.set(key, entry);
    }
  }

  /** Consistent hashing to determine which shard owns a key */
  private getShardForKey(key: string): CacheShard {
    const hash = this.hashKey(key);
    for (const shard of this.shardConfig) {
      if (hash >= shard.startHash && hash < shard.endHash) {
        return shard;
      }
    }
    return this.shardConfig[0];
  }

  /** Simple hash function for shard distribution */
  private hashKey(key: string): number {
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      const char = key.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash) % 1000;
  }

  /** Find nearest CDN edge location */
  private getNearestEdge(region: string): CDNEdgeLocation {
    const edge = this.edgeLocations.find((e) => e.region === region);
    return edge ?? this.edgeLocations[0];
  }

  /** Check if a cache entry has expired */
  private isEntryExpired(entry: CacheEntry<T>): boolean {
    return Date.now() > entry.expiresAt;
  }

  /** Update coherence state for a key */
  private updateCoherence(
    key: string,
    state: CoherenceState,
    version: number,
    owner: CacheLayerType
  ): void {
    this.coherenceTable.set(key, {
      key,
      state,
      version,
      lastModified: Date.now(),
      owner,
    });
  }

  /** Initialize shard configuration */
  private initializeShards(count: number): CacheShard[] {
    const shards: CacheShard[] = [];
    const rangeSize = Math.floor(1000 / count);
    for (let i = 0; i < count; i++) {
      shards.push({
        id: `shard-${i}`,
        nodeId: `node-${i}`,
        startHash: i * rangeSize,
        endHash: (i + 1) * rangeSize,
        entries: 0,
        lastSync: Date.now(),
      });
    }
    // Ensure last shard covers remaining range
    shards[shards.length - 1].endHash = 1000;
    return shards;
  }

  /** Initialize CDN edge locations */
  private initializeEdges(): CDNEdgeLocation[] {
    return [
      { id: 'edge-us-east', region: 'us-east-1', latencyMs: 5, hitRate: 0, capacity: 10000, used: 0 },
      { id: 'edge-us-west', region: 'us-west-2', latencyMs: 8, hitRate: 0, capacity: 10000, used: 0 },
      { id: 'edge-eu-west', region: 'eu-west-1', latencyMs: 15, hitRate: 0, capacity: 10000, used: 0 },
      { id: 'edge-ap-east', region: 'ap-east-1', latencyMs: 25, hitRate: 0, capacity: 10000, used: 0 },
    ];
  }

  /** Create empty metrics object */
  private createEmptyMetrics(): LayerMetrics {
    return { reads: 0, writes: 0, hits: 0, misses: 0, invalidations: 0, promotions: 0, demotions: 0 };
  }

  private recordHit(layer: CacheLayerType): void {
    const m = this.metrics.get(layer);
    if (m) { m.hits++; m.reads++; }
  }

  private recordMiss(layer: CacheLayerType): void {
    const m = this.metrics.get(layer);
    if (m) { m.misses++; m.reads++; }
  }

  private recordWrite(layer: CacheLayerType): void {
    const m = this.metrics.get(layer);
    if (m) { m.writes++; }
  }

  private recordInvalidation(layer: CacheLayerType): void {
    const m = this.metrics.get(layer);
    if (m) { m.invalidations++; }
  }

  private recordPromotion(layer: CacheLayerType): void {
    const m = this.metrics.get(layer);
    if (m) { m.promotions++; }
  }
}
