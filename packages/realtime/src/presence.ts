// ============================================================================
// Realtime - Presence Tracking with Redis ZSET
// ============================================================================

import type Redis from 'ioredis';
import type { QuantApp } from '@quant/common';
import type { EventHandler, RealtimeEvent, PresenceUpdateEvent } from './events';
import type { PresenceEntry } from './types';

/** Presence status */
export type PresenceStatus = 'online' | 'away' | 'busy' | 'offline' | 'invisible';

/** User presence state */
export interface UserPresenceState {
  userId: string;
  status: PresenceStatus;
  activeApp?: QuantApp;
  customStatus?: string;
  lastSeen: number;
  lastActivity: number;
  connectedDevices: number;
}

/** Presence configuration */
export interface PresenceConfig {
  heartbeatIntervalMs: number;
  awayTimeoutMs: number;
  offlineTimeoutMs: number;
  maxSubscriptionsPerUser: number;
  /**
   * Window (ms) within which a user's last-seen timestamp must fall for them to
   * count as "online anywhere" for delivery decisions (Requirement 5.2).
   */
  freshnessWindowMs: number;
  redis?: Redis;
  keyPrefix?: string;
  /**
   * Invoked when a Redis presence read fails (Requirement 5.4). The caller can
   * use this to surface the degraded state; the manager itself reports the user
   * offline so delivery falls back to push.
   */
  onReadFailure?: (userId: string, error: unknown) => void;
}

/** Presence freshness window for delivery decisions (Requirement 5.2): 30 seconds. */
const PRESENCE_FRESHNESS_WINDOW_MS = 30000;

const DEFAULT_PRESENCE_CONFIG: PresenceConfig = {
  heartbeatIntervalMs: 30000,
  awayTimeoutMs: 300000, // 5 minutes
  offlineTimeoutMs: 600000, // 10 minutes
  maxSubscriptionsPerUser: 500,
  freshnessWindowMs: PRESENCE_FRESHNESS_WINDOW_MS,
};

/**
 * Presence Manager
 *
 * Tracks user online status using Redis ZSET for distributed presence.
 * The sorted set uses timestamp as the score for efficient range queries
 * and TTL-based cleanup.
 *
 * Falls back to in-memory Map when Redis is not configured.
 *
 * Redis keys:
 * - `presence:active` (ZSET): userId -> score (timestamp)
 * - `presence:meta:{userId}` (HASH): status, app, customStatus, devices
 */
export class PresenceManager {
  private config: PresenceConfig;
  private presenceState: Map<string, UserPresenceState> = new Map();
  private subscriptions: Map<string, Set<string>> = new Map();
  private reverseSubscriptions: Map<string, Set<string>> = new Map();
  private handlers: Map<string, Set<EventHandler<PresenceUpdateEvent>>> = new Map();
  private redis: Redis | null;
  private keyPrefix: string;
  /** Count of Redis presence read failures recorded (Requirement 5.4). */
  private readFailures = 0;

  constructor(config: Partial<PresenceConfig> = {}) {
    this.config = { ...DEFAULT_PRESENCE_CONFIG, ...config };
    this.redis = config.redis || null;
    this.keyPrefix = config.keyPrefix || 'presence:';
  }

  /**
   * Set user as online (called on connection).
   * Uses Redis ZADD with current timestamp as score.
   *
   * @returns `true` when this connection transitions the user from offline to
   *   online (first live device), so the caller can publish a `presence:update`
   *   transition over the backplane (Requirement 5.3).
   */
  setOnline(userId: string, app: QuantApp): boolean {
    const existing = this.presenceState.get(userId);
    const now = Date.now();
    const wasOffline = !existing || existing.connectedDevices <= 0 || existing.status === 'offline';

    const state: UserPresenceState = {
      userId,
      status: existing?.status === 'invisible' ? 'invisible' : 'online',
      activeApp: app,
      customStatus: existing?.customStatus,
      lastSeen: now,
      lastActivity: now,
      connectedDevices: (existing?.connectedDevices || 0) + 1,
    };

    this.presenceState.set(userId, state);

    // Redis ZSET: ZADD presence:active timestamp userId
    if (this.redis) {
      this.redis.zadd(`${this.keyPrefix}active`, now.toString(), userId).catch(() => {});
      this.redis
        .hmset(`${this.keyPrefix}meta:${userId}`, {
          status: state.status,
          app,
          lastSeen: now.toString(),
          devices: state.connectedDevices.toString(),
        })
        .catch(() => {});
    }

    this.notifySubscribers(userId);
    return wasOffline;
  }

