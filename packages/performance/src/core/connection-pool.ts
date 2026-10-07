// ============================================================================
// Performance Package - Connection Pool
// Min/max connections, health checking, recycling, wait queue, graceful drain
// ============================================================================

import type { ConnectionPoolConfig, PooledConnection, WaitQueueEntry, ConnectionState } from '../types';

/** Pool statistics */
interface PoolStats {
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  waitQueueSize: number;
  totalAcquires: number;
  totalReleases: number;
  totalTimeouts: number;
  averageWaitMs: number;
  healthChecksPassed: number;
  healthChecksFailed: number;
}

/**
 * ConnectionPool manages a pool of reusable connections with configurable
 * min/max size, health checking, connection recycling, FIFO wait queue,
 * and graceful drain support.
 */
export class ConnectionPool {
  private readonly config: ConnectionPoolConfig;
  private readonly connections: Map<string, PooledConnection>;
  private readonly idleConnections: string[];
  private readonly activeConnections: Set<string>;
  private readonly waitQueue: WaitQueueEntry[];
  private readonly stats: PoolStats;
  private connectionCounter: number;
  private draining: boolean;
  private healthCheckTimer: ReturnType<typeof setInterval> | null;

  constructor(config: Partial<ConnectionPoolConfig> = {}) {
    this.config = {
      minConnections: config.minConnections ?? 2,
      maxConnections: config.maxConnections ?? 20,
      acquireTimeoutMs: config.acquireTimeoutMs ?? 5000,
      idleTimeoutMs: config.idleTimeoutMs ?? 30000,
      maxAge: config.maxAge ?? 300000,
      maxUses: config.maxUses ?? 1000,
      healthCheckIntervalMs: config.healthCheckIntervalMs ?? 15000,
      enableAffinity: config.enableAffinity ?? false,
    };

    this.connections = new Map();
    this.idleConnections = [];
    this.activeConnections = new Set();
    this.waitQueue = [];
    this.connectionCounter = 0;
    this.draining = false;
    this.healthCheckTimer = null;

    this.stats = {
      totalConnections: 0,
      activeConnections: 0,
      idleConnections: 0,
      waitQueueSize: 0,
      totalAcquires: 0,
      totalReleases: 0,
      totalTimeouts: 0,
      averageWaitMs: 0,
      healthChecksPassed: 0,
      healthChecksFailed: 0,
    };
  }

  /**
   * Initialize the pool with minimum connections.
   */
  async initialize(): Promise<void> {
    for (let i = 0; i < this.config.minConnections; i++) {
      const conn = this.createConnection();
      this.connections.set(conn.id, conn);
      this.idleConnections.push(conn.id);
    }
    this.updateStats();
    this.startHealthChecks();
  }

  /**
   * Acquire a connection from the pool.
   * If none available and under max, creates a new one.
   * If at max, waits in FIFO queue with timeout.
   */
  async acquire(affinityKey?: string): Promise<PooledConnection> {
    if (this.draining) {
      throw new Error('Connection pool is draining');
    }

    this.stats.totalAcquires++;

    // Try affinity-based connection first
    if (this.config.enableAffinity && affinityKey) {
      const affinityConn = this.findAffinityConnection(affinityKey);
      if (affinityConn) {
        return this.activateConnection(affinityConn, affinityKey);
      }
    }

    // Try to get an idle connection
    const idleConn = this.getIdleConnection();
    if (idleConn) {
      return this.activateConnection(idleConn, affinityKey);
    }

    // Try to create a new connection if under max
    if (this.connections.size < this.config.maxConnections) {
      const newConn = this.createConnection();
      this.connections.set(newConn.id, newConn);
      return this.activateConnection(newConn, affinityKey);
    }

    // Wait in queue for a connection to become available
    return this.waitForConnection(affinityKey);
  }

