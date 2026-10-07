// ============================================================================
// Performance Package - Background Sync Queue
// Persistent queue simulation, retry with exponential backoff,
// conflict resolution, bandwidth detection, batch sync
// ============================================================================

import type { SyncQueueItem, SyncStatus } from '../types';

/** Sync operation result */
interface SyncResult {
  id: string;
  success: boolean;
  statusCode: number;
  retryable: boolean;
  error?: string;
  duration: number;
}

/** Conflict resolution strategy */
type ConflictStrategy = 'CLIENT_WINS' | 'SERVER_WINS' | 'LAST_WRITE_WINS' | 'MERGE';

/** Bandwidth estimation */
interface BandwidthEstimate {
  downlink: number; // Mbps
  effectiveType: '4g' | '3g' | '2g' | 'slow-2g';
  rtt: number; // ms
  saveData: boolean;
}

/** Batch sync configuration */
interface BatchConfig {
  maxBatchSize: number;
  batchDelayMs: number;
  groupByUrl: boolean;
}

/**
 * BackgroundSyncQueue manages offline requests with persistent queue simulation,
 * exponential backoff retry, conflict resolution, bandwidth-aware scheduling,
 * and batch synchronization.
 */
export class BackgroundSyncQueue {
  private readonly queue: Map<string, SyncQueueItem>;
  private readonly completedItems: Map<string, SyncResult>;
  private readonly conflictStrategy: ConflictStrategy;
  private readonly batchConfig: BatchConfig;
  private readonly maxQueueSize: number;
  private bandwidth: BandwidthEstimate;
  private isProcessing: boolean;
  private isSyncing: boolean;
  private processingTimer: ReturnType<typeof setTimeout> | null;
  private itemCounter: number;
  private totalSynced: number;
  private totalFailed: number;

  constructor(config: {
    conflictStrategy?: ConflictStrategy;
    maxQueueSize?: number;
    batchMaxSize?: number;
    batchDelayMs?: number;
  } = {}) {
    this.queue = new Map();
    this.completedItems = new Map();
    this.conflictStrategy = config.conflictStrategy ?? 'LAST_WRITE_WINS';
    this.maxQueueSize = config.maxQueueSize ?? 1000;
    this.isProcessing = false;
    this.isSyncing = false;
    this.processingTimer = null;
    this.itemCounter = 0;
    this.totalSynced = 0;
    this.totalFailed = 0;

    this.batchConfig = {
      maxBatchSize: config.batchMaxSize ?? 10,
      batchDelayMs: config.batchDelayMs ?? 1000,
      groupByUrl: true,
    };

    this.bandwidth = {
      downlink: 10,
      effectiveType: '4g',
      rtt: 50,
      saveData: false,
    };
  }

  /**
   * Add a request to the sync queue.
   */
  enqueue(
    url: string,
    method: string,
    body?: string,
    headers?: Record<string, string>,
    priority?: number
  ): string {
    if (this.queue.size >= this.maxQueueSize) {
      // Evict lowest priority item
      this.evictLowestPriority();
    }

    const id = `sync-${++this.itemCounter}-${Date.now().toString(36)}`;
    const item: SyncQueueItem = {
      id,
      url,
      method,
      body,
      headers: headers ?? {},
      attempts: 0,
      maxAttempts: 5,
      lastAttempt: 0,
      nextAttempt: Date.now(),
      status: 'PENDING',
      priority: priority ?? 0,
      createdAt: Date.now(),
    };

    this.queue.set(id, item);
    return id;
  }