  /**
   * Set user as offline (called on disconnect).
   * Uses Redis ZREM to remove from active set.
   *
   * @returns `true` when the last live device disconnects and the user
   *   transitions online -> offline, so the caller can publish a
   *   `presence:update` transition over the backplane (Requirement 5.3).
   */
  setOffline(userId: string): boolean {
    const existing = this.presenceState.get(userId);
    if (!existing) return false;

    const devices = Math.max(0, existing.connectedDevices - 1);
    if (devices > 0) {
      existing.connectedDevices = devices;
      if (this.redis) {
        this.redis
          .hset(`${this.keyPrefix}meta:${userId}`, 'devices', devices.toString())
          .catch(() => {});
      }
      return false;
    }

    existing.status = 'offline';
    existing.lastSeen = Date.now();
    existing.connectedDevices = 0;

    // Redis: remove from active ZSET
    if (this.redis) {
      this.redis.zrem(`${this.keyPrefix}active`, userId).catch(() => {});
      this.redis
        .hmset(`${this.keyPrefix}meta:${userId}`, {
          status: 'offline',
          lastSeen: existing.lastSeen.toString(),
          devices: '0',
        })
        .catch(() => {});
    }

    this.notifySubscribers(userId);
    return true;
  }

  /**
   * Update presence status
   */
  setStatus(userId: string, status: PresenceStatus, customStatus?: string): void {
    const state = this.presenceState.get(userId);
    if (!state) return;

    state.status = status;
    if (customStatus !== undefined) state.customStatus = customStatus;
    state.lastActivity = Date.now();

    if (this.redis) {
      this.redis.hset(`${this.keyPrefix}meta:${userId}`, 'status', status).catch(() => {});
    }

    this.notifySubscribers(userId);
  }

  /**
   * Record activity (heartbeat).
   * Updates Redis ZADD score to current timestamp.
   */
  heartbeat(userId: string, app?: QuantApp): void {
    const state = this.presenceState.get(userId);
    if (!state) return;

    const now = Date.now();
    state.lastActivity = now;
    state.lastSeen = now;
    if (app) state.activeApp = app;

    // Update ZSET score with current timestamp
    if (this.redis) {
      this.redis.zadd(`${this.keyPrefix}active`, now.toString(), userId).catch(() => {});
    }

    // Reset away status on activity
    if (state.status === 'away') {
      state.status = 'online';
      this.notifySubscribers(userId);
    }
  }

  /**
   * Get presence for a user
   */
  getPresence(userId: string): UserPresenceState | null {
    return this.presenceState.get(userId) || null;
  }

  /**
   * Get presence for multiple users
   */
  getBulkPresence(userIds: string[]): Map<string, UserPresenceState> {
    const result = new Map<string, UserPresenceState>();
    for (const userId of userIds) {
      const state = this.presenceState.get(userId);
      if (state) result.set(userId, state);
    }
    return result;
  }

  /**
   * Get online users since a timestamp.
   * Uses Redis ZRANGEBYSCORE for efficient range queries.
   */
  async getOnline(since?: number): Promise<PresenceEntry[]> {
    const threshold = since || Date.now() - this.config.offlineTimeoutMs;

    if (this.redis) {
      try {
        const userIds = await this.redis.zrangebyscore(
          `${this.keyPrefix}active`,
          threshold.toString(),
          '+inf',
        );
        const entries: PresenceEntry[] = [];
        for (const userId of userIds) {
          const meta = await this.redis.hgetall(`${this.keyPrefix}meta:${userId}`);
          entries.push({
            userId,
            status: meta.status || 'online',
            app: (meta.app as QuantApp) || 'quantchat',
            lastSeen: parseInt(meta.lastSeen || '0', 10),
            metadata: {},
          });
        }
        return entries;
      } catch {
        // Fall through to in-memory
      }
    }

    // In-memory fallback
    const entries: PresenceEntry[] = [];
    for (const state of this.presenceState.values()) {
      if (state.lastSeen >= threshold && state.status !== 'offline') {
        entries.push({
          userId: state.userId,
          status: state.status,
          app: state.activeApp || 'quantchat',
          lastSeen: state.lastSeen,
        });
      }
    }
    return entries;
  }

  /**
   * Report whether a recipient is online on ANY instance for a delivery
   * decision (Requirement 5.2). The recipient is online if and only if they
   * have at least one live socket whose last-seen timestamp falls within the
   * presence freshness window (30s by default).
   *
   * Backed by the shared Redis ZSET when configured: ZSCORE returns the user's
   * last-seen timestamp (the ZADD score), which is compared against the
   * freshness threshold. When Redis is absent, the in-memory state is used.
   *
   * On a Redis read failure (Requirement 5.4) the recipient is reported OFFLINE
   * and the failure is recorded so the delivery path falls back to push.
   */
  async isOnlineAnywhere(userId: string): Promise<boolean> {
    const threshold = Date.now() - this.config.freshnessWindowMs;

    if (this.redis) {
      try {
        const score = await this.redis.zscore(`${this.keyPrefix}active`, userId);
        if (score === null || score === undefined) return false;
        const lastSeen = Number.parseInt(score, 10);
        return Number.isFinite(lastSeen) && lastSeen >= threshold;
      } catch (error) {
        // Requirement 5.4: report offline + record so delivery falls back to push.
        this.recordReadFailure(userId, error);
        return false;
      }
    }

    // In-memory fallback (single-node / no Redis configured).
    const state = this.presenceState.get(userId);
    if (!state) return false;
    return state.status !== 'offline' && state.lastSeen >= threshold;
  }

