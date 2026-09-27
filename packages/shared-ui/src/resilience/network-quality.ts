// ============================================================================
// @quant/shared-ui - Appy v1.1.2 Offline Resilience & Network Quality Monitor
// ============================================================================

import { useEffect, useState } from 'react';

export type NetworkStatus = 'online' | 'offline';
export type QualityTier = 'excellent' | 'good' | 'poor' | 'offline';

export interface NetworkQualityState {
  status: NetworkStatus;
  rttMs: number;
  downlinkMbps: number;
  qualityTier: QualityTier;
  isMetered: boolean;
  lastCheckedAt: string;
}

export interface QueuedMutation<T = any> {
  id: string;
  action: string;
  payload: T;
  retryCount: number;
  maxRetries: number;
  queuedAt: string;
  status: 'PENDING' | 'SYNCING' | 'COMPLETED' | 'FAILED';
  error?: string;
}

export interface OfflineMutationQueueOptions {
  storageKey?: string;
  defaultMaxRetries?: number;
  storage?: Storage | null;
}

/**
 * Classifies the network connection into quality tiers based on status and round-trip time (RTT).
 *
 * Rules:
 * - If status === 'offline' -> 'offline'
 * - If rttMs < 100 -> 'excellent'
 * - If rttMs <= 300 -> 'good'
 * - If rttMs > 300 -> 'poor'
 */
export function classifyQualityTier(status: NetworkStatus, rttMs: number): QualityTier {
  if (status === 'offline') {
    return 'offline';
  }
  if (rttMs < 100) {
    return 'excellent';
  }
  if (rttMs <= 300) {
    return 'good';
  }
  return 'poor';
}

/**
 * Generates a unique mutation identifier.
 */