  /**
   * Process the sync queue, executing pending requests.
   * Uses bandwidth-aware scheduling and exponential backoff.
   */
  async processQueue(executor: (item: SyncQueueItem) => Promise<SyncResult>): Promise<{
    synced: number;
    failed: number;
    remaining: number;
  }> {
    if (this.isProcessing) {
      return { synced: 0, failed: 0, remaining: this.getPendingCount() };
    }

    this.isProcessing = true;
    let synced = 0;
    let failed = 0;

    try {
      // Get items ready for processing
      const readyItems = this.getReadyItems();

      // Batch if configured
      const batches = this.createBatches(readyItems);

      for (const batch of batches) {
        // Check bandwidth before processing
        if (this.shouldThrottle()) {
          break;
        }

        const results = await Promise.allSettled(
          batch.map((item) => this.processItem(item, executor))
        );

        for (const result of results) {
          if (result.status === 'fulfilled' && result.value.success) {
            synced++;
            this.totalSynced++;
          } else {
            failed++;
          }
        }
      }
    } finally {
      this.isProcessing = false;
    }

    return { synced, failed, remaining: this.getPendingCount() };
  }

  /**
   * Retry a specific failed item.
   */
  async retry(id: string, executor: (item: SyncQueueItem) => Promise<SyncResult>): Promise<SyncResult | null> {
    const item = this.queue.get(id);
    if (!item || item.status === 'COMPLETED' || item.status === 'CANCELLED') {
      return null;
    }

    item.status = 'PENDING';
    item.nextAttempt = Date.now();
    return this.processItem(item, executor);
  }

  /**
   * Cancel a queued item.
   */
  cancel(id: string): boolean {
    const item = this.queue.get(id);
    if (!item || item.status === 'COMPLETED') return false;

    item.status = 'CANCELLED';
    return true;
  }

  /**
   * Get queue status.
   */
  getStatus(): {
    pending: number;
    inProgress: number;
    completed: number;
    failed: number;
    cancelled: number;
    totalSynced: number;
    totalFailed: number;
  } {
    let pending = 0, inProgress = 0, completed = 0, failed = 0, cancelled = 0;

    for (const item of this.queue.values()) {
      switch (item.status) {
        case 'PENDING': pending++; break;
        case 'IN_PROGRESS': inProgress++; break;
        case 'COMPLETED': completed++; break;
        case 'FAILED': failed++; break;
        case 'CANCELLED': cancelled++; break;
      }
    }

    return {
      pending, inProgress, completed, failed, cancelled,
      totalSynced: this.totalSynced,
      totalFailed: this.totalFailed,
    };
  }

  /**
   * Get a specific item from the queue.
   */
  getItem(id: string): SyncQueueItem | undefined {
    return this.queue.get(id);
  }

  /**
   * Get all items with a specific status.
   */
  getItemsByStatus(status: SyncStatus): SyncQueueItem[] {
    return [...this.queue.values()].filter((item) => item.status === status);
  }

  /**
   * Update bandwidth estimation (simulate NetworkInformation API).
   */
  updateBandwidth(estimate: Partial<BandwidthEstimate>): void {
    this.bandwidth = { ...this.bandwidth, ...estimate };
  }

  /**
   * Resolve a conflict between local and server versions.
   */
  resolveConflict(
    localItem: SyncQueueItem,
    serverTimestamp: number
  ): 'use_local' | 'use_server' | 'merge' {
    switch (this.conflictStrategy) {
      case 'CLIENT_WINS':
        return 'use_local';
      case 'SERVER_WINS':
        return 'use_server';
      case 'LAST_WRITE_WINS':
        return localItem.createdAt > serverTimestamp ? 'use_local' : 'use_server';
      case 'MERGE':
        return 'merge';
      default:
        return 'use_server';
    }
  }

  /**
   * Start automatic periodic sync processing.
   */
  startPeriodicSync(
    intervalMs: number,
    executor: (item: SyncQueueItem) => Promise<SyncResult>
  ): void {
    this.stopPeriodicSync();
    this.processingTimer = setInterval(() => {
      if (!this.isProcessing && this.getPendingCount() > 0) {
        this.processQueue(executor);
      }
    }, intervalMs);
  }

  /**
   * Stop automatic sync.
   */
  stopPeriodicSync(): void {
    if (this.processingTimer) {
      clearInterval(this.processingTimer);
      this.processingTimer = null;
    }
  }

