// Quantads - Offline Sync Service
// Mobile offline synchronization for advertising platform

export interface SyncOperation {
  id: string;
  type: string;
  entityId: string;
  entityType: string;
  payload: Record<string, unknown>;
  priority: SyncPriority;
  createdAt: number;
  retryCount: number;
  maxRetries: number;
  dependencies: string[];
  status: SyncOperationStatus;
}

export type SyncPriority = 'critical' | 'high' | 'normal' | 'low';
export type SyncOperationStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'conflict';

export interface ConflictRecord {
  id: string;
  operationId: string;
  localVersion: Record<string, unknown>;
  remoteVersion: Record<string, unknown>;
  detectedAt: number;
  resolvedAt?: number;
  resolution?: 'last_write_wins' | 'manual' | 'discard';
}

export interface SyncStatus {
  entityId: string;
  entityType: string;
  state: 'synced' | 'pending' | 'conflict' | 'error';
  lastSyncedAt: number;
  localVersion: number;
  remoteVersion: number;
}

export interface ConnectivityState {
  isOnline: boolean;
  connectionType: 'wifi' | 'cellular' | 'ethernet' | 'none';
  effectiveBandwidth: number;
  lastCheckedAt: number;
}

export interface DeltaSyncConfig {
  enabled: boolean;
  minChangeThreshold: number;
  compressionEnabled: boolean;
  batchSize: number;
}

export interface BackgroundSyncConfig {
  enabled: boolean;
  minIntervalMs: number;
  requiresCharging: boolean;
  requiresWifi: boolean;
  maxBatchSize: number;
}

export class OfflineSyncService {
  private queue: SyncOperation[] = [];
  private conflicts: Map<string, ConflictRecord> = new Map();
  private entityStatuses: Map<string, SyncStatus> = new Map();
  private connectivity: ConnectivityState = {
    isOnline: true,
    connectionType: 'wifi',
    effectiveBandwidth: 10000,
    lastCheckedAt: Date.now(),
  };
  private deltaSyncConfig: DeltaSyncConfig = {
    enabled: true,
    minChangeThreshold: 64,
    compressionEnabled: true,
    batchSize: 50,
  };
  private backgroundSyncConfig: BackgroundSyncConfig = {
    enabled: true,
    minIntervalMs: 300000,
    requiresCharging: false,
    requiresWifi: false,
    maxBatchSize: 100,
  };
  private connectivityListeners: Array<(state: ConnectivityState) => void> = [];
  private isSyncing: boolean = false;

