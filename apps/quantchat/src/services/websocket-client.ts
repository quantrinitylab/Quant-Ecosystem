// ============================================================================
// QuantChat - WebSocket Client
// Real-time messaging with reconnection, heartbeat, queuing, and error handling
// ============================================================================

import type { WSEvent, WSEventType, Message, TypingIndicator } from '../types';
import { logger } from '@quant/common';

// ============================================================================
// Types
// ============================================================================

type EventHandler = (payload: unknown) => void;

interface WebSocketConfig {
  url: string;
  token: string;
  deviceId: string;
  reconnectInterval: number;
  maxReconnectAttempts: number;
  heartbeatInterval: number;
  heartbeatTimeout: number;
  maxQueueSize: number;
  maxMessageSize: number;
}

export type ConnectionState =
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'reconnecting'
  | 'failed';

export interface ConnectionHealth {
  state: ConnectionState;
  reconnectAttempts: number;
  lastConnectedAt: number | null;
  lastDisconnectedAt: number | null;
  lastPongAt: number | null;
  messagesQueued: number;
  messagesSent: number;
  messagesReceived: number;
  latencyMs: number | null;
}

interface QueuedMessage {
  event: WSEvent;
  priority: number;
  enqueuedAt: number;
}

// ============================================================================
// WebSocket Client
// ============================================================================

export class QuantChatWSClient {
  private config: WebSocketConfig;
  private socket: WebSocket | null = null;
  private handlers: Map<WSEventType, EventHandler[]> = new Map();
  private state: ConnectionState = 'disconnected';
  private reconnectAttempts: number = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private messageQueue: QueuedMessage[] = [];
  private onStateChange?: (state: ConnectionState) => void;
  private lastConnectedAt: number | null = null;
  private lastDisconnectedAt: number | null = null;
  private lastPongAt: number | null = null;
  private lastPingAt: number | null = null;
  private messagesSent: number = 0;
  private messagesReceived: number = 0;
  private intentionalClose: boolean = false;

  constructor(config: Partial<WebSocketConfig> = {}) {
    this.config = {
      url: config.url || 'wss://chat.quant.app/ws',
      token: config.token || '',
      deviceId: config.deviceId || `device_${Date.now().toString(36)}`,
      reconnectInterval: config.reconnectInterval || 3000,
      maxReconnectAttempts: config.maxReconnectAttempts || 10,
      heartbeatInterval: config.heartbeatInterval || 15000,
      heartbeatTimeout: config.heartbeatTimeout || 10000,
      maxQueueSize: config.maxQueueSize || 200,
      maxMessageSize: config.maxMessageSize || 65536,
    };
  }

  // --------------------------------------------------------------------------
  // Connection Management
  // --------------------------------------------------------------------------

  connect(token?: string): void {
    if (token) this.config.token = token;
    if (!this.config.token) {
      throw new Error('Authentication token is required');
    }
    if (this.state === 'connected' || this.state === 'connecting') return;

    this.intentionalClose = false;
    this.setState('connecting');
    const url = `${this.config.url}?token=${encodeURIComponent(this.config.token)}&deviceId=${this.config.deviceId}`;

    try {
      this.socket = new WebSocket(url);

      this.socket.onopen = () => {
        this.setState('connected');
        this.reconnectAttempts = 0;
        this.lastConnectedAt = Date.now();
        this.startHeartbeat();
        this.flushMessageQueue();
      };

      this.socket.onmessage = (event) => {
        try {
          const wsEvent = JSON.parse(event.data) as WSEvent;
          this.messagesReceived++;
          if (wsEvent.type === ('presence:update' as WSEventType)) {
            const payload = wsEvent.payload as Record<string, unknown> | undefined;
            if (payload && payload['pong'] === true) {
              this.handlePong();
              return;
            }
          }
          this.dispatchEvent(wsEvent);
        } catch {
          logger.error('[WS] Failed to parse incoming message');
        }
      };

      this.socket.onclose = (event) => {
        this.stopHeartbeat();
        this.lastDisconnectedAt = Date.now();
        if (this.intentionalClose || event.code === 1000) {
          this.setState('disconnected');
        } else if (event.code === 4001) {
          this.setState('failed');
          logger.error('[WS] Authentication failed, not reconnecting');
        } else {
          this.handleDisconnect();
        }
      };

      this.socket.onerror = () => {
        logger.error('[WS] Connection error');
      };
    } catch {
      this.lastDisconnectedAt = Date.now();
      this.handleDisconnect();
    }
  }

