// ============================================================================
// Realtime - Channel/Room Management with Redis Pub/Sub
// ============================================================================

import type Redis from 'ioredis';
import type { EventHandler, RealtimeEvent } from './events';

/** Channel configuration */
export interface ChannelConfig {
  name: string;
  type: 'public' | 'private' | 'presence';
  maxMembers?: number;
  persistent?: boolean;
  history?: boolean;
  historyLimit?: number;
}

/** Channel member info */
export interface ChannelMember {
  userId: string;
  joinedAt: number;
  metadata?: Record<string, unknown>;
}

/** Channel state */
export interface ChannelState {
  name: string;
  type: string;
  members: Map<string, ChannelMember>;
  messageHistory: RealtimeEvent[];
  createdAt: number;
  metadata: Record<string, unknown>;
}

/** Redis channel manager configuration */
export interface ChannelManagerConfig {
  redis?: Redis;
  redisSub?: Redis;
  keyPrefix?: string;
}

/**
 * Channel Manager
 *
 * Manages real-time channels/rooms with optional Redis pub/sub for
 * cross-instance fan-out. Falls back to in-memory-only when Redis
 * is not configured.
 *
 * Features:
 * - Channel creation and lifecycle management
 * - Member join/leave tracking
 * - Message broadcasting with history
 * - Redis pub/sub for multi-instance deployments
 * - Redis SET for distributed member tracking
 */
export class ChannelManager {
  private channels: Map<string, ChannelState> = new Map();
  private userChannels: Map<string, Set<string>> = new Map();
  private channelHandlers: Map<string, Set<EventHandler>> = new Map();
  private redis: Redis | null;
  private redisSub: Redis | null;
  private keyPrefix: string;
  private redisSubscribed: Set<string> = new Set();

  constructor(config: ChannelManagerConfig = {}) {
    this.redis = config.redis || null;
    this.redisSub = config.redisSub || null;
    this.keyPrefix = config.keyPrefix || 'realtime:channel:';
  }

  /**
   * Create a new channel
   */
  createChannel(config: ChannelConfig): ChannelState {
    if (this.channels.has(config.name)) {
      return this.channels.get(config.name)!;
    }

    const state: ChannelState = {
      name: config.name,
      type: config.type,
      members: new Map(),
      messageHistory: [],
      createdAt: Date.now(),
      metadata: { maxMembers: config.maxMembers, persistent: config.persistent },
    };

    this.channels.set(config.name, state);
    return state;
  }

  /**
   * Join a channel
   */
  join(channelName: string, userId: string, metadata?: Record<string, unknown>): boolean {
    const channel = this.channels.get(channelName);
    if (!channel) return false;

    // Check max members
    const maxMembers = channel.metadata.maxMembers as number | undefined;
    if (maxMembers && channel.members.size >= maxMembers) {
      return false;
    }

    // Add member
    channel.members.set(userId, {
      userId,
      joinedAt: Date.now(),
      metadata,
    });

    // Track user's channels
    if (!this.userChannels.has(userId)) {
      this.userChannels.set(userId, new Set());
    }
    this.userChannels.get(userId)!.add(channelName);

    // Subscribe to Redis pub/sub for this channel
    this.subscribeRedis(channelName);

    // Add member to Redis SET (distributed state)
    if (this.redis) {
      this.redis.sadd(`${this.keyPrefix}${channelName}:members`, userId).catch(() => {});
    }

    // Notify channel members
    this.broadcastToChannel(channelName, {
      id: `evt_${Date.now().toString(36)}`,
      type: 'member:join',
      channel: channelName,
      payload: { userId, metadata },
      senderId: userId,
      timestamp: Date.now(),
    });

    return true;
  }

  /**
   * Leave a channel
   */
  leave(channelName: string, userId: string): boolean {
    const channel = this.channels.get(channelName);
    if (!channel) return false;

    channel.members.delete(userId);
    this.userChannels.get(userId)?.delete(channelName);

    // Remove member from Redis SET
    if (this.redis) {
      this.redis.srem(`${this.keyPrefix}${channelName}:members`, userId).catch(() => {});
    }

    // Notify channel members
    this.broadcastToChannel(channelName, {
      id: `evt_${Date.now().toString(36)}`,
      type: 'member:leave',
      channel: channelName,
      payload: { userId },
      senderId: userId,
      timestamp: Date.now(),
    });

    // Cleanup empty non-persistent channels
    if (channel.members.size === 0 && !channel.metadata.persistent) {
      this.destroyChannel(channelName);
    }

    return true;
  }

