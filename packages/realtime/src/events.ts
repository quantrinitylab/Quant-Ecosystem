// ============================================================================
// Realtime - Event Types and Handlers
// ============================================================================

import type { QuantApp } from '@quant/common';

/** Base event structure */
export interface RealtimeEvent<T = unknown> {
  id: string;
  type: string;
  channel: string;
  payload: T;
  senderId: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

/** Event handler type */
export type EventHandler<T = unknown> = (event: RealtimeEvent<T>) => void | Promise<void>;

/** Event subscription */
export interface EventSubscription {
  id: string;
  channel: string;
  eventType: string;
  handler: EventHandler;
  filter?: (event: RealtimeEvent) => boolean;
}

// ===== Message Events =====
export interface MessageNewEvent {
  messageId: string;
  conversationId: string;
  senderId: string;
  content: string;
  type: string;
  mediaUrl?: string;
  replyToId?: string;
}

export interface MessageTypingEvent {
  conversationId: string;
  userId: string;
  isTyping: boolean;
}

export interface MessageReadEvent {
  conversationId: string;
  userId: string;
  lastReadMessageId: string;
}

export interface MessageDeletedEvent {
  messageId: string;
  conversationId: string;
  deletedBy: string;
}

// ===== Presence Events =====
export interface PresenceUpdateEvent {
  userId: string;
  status: 'online' | 'away' | 'busy' | 'offline';
  activeApp?: QuantApp;
  lastSeen?: number;
}

// ===== Social Events =====
export interface PostNewEvent {
  postId: string;
  userId: string;
  type: string;
  preview: string;
}

export interface PostInteractionEvent {
  postId: string;
  userId: string;
  type: 'like' | 'comment' | 'share' | 'bookmark';
}

// ===== Call Events =====
export interface CallSignalEvent {
  callId: string;
  fromUserId: string;
  toUserId: string;
  type: 'offer' | 'answer' | 'ice_candidate' | 'hangup';
  data: unknown;
}

export interface CallIncomingEvent {
  callId: string;
  callerId: string;
  callerName: string;
  callerAvatar?: string;
  callType: 'voice' | 'video';
}

// ===== Stream Events =====
export interface StreamEvent {
  streamId: string;
  type: 'start' | 'end' | 'viewer_join' | 'viewer_leave' | 'chat';
  data: unknown;
}

// ===== Notification Events =====
export interface NotificationEvent {
  notificationId: string;
  type: string;
  title: string;
  body: string;
  sourceApp: QuantApp;
  actionUrl?: string;
  data?: Record<string, unknown>;
}

// ===== AI Events =====
export interface AIResponseChunkEvent {
  sessionId: string;
  chunk: string;
  done: boolean;
  finishReason?: string;
}

export interface AIDeviceCommandEvent {
  commandId: string;
  deviceId: string;
  action: string;
  status: 'pending' | 'executing' | 'completed' | 'failed';
  result?: unknown;
}

/**
 * Event Registry - maps event types to their payload types
 */
export interface EventMap {
  'message:new': MessageNewEvent;
  'message:typing': MessageTypingEvent;
  'message:read': MessageReadEvent;
  'message:deleted': MessageDeletedEvent;
  'presence:update': PresenceUpdateEvent;
  'post:new': PostNewEvent;
  'post:interaction': PostInteractionEvent;
  'call:signal': CallSignalEvent;
  'call:incoming': CallIncomingEvent;
  'stream:event': StreamEvent;
  'notification:new': NotificationEvent;
  'ai:chunk': AIResponseChunkEvent;
  'ai:device': AIDeviceCommandEvent;
}

/**
 * Event emitter for typed events
 */
export class TypedEventEmitter {
  private handlers: Map<string, Set<EventHandler>> = new Map();

  on<K extends keyof EventMap>(eventType: K, handler: EventHandler<EventMap[K]>): () => void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType)!.add(handler as EventHandler);
    return () => this.off(eventType, handler);
  }

  off<K extends keyof EventMap>(eventType: K, handler: EventHandler<EventMap[K]>): void {
    this.handlers.get(eventType)?.delete(handler as EventHandler);
  }

  emit<K extends keyof EventMap>(eventType: K, event: RealtimeEvent<EventMap[K]>): void {
    const handlers = this.handlers.get(eventType);
    if (handlers) {
      for (const handler of handlers) {
        handler(event as RealtimeEvent);
      }
    }
  }

  removeAllListeners(eventType?: string): void {
    if (eventType) {
      this.handlers.delete(eventType);
    } else {
      this.handlers.clear();
    }
  }

  listenerCount(eventType: string): number {
    return this.handlers.get(eventType)?.size || 0;
  }
}