  disconnect(): void {
    this.intentionalClose = true;
    this.stopHeartbeat();
    this.stopReconnect();
    if (this.socket) {
      this.socket.close(1000, 'Client disconnect');
      this.socket = null;
    }
    this.setState('disconnected');
  }

  // --------------------------------------------------------------------------
  // Event Handling
  // --------------------------------------------------------------------------

  on(eventType: WSEventType, handler: EventHandler): () => void {
    const handlers = this.handlers.get(eventType) || [];
    handlers.push(handler);
    this.handlers.set(eventType, handlers);

    return () => {
      const current = this.handlers.get(eventType) || [];
      this.handlers.set(
        eventType,
        current.filter((h) => h !== handler),
      );
    };
  }

  off(eventType: WSEventType, handler?: EventHandler): void {
    if (handler) {
      const current = this.handlers.get(eventType) || [];
      this.handlers.set(
        eventType,
        current.filter((h) => h !== handler),
      );
    } else {
      this.handlers.delete(eventType);
    }
  }

  private dispatchEvent(event: WSEvent): void {
    const handlers = this.handlers.get(event.type) || [];
    for (const handler of handlers) {
      try {
        handler(event.payload);
      } catch (error) {
        logger.error(`[WS] Handler error for ${event.type}:`, error);
      }
    }
  }

  // --------------------------------------------------------------------------
  // Sending Events
  // --------------------------------------------------------------------------

  send(event: WSEvent, priority: number = 0): boolean {
    const serialized = JSON.stringify(event);

    if (serialized.length > this.config.maxMessageSize) {
      logger.error(
        `[WS] Message exceeds max size: ${serialized.length} > ${this.config.maxMessageSize}`,
      );
      return false;
    }

    if (this.state === 'connected' && this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(serialized);
      this.messagesSent++;
      return true;
    }

    if (this.messageQueue.length >= this.config.maxQueueSize) {
      this.messageQueue.shift();
      logger.warn('[WS] Message queue full, dropped oldest message');
    }

    this.messageQueue.push({
      event,
      priority,
      enqueuedAt: Date.now(),
    });
    this.messageQueue.sort((a, b) => b.priority - a.priority);
    return false;
  }

  sendTypingStart(conversationId: string): void {
    this.send({
      type: 'typing:start',
      payload: { conversationId },
      timestamp: Date.now(),
    });
  }

  sendTypingStop(conversationId: string): void {
    this.send({
      type: 'typing:stop',
      payload: { conversationId },
      timestamp: Date.now(),
    });
  }

  sendMessageRead(conversationId: string, messageIds: string[]): void {
    this.send({
      type: 'message:read',
      payload: { conversationId, messageIds },
      timestamp: Date.now(),
    });
  }

  sendPresenceUpdate(status: 'online' | 'away'): void {
    this.send({
      type: 'presence:update',
      payload: { status },
      timestamp: Date.now(),
    });
  }

  sendMessageReaction(conversationId: string, messageId: string, emoji: string): void {
    this.send({
      type: 'message:reaction',
      payload: { conversationId, messageId, emoji },
      timestamp: Date.now(),
    });
  }

  sendMessageUpdate(conversationId: string, messageId: string, content: string): void {
    this.send(
      {
        type: 'message:update',
        payload: { conversationId, messageId, content },
        timestamp: Date.now(),
      },
      1,
    );
  }

  // --------------------------------------------------------------------------
  // Convenience Handlers
  // --------------------------------------------------------------------------

  onMessage(handler: (message: Message) => void): () => void {
    return this.on('message:new', handler as EventHandler);
  }

  onMessageUpdate(handler: (message: Message) => void): () => void {
    return this.on('message:update', handler as EventHandler);
  }

  onMessageDelete(
    handler: (data: { messageId: string; conversationId: string }) => void,
  ): () => void {
    return this.on('message:delete', handler as EventHandler);
  }