  /** Number of Redis presence read failures recorded (Requirement 5.4). */
  getReadFailureCount(): number {
    return this.readFailures;
  }

  /** Record a Redis presence read failure and notify the optional callback. */
  private recordReadFailure(userId: string, error: unknown): void {
    this.readFailures += 1;
    this.config.onReadFailure?.(userId, error);
  }

  /**
   * Subscribe to another user's presence changes
   */
  subscribe(subscriberId: string, targetUserId: string): () => void {
    if (!this.subscriptions.has(subscriberId)) {
      this.subscriptions.set(subscriberId, new Set());
    }
    const subs = this.subscriptions.get(subscriberId)!;

    if (subs.size >= this.config.maxSubscriptionsPerUser) {
      throw new Error('Maximum presence subscriptions reached');
    }

    subs.add(targetUserId);

    if (!this.reverseSubscriptions.has(targetUserId)) {
      this.reverseSubscriptions.set(targetUserId, new Set());
    }
    this.reverseSubscriptions.get(targetUserId)!.add(subscriberId);

    return () => this.unsubscribe(subscriberId, targetUserId);
  }

  /**
   * Unsubscribe from a user's presence
   */
  unsubscribe(subscriberId: string, targetUserId: string): void {
    this.subscriptions.get(subscriberId)?.delete(targetUserId);
    this.reverseSubscriptions.get(targetUserId)?.delete(subscriberId);
  }

  /**
   * Register a handler for presence updates for a specific user
   */
  onPresenceChange(userId: string, handler: EventHandler<PresenceUpdateEvent>): () => void {
    if (!this.handlers.has(userId)) {
      this.handlers.set(userId, new Set());
    }
    this.handlers.get(userId)!.add(handler);
    return () => this.handlers.get(userId)?.delete(handler);
  }

  /**
   * Get online users count
   */
  getOnlineCount(): number {
    let count = 0;
    for (const state of this.presenceState.values()) {
      if (state.status === 'online' || state.status === 'away' || state.status === 'busy') {
        count++;
      }
    }
    return count;
  }

  /**
   * Get users online in a specific app
   */
  getOnlineInApp(app: QuantApp): string[] {
    const users: string[] = [];
    for (const state of this.presenceState.values()) {
      if (state.activeApp === app && state.status !== 'offline') {
        users.push(state.userId);
      }
    }
    return users;
  }

  /**
   * Cleanup stale entries.
   * Uses ZREMRANGEBYSCORE to remove entries older than timeout.
   */
  cleanup(): void {
    const now = Date.now();

    // Remove stale from Redis ZSET
    if (this.redis) {
      const threshold = now - this.config.offlineTimeoutMs;
      this.redis
        .zremrangebyscore(`${this.keyPrefix}active`, '-inf', threshold.toString())
        .catch(() => {});
    }

    // In-memory cleanup
    for (const [userId, state] of this.presenceState) {
      const inactiveTime = now - state.lastActivity;
      if (state.status === 'online' && inactiveTime > this.config.awayTimeoutMs) {
        state.status = 'away';
        this.notifySubscribers(userId);
      }
      if (state.status === 'away' && inactiveTime > this.config.offlineTimeoutMs) {
        state.status = 'offline';
        state.connectedDevices = 0;
        this.notifySubscribers(userId);
      }
    }
  }

  /**
   * Notify subscribers of a presence change
   */
  private notifySubscribers(userId: string): void {
    const state = this.presenceState.get(userId);
    if (!state) return;

    const event: RealtimeEvent<PresenceUpdateEvent> = {
      id: `pres_${Date.now().toString(36)}`,
      type: 'presence:update',
      channel: `presence:${userId}`,
      payload: {
        userId: state.userId,
        status: state.status === 'invisible' ? 'offline' : state.status,
        activeApp: state.activeApp,
        lastSeen: state.lastSeen,
      },
      senderId: userId,
      timestamp: Date.now(),
    };

    // Publish via Redis pub/sub for cross-instance
    if (this.redis) {
      this.redis.publish(`${this.keyPrefix}changes`, JSON.stringify(event)).catch(() => {});
    }

    // Notify direct handlers
    const handlers = this.handlers.get(userId);
    if (handlers) {
      for (const handler of handlers) {
        handler(event);
      }
    }
  }
}