  public addToQueue(
    operation: Omit<SyncOperation, 'id' | 'createdAt' | 'retryCount' | 'status'>,
  ): SyncOperation {
    const op: SyncOperation = {
      ...operation,
      id: `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: Date.now(),
      retryCount: 0,
      status: 'pending',
    };
    this.queue.push(op);
    this.queue.sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, normal: 2, low: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
    this.updateEntityStatus(op.entityId, op.entityType, 'pending');
    return op;
  }

  public async sync(): Promise<{ processed: number; failed: number; conflicts: number }> {
    if (!this.connectivity.isOnline || this.isSyncing) {
      return { processed: 0, failed: 0, conflicts: 0 };
    }
    this.isSyncing = true;
    let processed = 0;
    let failed = 0;
    let conflicts = 0;

    const pendingOps = this.queue.filter((op) => op.status === 'pending' || op.status === 'failed');
    for (const op of pendingOps) {
      if (!this.areDependenciesMet(op)) continue;
      op.status = 'in_progress';
      try {
        await this.executeOperation(op);
        op.status = 'completed';
        processed++;
        this.updateEntityStatus(op.entityId, op.entityType, 'synced');
      } catch (error) {
        if (this.isConflict(error)) {
          op.status = 'conflict';
          conflicts++;
          this.recordConflict(op);
        } else {
          op.retryCount++;
          op.status = op.retryCount >= op.maxRetries ? 'failed' : 'pending';
          failed++;
          this.updateEntityStatus(op.entityId, op.entityType, 'error');
        }
      }
    }
    this.queue = this.queue.filter((op) => op.status !== 'completed');
    this.isSyncing = false;
    return { processed, failed, conflicts };
  }

  private areDependenciesMet(op: SyncOperation): boolean {
    return op.dependencies.every((depId) => {
      const dep = this.queue.find((q) => q.id === depId);
      return !dep || dep.status === 'completed';
    });
  }

  private async executeOperation(_op: SyncOperation): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  private isConflict(error: unknown): boolean {
    return error instanceof Error && error.message.includes('conflict');
  }

  private recordConflict(op: SyncOperation): void {
    const conflict: ConflictRecord = {
      id: `conflict_${Date.now()}`,
      operationId: op.id,
      localVersion: op.payload,
      remoteVersion: {},
      detectedAt: Date.now(),
    };
    this.conflicts.set(conflict.id, conflict);
    this.updateEntityStatus(op.entityId, op.entityType, 'conflict');
  }

  public resolveConflict(
    conflictId: string,
    resolution: 'last_write_wins' | 'manual' | 'discard',
  ): boolean {
    const conflict = this.conflicts.get(conflictId);
    if (!conflict) return false;
    conflict.resolvedAt = Date.now();
    conflict.resolution = resolution;
    const op = this.queue.find((o) => o.id === conflict.operationId);
    if (op) {
      if (resolution === 'discard') {
        op.status = 'completed';
      } else {
        op.status = 'pending';
        op.retryCount = 0;
      }
    }
    return true;
  }

  public detectConnectivity(): ConnectivityState {
    this.connectivity.lastCheckedAt = Date.now();
    return { ...this.connectivity };
  }

  public setConnectivity(state: Partial<ConnectivityState>): void {
    const wasOffline = !this.connectivity.isOnline;
    this.connectivity = { ...this.connectivity, ...state };
    if (wasOffline && this.connectivity.isOnline) {
      this.triggerBackgroundSync();
    }
    this.connectivityListeners.forEach((cb) => cb(this.connectivity));
  }

  public onConnectivityChange(callback: (state: ConnectivityState) => void): () => void {
    this.connectivityListeners.push(callback);
    return () => {
      const idx = this.connectivityListeners.indexOf(callback);
      if (idx > -1) this.connectivityListeners.splice(idx, 1);
    };
  }

  public computeDelta(
    original: Record<string, unknown>,
    modified: Record<string, unknown>,
  ): Record<string, unknown> {
    const delta: Record<string, unknown> = {};
    for (const key of Object.keys(modified)) {
      if (JSON.stringify(original[key]) !== JSON.stringify(modified[key])) {
        delta[key] = modified[key];
      }
    }
    return delta;
  }

  public getSyncStatus(entityId: string): SyncStatus | undefined {
    return this.entityStatuses.get(entityId);
  }

  public getAllSyncStatuses(): SyncStatus[] {
    return Array.from(this.entityStatuses.values());
  }

  private updateEntityStatus(
    entityId: string,
    entityType: string,
    state: SyncStatus['state'],
  ): void {
    const existing = this.entityStatuses.get(entityId);
    this.entityStatuses.set(entityId, {
      entityId,
      entityType,
      state,
      lastSyncedAt: state === 'synced' ? Date.now() : existing?.lastSyncedAt || 0,
      localVersion: (existing?.localVersion || 0) + 1,
      remoteVersion: existing?.remoteVersion || 0,
    });
  }

  private async triggerBackgroundSync(): Promise<void> {
    if (this.backgroundSyncConfig.enabled) {
      await this.sync();
    }
  }

  public getQueueSize(): number {
    return this.queue.filter((op) => op.status === 'pending').length;
  }

  public getConflicts(): ConflictRecord[] {
    return Array.from(this.conflicts.values()).filter((c) => !c.resolvedAt);
  }

  public clearQueue(): void {
    this.queue = [];
  }

  public configureBackgroundSync(config: Partial<BackgroundSyncConfig>): void {
    this.backgroundSyncConfig = { ...this.backgroundSyncConfig, ...config };
  }

  public configureDeltaSync(config: Partial<DeltaSyncConfig>): void {
    this.deltaSyncConfig = { ...this.deltaSyncConfig, ...config };
  }
}