  onTyping(
    handler: (data: { userId: string; conversationId: string; isTyping: boolean }) => void,
  ): () => void {
    const unsub1 = this.on('typing:start', (payload) => {
      const data = payload as { userId: string; conversationId: string };
      handler({ ...data, isTyping: true });
    });
    const unsub2 = this.on('typing:stop', (payload) => {
      const data = payload as { userId: string; conversationId: string };
      handler({ ...data, isTyping: false });
    });
    return () => {
      unsub1();
      unsub2();
    };
  }

  onPresence(handler: (data: { userId: string; status: string }) => void): () => void {
    return this.on('presence:update', handler as EventHandler);
  }

  onIncomingCall(
    handler: (data: { callId: string; callerId: string; type: string }) => void,
  ): () => void {
    return this.on('call:incoming', handler as EventHandler);
  }

  onSnapReceived(handler: (data: { snapId: string; senderId: string }) => void): () => void {
    return this.on('snap:received', handler as EventHandler);
  }

  onStreakWarning(
    handler: (data: { friendId: string; count: number; hoursLeft: number }) => void,
  ): () => void {
    return this.on('streak:warning', handler as EventHandler);
  }

  onNotification(
    handler: (data: { id: string; type: string; title: string; body: string }) => void,
  ): () => void {
    return this.on('notification:new', handler as EventHandler);
  }

  onReaction(
    handler: (data: { messageId: string; userId: string; emoji: string }) => void,
  ): () => void {
    return this.on('message:reaction', handler as EventHandler);
  }

  // --------------------------------------------------------------------------
  // State & Health
  // --------------------------------------------------------------------------

  getState(): ConnectionState {
    return this.state;
  }

  isConnected(): boolean {
    return this.state === 'connected';
  }

  setStateChangeHandler(handler: (state: ConnectionState) => void): void {
    this.onStateChange = handler;
  }

  getHealth(): ConnectionHealth {
    return {
      state: this.state,
      reconnectAttempts: this.reconnectAttempts,
      lastConnectedAt: this.lastConnectedAt,
      lastDisconnectedAt: this.lastDisconnectedAt,
      lastPongAt: this.lastPongAt,
      messagesQueued: this.messageQueue.length,
      messagesSent: this.messagesSent,
      messagesReceived: this.messagesReceived,
      latencyMs: this.lastPongAt && this.lastPingAt ? this.lastPongAt - this.lastPingAt : null,
    };
  }

  getQueueSize(): number {
    return this.messageQueue.length;
  }

  // --------------------------------------------------------------------------
  // Private Methods
  // --------------------------------------------------------------------------

  private setState(state: ConnectionState): void {
    if (this.state === state) return;
    this.state = state;
    this.onStateChange?.(state);
  }

  private handleDisconnect(): void {
    if (this.intentionalClose) {
      this.setState('disconnected');
      return;
    }

    if (this.reconnectAttempts < this.config.maxReconnectAttempts) {
      this.reconnectAttempts++;
      this.setState('reconnecting');
      const baseDelay = this.config.reconnectInterval * Math.pow(1.5, this.reconnectAttempts - 1);
      const jitter = Math.random() * baseDelay * 0.3;
      const delay = Math.min(baseDelay + jitter, 30000);
      this.reconnectTimer = setTimeout(() => {
        this.connect();
      }, delay);
    } else {
      this.setState('failed');
    }
  }

  private stopReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = 0;
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.lastPingAt = Date.now();
      this.send({
        type: 'presence:update',
        payload: { status: 'online', ping: true },
        timestamp: Date.now(),
      });

      this.heartbeatTimeoutTimer = setTimeout(() => {
        logger.warn('[WS] Heartbeat timeout, reconnecting...');
        if (this.socket) {
          this.socket.close(4000, 'Heartbeat timeout');
        }
      }, this.config.heartbeatTimeout);
    }, this.config.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer);
      this.heartbeatTimeoutTimer = null;
    }
  }

  private handlePong(): void {
    this.lastPongAt = Date.now();
    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer);
      this.heartbeatTimeoutTimer = null;
    }
  }

  private flushMessageQueue(): void {
    const queue = [...this.messageQueue];
    this.messageQueue = [];
    for (const item of queue) {
      this.send(item.event, item.priority);
    }
  }
}

export const wsClient = new QuantChatWSClient();