  /**
   * Leave all channels (on disconnect)
   */
  leaveAll(userId: string): void {
    const channels = this.userChannels.get(userId);
    if (!channels) return;

    for (const channelName of channels) {
      const channel = this.channels.get(channelName);
      if (channel) {
        channel.members.delete(userId);

        if (this.redis) {
          this.redis.srem(`${this.keyPrefix}${channelName}:members`, userId).catch(() => {});
        }

        this.broadcastToChannel(channelName, {
          id: `evt_${Date.now().toString(36)}`,
          type: 'member:leave',
          channel: channelName,
          payload: { userId },
          senderId: userId,
          timestamp: Date.now(),
        });
        if (channel.members.size === 0 && !channel.metadata.persistent) {
          this.destroyChannel(channelName);
        }
      }
    }

    this.userChannels.delete(userId);
  }

  /**
   * Broadcast a message to all members of a channel.
   * Also publishes to Redis pub/sub for cross-instance delivery.
   */
  broadcastToChannel(channelName: string, event: RealtimeEvent): void {
    const channel = this.channels.get(channelName);
    if (!channel) return;

    // Store in history if enabled
    if (channel.metadata.history !== false) {
      channel.messageHistory.push(event);
      const limit = (channel.metadata.historyLimit as number) || 100;
      if (channel.messageHistory.length > limit) {
        channel.messageHistory.shift();
      }
    }

    // Publish to Redis for cross-instance fan-out
    if (this.redis) {
      this.redis.publish(`${this.keyPrefix}${channelName}`, JSON.stringify(event)).catch(() => {});
    }

    // Notify local handlers
    const handlers = this.channelHandlers.get(channelName);
    if (handlers) {
      for (const handler of handlers) {
        handler(event);
      }
    }
  }

  /**
   * Subscribe to channel events (local handler)
   */
  subscribe(channelName: string, handler: EventHandler): () => void {
    if (!this.channelHandlers.has(channelName)) {
      this.channelHandlers.set(channelName, new Set());
    }
    this.channelHandlers.get(channelName)!.add(handler);
    return () => this.channelHandlers.get(channelName)?.delete(handler);
  }

  /**
   * Get channel members
   */
  getMembers(channelName: string): ChannelMember[] {
    const channel = this.channels.get(channelName);
    if (!channel) return [];
    return Array.from(channel.members.values());
  }

  /**
   * Get channel message history
   */
  getHistory(channelName: string, limit: number = 50): RealtimeEvent[] {
    const channel = this.channels.get(channelName);
    if (!channel) return [];
    return channel.messageHistory.slice(-limit);
  }

  /**
   * Get channels a user belongs to
   */
  getUserChannels(userId: string): string[] {
    return Array.from(this.userChannels.get(userId) || []);
  }

  /**
   * Check if user is in a channel
   */
  isMember(channelName: string, userId: string): boolean {
    return this.channels.get(channelName)?.members.has(userId) || false;
  }

  /**
   * Get channel info
   */
  getChannel(channelName: string): ChannelState | undefined {
    return this.channels.get(channelName);
  }

  /**
   * Destroy a channel
   */
  destroyChannel(channelName: string): void {
    const channel = this.channels.get(channelName);
    if (!channel) return;

    // Remove all members
    for (const userId of channel.members.keys()) {
      this.userChannels.get(userId)?.delete(channelName);
    }

    // Clean up Redis
    if (this.redis) {
      this.redis.del(`${this.keyPrefix}${channelName}:members`).catch(() => {});
    }

    this.channels.delete(channelName);
    this.channelHandlers.delete(channelName);
    this.redisSubscribed.delete(channelName);
  }

  /**
   * Get total channel count
   */
  getChannelCount(): number {
    return this.channels.size;
  }

  /**
   * Get total connected user count
   */
  getConnectedUserCount(): number {
    return this.userChannels.size;
  }

  /**
   * Subscribe to Redis pub/sub for a channel (for cross-instance delivery).
   */
  private subscribeRedis(channelName: string): void {
    if (!this.redisSub || this.redisSubscribed.has(channelName)) return;
    this.redisSubscribed.add(channelName);
    this.redisSub.subscribe(`${this.keyPrefix}${channelName}`).catch(() => {});
  }
}