  /**
   * Release a connection back to the pool.
   * If connection is expired or overused, destroy and replace it.
   */
  async release(connectionId: string): Promise<void> {
    const conn = this.connections.get(connectionId);
    if (!conn) return;

    this.stats.totalReleases++;
    this.activeConnections.delete(connectionId);

    // Check if connection should be recycled
    if (this.shouldRecycle(conn)) {
      this.destroyConnection(connectionId);
      // Replace with new connection if below minimum
      if (this.connections.size < this.config.minConnections && !this.draining) {
        const newConn = this.createConnection();
        this.connections.set(newConn.id, newConn);
        this.idleConnections.push(newConn.id);
      }
    } else {
      // Return to idle pool
      conn.state = 'IDLE';
      conn.lastUsedAt = Date.now();
      this.idleConnections.push(connectionId);
    }

    // Fulfill waiting requests (FIFO)
    this.processWaitQueue();
    this.updateStats();
  }

  /**
   * Destroy a specific connection.
   */
  async destroy(connectionId: string): Promise<void> {
    this.destroyConnection(connectionId);
    this.updateStats();
  }

  /**
   * Gracefully drain the pool - stop accepting new connections
   * and wait for active connections to be released.
   */
  async drain(timeoutMs: number = 30000): Promise<void> {
    this.draining = true;
    this.stopHealthChecks();

    // Reject all waiting requests
    for (const entry of this.waitQueue) {
      clearTimeout(entry.timeoutId);
      entry.reject(new Error('Pool is draining'));
    }
    this.waitQueue.length = 0;

    // Wait for active connections to be released
    const startTime = Date.now();
    while (this.activeConnections.size > 0) {
      if (Date.now() - startTime > timeoutMs) {
        // Force close remaining connections
        for (const connId of this.activeConnections) {
          this.destroyConnection(connId);
        }
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Destroy all idle connections
    for (const connId of this.idleConnections) {
      this.destroyConnection(connId);
    }
    this.idleConnections.length = 0;
    this.updateStats();
  }

  /**
   * Get pool statistics.
   */
  getStats(): PoolStats {
    this.updateStats();
    return { ...this.stats };
  }

  /**
   * Get the current pool size.
   */
  getSize(): number {
    return this.connections.size;
  }

  /**
   * Get the number of available (idle) connections.
   */
  getAvailable(): number {
    return this.idleConnections.length;
  }

  /**
   * Check if the pool is draining.
   */
  isDraining(): boolean {
    return this.draining;
  }

  /**
   * Perform health check on all idle connections.
   */
  async healthCheck(): Promise<{ passed: number; failed: number }> {
    let passed = 0;
    let failed = 0;

    const toCheck = [...this.idleConnections];
    for (const connId of toCheck) {
      const conn = this.connections.get(connId);
      if (!conn) continue;

      conn.state = 'HEALTH_CHECK';
      const healthy = this.performHealthCheck(conn);

      if (healthy) {
        conn.state = 'IDLE';
        conn.healthScore = Math.min(100, conn.healthScore + 5);
        passed++;
        this.stats.healthChecksPassed++;
      } else {
        // Remove unhealthy connection
        const idx = this.idleConnections.indexOf(connId);
        if (idx >= 0) this.idleConnections.splice(idx, 1);
        this.destroyConnection(connId);
        failed++;
        this.stats.healthChecksFailed++;

        // Replace if below minimum
        if (this.connections.size < this.config.minConnections && !this.draining) {
          const newConn = this.createConnection();
          this.connections.set(newConn.id, newConn);
          this.idleConnections.push(newConn.id);
        }
      }
    }

    return { passed, failed };
  }

  // ===========================================================================
  // Private methods
  // ===========================================================================

  /** Create a new pooled connection */
  private createConnection(): PooledConnection {
    const id = `conn-${++this.connectionCounter}-${Date.now().toString(36)}`;
    return {
      id,
      state: 'IDLE',
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
      useCount: 0,
      healthScore: 100,
    };
  }

  /** Activate a connection (move from idle to active) */
  private activateConnection(conn: PooledConnection, affinityKey?: string): PooledConnection {
    const idx = this.idleConnections.indexOf(conn.id);
    if (idx >= 0) this.idleConnections.splice(idx, 1);

    conn.state = 'ACTIVE';
    conn.lastUsedAt = Date.now();
    conn.useCount++;
    if (affinityKey) conn.affinityKey = affinityKey;

    this.activeConnections.add(conn.id);
    this.updateStats();
    return conn;
  }

  /** Get an idle connection from the pool */
  private getIdleConnection(): PooledConnection | null {
    while (this.idleConnections.length > 0) {
      const connId = this.idleConnections.shift()!;
      const conn = this.connections.get(connId);
      if (!conn) continue;

      // Skip if the idle connection is too old
      if (this.shouldRecycle(conn)) {
        this.destroyConnection(connId);
        continue;
      }

      return conn;
    }
    return null;
  }

  /** Find a connection with matching affinity key */
  private findAffinityConnection(affinityKey: string): PooledConnection | null {
    for (const connId of this.idleConnections) {
      const conn = this.connections.get(connId);
      if (conn && conn.affinityKey === affinityKey) {
        return conn;
      }
    }
    return null;
  }

  /** Wait in queue for a connection to become available */
  private waitForConnection(affinityKey?: string): Promise<PooledConnection> {
    return new Promise<PooledConnection>((resolve, reject) => {
      const entry: WaitQueueEntry = {
        id: `wait-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        resolve,
        reject,
        enqueuedAt: Date.now(),
        timeoutId: setTimeout(() => {
          const idx = this.waitQueue.findIndex((e) => e.id === entry.id);
          if (idx >= 0) this.waitQueue.splice(idx, 1);
          this.stats.totalTimeouts++;
          reject(new Error(`Connection acquire timeout after ${this.config.acquireTimeoutMs}ms`));
        }, this.config.acquireTimeoutMs),
        affinityKey,
      };

      this.waitQueue.push(entry);
      this.updateStats();
    });
  }

  /** Process the wait queue when a connection becomes available */
  private processWaitQueue(): void {
    while (this.waitQueue.length > 0 && this.idleConnections.length > 0) {
      const entry = this.waitQueue.shift()!;
      clearTimeout(entry.timeoutId);

      const conn = this.getIdleConnection();
      if (conn) {
        const activated = this.activateConnection(conn, entry.affinityKey);
        entry.resolve(activated);
      } else {
        // Put back in queue
        this.waitQueue.unshift(entry);
        break;
      }
    }
  }

  /** Check if a connection should be recycled */
  private shouldRecycle(conn: PooledConnection): boolean {
    const now = Date.now();
    if (now - conn.createdAt > this.config.maxAge) return true;
    if (conn.useCount >= this.config.maxUses) return true;
    if (conn.healthScore <= 0) return true;
    if (conn.state === 'IDLE' && now - conn.lastUsedAt > this.config.idleTimeoutMs) return true;
    return false;
  }

  /** Destroy a connection and remove from tracking */
  private destroyConnection(connectionId: string): void {
    this.connections.delete(connectionId);
    this.activeConnections.delete(connectionId);
    const idx = this.idleConnections.indexOf(connectionId);
    if (idx >= 0) this.idleConnections.splice(idx, 1);
  }

  /** Perform health check on a connection */
  private performHealthCheck(conn: PooledConnection): boolean {
    // Simulate health check - connection is healthy if not too old and has good score
    const age = Date.now() - conn.createdAt;
    if (age > this.config.maxAge) return false;
    if (conn.healthScore < 20) return false;
    return true;
  }

  /** Start periodic health checks */
  private startHealthChecks(): void {
    this.healthCheckTimer = setInterval(() => {
      this.healthCheck();
    }, this.config.healthCheckIntervalMs);
  }

  /** Stop periodic health checks */
  private stopHealthChecks(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  /** Update pool statistics */
  private updateStats(): void {
    this.stats.totalConnections = this.connections.size;
    this.stats.activeConnections = this.activeConnections.size;
    this.stats.idleConnections = this.idleConnections.length;
    this.stats.waitQueueSize = this.waitQueue.length;
  }
}