  /**
   * Clear completed and cancelled items from the queue.
   */
  purge(): number {
    let purged = 0;
    for (const [id, item] of this.queue) {
      if (item.status === 'COMPLETED' || item.status === 'CANCELLED') {
        this.queue.delete(id);
        purged++;
      }
    }
    return purged;
  }

  /**
   * Get pending item count.
   */
  getPendingCount(): number {
    let count = 0;
    for (const item of this.queue.values()) {
      if (item.status === 'PENDING') count++;
    }
    return count;
  }

  /**
   * Get total queue size.
   */
  getQueueSize(): number {
    return this.queue.size;
  }

  /**
   * Get current bandwidth estimate.
   */
  getBandwidth(): BandwidthEstimate {
    return { ...this.bandwidth };
  }

  // ===========================================================================
  // Private methods
  // ===========================================================================

  /** Process a single queue item with retry logic */
  private async processItem(
    item: SyncQueueItem,
    executor: (item: SyncQueueItem) => Promise<SyncResult>
  ): Promise<SyncResult> {
    item.status = 'IN_PROGRESS';
    item.attempts++;
    item.lastAttempt = Date.now();

    try {
      const startTime = Date.now();
      const result = await executor(item);
      result.duration = Date.now() - startTime;

      if (result.success) {
        item.status = 'COMPLETED';
        this.completedItems.set(item.id, result);
      } else if (result.retryable && item.attempts < item.maxAttempts) {
        // Schedule retry with exponential backoff
        item.status = 'PENDING';
        item.nextAttempt = Date.now() + this.calculateBackoff(item.attempts);
      } else {
        item.status = 'FAILED';
        this.totalFailed++;
        this.completedItems.set(item.id, result);
      }

      return result;
    } catch (error) {
      const result: SyncResult = {
        id: item.id,
        success: false,
        statusCode: 0,
        retryable: true,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - item.lastAttempt,
      };

      if (item.attempts < item.maxAttempts) {
        item.status = 'PENDING';
        item.nextAttempt = Date.now() + this.calculateBackoff(item.attempts);
      } else {
        item.status = 'FAILED';
        this.totalFailed++;
      }

      return result;
    }
  }

  /** Calculate exponential backoff delay */
  private calculateBackoff(attempt: number): number {
    // Exponential backoff: base * 2^attempt + jitter
    const baseDelay = 1000;
    const maxDelay = 60000;
    const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);
    const jitter = Math.random() * 1000;
    return Math.min(exponentialDelay + jitter, maxDelay);
  }

  /** Get items that are ready for processing */
  private getReadyItems(): SyncQueueItem[] {
    const now = Date.now();
    return [...this.queue.values()]
      .filter((item) => item.status === 'PENDING' && item.nextAttempt <= now)
      .sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt);
  }

  /** Create batches from ready items */
  private createBatches(items: SyncQueueItem[]): SyncQueueItem[][] {
    const batches: SyncQueueItem[][] = [];
    for (let i = 0; i < items.length; i += this.batchConfig.maxBatchSize) {
      batches.push(items.slice(i, i + this.batchConfig.maxBatchSize));
    }
    return batches;
  }

  /** Check if we should throttle based on bandwidth */
  private shouldThrottle(): boolean {
    if (this.bandwidth.saveData) return true;
    if (this.bandwidth.effectiveType === 'slow-2g') return true;
    if (this.bandwidth.effectiveType === '2g' && this.getPendingCount() > 5) return true;
    return false;
  }

  /** Evict the lowest priority item from the queue */
  private evictLowestPriority(): void {
    let lowestItem: SyncQueueItem | null = null;
    let lowestPriority = Infinity;

    for (const item of this.queue.values()) {
      if (item.status === 'PENDING' && item.priority < lowestPriority) {
        lowestPriority = item.priority;
        lowestItem = item;
      }
    }

    if (lowestItem) {
      this.queue.delete(lowestItem.id);
    }
  }
}