function generateMutationId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `mut_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Appy v1.1.2-grade Offline Mutation Queue
 * Buffers offline mutations, persists them to local storage, and flushes them
 * in FIFO order upon network reconnection with automatic retry management.
 */
export class OfflineMutationQueue {
  private queue: QueuedMutation[] = [];
  private storageKey: string;
  private defaultMaxRetries: number;
  private storage: Storage | null;
  private listeners: Set<(mutations: QueuedMutation[]) => void> = new Set();
  private isFlushing: boolean = false;
  private lastSyncedAt?: number;

  constructor(options: OfflineMutationQueueOptions = {}) {
    this.storageKey = options.storageKey ?? 'quant_offline_mutation_queue';
    this.defaultMaxRetries = options.defaultMaxRetries ?? 3;
    this.storage =
      options.storage !== undefined
        ? options.storage
        : typeof window !== 'undefined' && window.localStorage
          ? window.localStorage
          : null;

    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    if (!this.storage) return;
    try {
      const serialized = this.storage.getItem(this.storageKey);
      if (serialized) {
        const parsed = JSON.parse(serialized);
        if (Array.isArray(parsed)) {
          this.queue = parsed;
        }
      }
    } catch {
      // Storage access or parse error ignored safely
    }
  }

  private saveToStorage(): void {
    if (!this.storage) return;
    try {
      this.storage.setItem(this.storageKey, JSON.stringify(this.queue));
    } catch {
      // Storage quota or restriction ignored safely
    }
  }

  private notifyListeners(): void {
    const snapshot = [...this.queue];
    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch (err) {
        console.error('OfflineMutationQueue listener error:', err);
      }
    }
  }

  /**
   * Subscribe to mutation queue updates.
   */
  public subscribe(listener: (mutations: QueuedMutation[]) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Enqueue a new mutation to be processed when online.
   */
  public enqueue<T>(action: string, payload: T, maxRetries?: number): QueuedMutation<T> {
    const mutation: QueuedMutation<T> = {
      id: generateMutationId(),
      action,
      payload,
      retryCount: 0,
      maxRetries: maxRetries ?? this.defaultMaxRetries,
      queuedAt: new Date().toISOString(),
      status: 'PENDING',
    };

    this.queue.push(mutation);
    this.saveToStorage();
    this.notifyListeners();
    return mutation;
  }

  /**
   * Returns all pending mutations eligible for synchronization.
   */
  public getPendingMutations(): QueuedMutation[] {
    return this.queue.filter((m) => m.status === 'PENDING');
  }

  /**
   * Returns all mutations in the queue regardless of status.
   */
  public getAllMutations(): QueuedMutation[] {
    return [...this.queue];
  }

  /**
   * Returns all failed mutations that exceeded their maximum retries.
   */
  public getFailedMutations(): QueuedMutation[] {
    return this.queue.filter((m) => m.status === 'FAILED');
  }

  /**
   * Returns all completed mutations.
   */
  public getCompletedMutations(): QueuedMutation[] {
    return this.queue.filter((m) => m.status === 'COMPLETED');
  }

  /**
   * Retrieves a specific mutation by ID.
   */
  public getMutation(id: string): QueuedMutation | undefined {
    return this.queue.find((m) => m.id === id);
  }

  /**
   * Returns whether the queue is currently in the middle of a flush cycle.
   */
  public getIsFlushing(): boolean {
    return this.isFlushing;
  }

  /**
   * Flushes pending mutations in FIFO order.
   *
   * @param syncHandler Async handler that executes the mutation. Returns true on success, false on failure.
   */
  public async flushQueue(
    syncHandler: (mutation: QueuedMutation) => Promise<boolean>,
  ): Promise<{ syncedCount: number; failedCount: number }> {
    if (this.isFlushing) {
      return { syncedCount: 0, failedCount: 0 };
    }

    this.isFlushing = true;
    let syncedCount = 0;
    let failedCount = 0;

    try {
      const pending = this.getPendingMutations();

      for (const mutation of pending) {
        mutation.status = 'SYNCING';
        this.saveToStorage();
        this.notifyListeners();

        try {
          const success = await syncHandler(mutation);

          if (success) {
            mutation.status = 'COMPLETED';
            delete mutation.error;
            syncedCount++;
          } else {
            mutation.retryCount += 1;
            if (mutation.retryCount >= mutation.maxRetries) {
              mutation.status = 'FAILED';
              mutation.error = `Sync failed after ${mutation.retryCount} attempts`;
            } else {
              mutation.status = 'PENDING';
              mutation.error = `Sync failed (attempt ${mutation.retryCount}/${mutation.maxRetries})`;
            }
            failedCount++;
          }
        } catch (err: any) {
          mutation.retryCount += 1;
          const errorMessage = err?.message || String(err);
          if (mutation.retryCount >= mutation.maxRetries) {
            mutation.status = 'FAILED';
            mutation.error = errorMessage;
          } else {
            mutation.status = 'PENDING';
            mutation.error = errorMessage;
          }
          failedCount++;
        }

        this.saveToStorage();
        this.notifyListeners();
      }

      if (syncedCount > 0) {
        this.lastSyncedAt = Date.now();
      }
    } finally {
      this.isFlushing = false;
      this.notifyListeners();
    }

    return { syncedCount, failedCount };
  }

  /**
   * Returns the timestamp when mutations were last successfully synced.
   */
  public getLastSyncedAt(): number | undefined {
    return this.lastSyncedAt;
  }

  /**
   * Removes a specific mutation from the queue by ID.
   */
  public removeMutation(id: string): boolean {
    const index = this.queue.findIndex((m) => m.id === id);
    if (index !== -1) {
      this.queue.splice(index, 1);
      this.saveToStorage();
      this.notifyListeners();
      return true;
    }
    return false;
  }

  /**
   * Clears all mutations from the queue and storage.
   */
  public clearQueue(): void {
    this.queue = [];
    if (this.storage) {
      try {
        this.storage.removeItem(this.storageKey);
      } catch {
        // Storage access error ignored safely
      }
    }
    this.notifyListeners();
  }

  /**
   * Resets all failed mutations back to PENDING and clears their retry count.
   */
  public retryFailedMutations(): number {
    let count = 0;
    for (const mutation of this.queue) {
      if (mutation.status === 'FAILED') {
        mutation.status = 'PENDING';
        mutation.retryCount = 0;
        delete mutation.error;
        count++;
      }
    }
    if (count > 0) {
      this.saveToStorage();
      this.notifyListeners();
    }
    return count;
  }
}

/**
 * Factory function to create a new OfflineMutationQueue instance.
 */
export function createOfflineMutationQueue(
  options?: OfflineMutationQueueOptions,
): OfflineMutationQueue {
  return new OfflineMutationQueue(options);
}

/**
 * Singleton instance of the offline mutation queue.
 */
export const offlineMutationQueue = new OfflineMutationQueue();

/**
 * Reads the current network quality state from navigator and connection APIs.
 */
export function getNetworkQualityState(): NetworkQualityState {
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  const status: NetworkStatus = isOnline ? 'online' : 'offline';

  let rttMs = isOnline ? 50 : 0;
  let downlinkMbps = isOnline ? 10 : 0;
  let isMetered = false;

  if (typeof navigator !== 'undefined' && 'connection' in navigator) {
    const conn = (navigator as any).connection;
    if (conn) {
      if (typeof conn.rtt === 'number') rttMs = conn.rtt;
      if (typeof conn.downlink === 'number') downlinkMbps = conn.downlink;
      if (typeof conn.saveData === 'boolean') isMetered = conn.saveData;
    }
  }

  const qualityTier = classifyQualityTier(status, rttMs);

  return {
    status,
    rttMs,
    downlinkMbps,
    qualityTier,
    isMetered,
    lastCheckedAt: new Date().toISOString(),
  };
}

/**
 * React hook to observe live network quality updates.
 */
export function useNetworkQuality(): NetworkQualityState {
  const [quality, setQuality] = useState<NetworkQualityState>(() => getNetworkQualityState());

  useEffect(() => {
    const update = () => {
      setQuality(getNetworkQualityState());
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('online', update);
      window.addEventListener('offline', update);

      if (typeof navigator !== 'undefined' && 'connection' in navigator) {
        const conn = (navigator as any).connection;
        if (conn && typeof conn.addEventListener === 'function') {
          conn.addEventListener('change', update);
        }
      }
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', update);
        window.removeEventListener('offline', update);

        if (typeof navigator !== 'undefined' && 'connection' in navigator) {
          const conn = (navigator as any).connection;
          if (conn && typeof conn.removeEventListener === 'function') {
            conn.removeEventListener('change', update);
          }
        }
      }
    };
  }, []);

  return quality;
}
