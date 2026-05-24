// ============================================================================
// Realtime - Presence Tracking
// ============================================================================

import type { QuantApp } from '@quant/common';
import type { EventHandler, RealtimeEvent, PresenceUpdateEvent } from './events';

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
}

const DEFAULT_PRESENCE_CONFIG: PresenceConfig = {
  heartbeatIntervalMs: 30000,
  awayTimeoutMs: 300000, // 5 minutes
  offlineTimeoutMs: 600000, // 10 minutes
  maxSubscriptionsPerUser: 500,
};

/**
 * Presence Manager
 *
 * Tracks user online status across the Quant Ecosystem.
 * Features:
 * - Real-time status updates (online, away, busy, invisible)
 * - Cross-app activity awareness
 * - Automatic away/offline detection via heartbeat
 * - Subscription-based presence updates
 * - Custom status messages
 */
export class PresenceManager {
  private config: PresenceConfig;
  private presenceState: Map<string, UserPresenceState> = new Map();
  private subscriptions: Map<string, Set<string>> = new Map(); // userId -> Set<subscribedToUserId>
  private reverseSubscriptions: Map<string, Set<string>> = new Map(); // userId -> Set<subscriberUserId>
  private handlers: Map<string, Set<EventHandler<PresenceUpdateEvent>>> = new Map();
  private heartbeatTimers: Map<string, ReturnType<typeof setInterval>> = new Map();

  constructor(config: Partial<PresenceConfig> = {}) {
    this.config = { ...DEFAULT_PRESENCE_CONFIG, ...config };
  }

  /**
   * Set user as online (called on connection)
   */
  setOnline(userId: string, app: QuantApp): void {
    const existing = this.presenceState.get(userId);
    const now = Date.now();

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
    this.startHeartbeat(userId);
    this.notifySubscribers(userId);
  }

  /**
   * Set user as offline (called on disconnect)
   */
  setOffline(userId: string): void {
    const existing = this.presenceState.get(userId);
    if (!existing) return;

    const devices = Math.max(0, existing.connectedDevices - 1);
    if (devices > 0) {
      existing.connectedDevices = devices;
      return;
    }

    existing.status = 'offline';
    existing.lastSeen = Date.now();
    existing.connectedDevices = 0;

    this.stopHeartbeat(userId);
    this.notifySubscribers(userId);
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

    this.notifySubscribers(userId);
  }

  /**
   * Record activity (heartbeat)
   */
  heartbeat(userId: string, app?: QuantApp): void {
    const state = this.presenceState.get(userId);
    if (!state) return;

    state.lastActivity = Date.now();
    state.lastSeen = Date.now();
    if (app) state.activeApp = app;

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
   * Subscribe to another user's presence changes
   */
  subscribe(subscriberId: string, targetUserId: string): () => void {
    // Track subscription
    if (!this.subscriptions.has(subscriberId)) {
      this.subscriptions.set(subscriberId, new Set());
    }
    const subs = this.subscriptions.get(subscriberId)!;

    // Check limit
    if (subs.size >= this.config.maxSubscriptionsPerUser) {
      throw new Error('Maximum presence subscriptions reached');
    }

    subs.add(targetUserId);

    // Track reverse subscription
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
   * Cleanup disconnected users (run periodically)
   */
  cleanup(): void {
    const now = Date.now();
    for (const [userId, state] of this.presenceState) {
      const inactiveTime = now - state.lastActivity;
      if (state.status === 'online' && inactiveTime > this.config.awayTimeoutMs) {
        state.status = 'away';
        this.notifySubscribers(userId);
      }
      if (state.status === 'away' && inactiveTime > this.config.offlineTimeoutMs) {
        state.status = 'offline';
        state.connectedDevices = 0;
        this.stopHeartbeat(userId);
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
        status: state.status,
        activeApp: state.activeApp,
        lastSeen: state.lastSeen,
      },
      senderId: userId,
      timestamp: Date.now(),
    };

    // Notify direct handlers
    const handlers = this.handlers.get(userId);
    if (handlers) {
      for (const handler of handlers) {
        handler(event);
      }
    }
  }

  /**
   * Start heartbeat monitoring for a user
   */
  private startHeartbeat(userId: string): void {
    this.stopHeartbeat(userId);
    const timer = setInterval(() => {
      this.cleanup();
    }, this.config.heartbeatIntervalMs);
    this.heartbeatTimers.set(userId, timer);
  }

  /**
   * Stop heartbeat monitoring for a user
   */
  private stopHeartbeat(userId: string): void {
    const timer = this.heartbeatTimers.get(userId);
    if (timer) {
      clearInterval(timer);
      this.heartbeatTimers.delete(userId);
    }
  }
}
