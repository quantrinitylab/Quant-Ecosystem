// ============================================================================
// Realtime - Channel/Room Management
// ============================================================================

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

/**
 * Channel Manager
 *
 * Manages real-time channels/rooms for:
 * - Chat conversations (QuantChat)
 * - Live stream chat rooms (QuantTube)
 * - Post comment threads (QuantSync)
 * - Video call rooms (QuantMax)
 * - Presence channels (ecosystem-wide)
 */
export class ChannelManager {
  private channels: Map<string, ChannelState> = new Map();
  private userChannels: Map<string, Set<string>> = new Map();
  private channelHandlers: Map<string, Set<EventHandler>> = new Map();

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
   * Broadcast a message to all members of a channel
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

    // Notify handlers
    const handlers = this.channelHandlers.get(channelName);
    if (handlers) {
      for (const handler of handlers) {
        handler(event);
      }
    }
  }

  /**
   * Subscribe to channel events
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

    this.channels.delete(channelName);
    this.channelHandlers.delete(channelName);
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
}
