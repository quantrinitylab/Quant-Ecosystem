// ============================================================================
// Realtime - WebSocket Client for Apps
// ============================================================================

import type { RealtimeEvent, EventHandler, ServerMessage } from './events';
import type { QuantApp } from '@quant/common';

/** Client configuration */
export interface WebSocketClientConfig {
  url: string;
  token: string;
  app: QuantApp;
  autoReconnect: boolean;
  reconnectAttempts: number;
  reconnectIntervalMs: number;
  heartbeatIntervalMs: number;
  debug: boolean;
}

/** Client state */
export type ClientState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

/** Connection event callbacks */
export interface ClientCallbacks {
  onConnect?: () => void;
  onDisconnect?: (reason: string) => void;
  onReconnecting?: (attempt: number) => void;
  onError?: (error: Error) => void;
  onMessage?: (event: RealtimeEvent) => void;
}

/** Custom close codes */
export const CloseCodes = {
  AUTH_FAILED: 4001,
  RATE_LIMITED: 4002,
  MESSAGE_TOO_LARGE: 4003,
  INVALID_MESSAGE: 4004,
  SERVER_SHUTDOWN: 1001,
} as const;

const DEFAULT_CLIENT_CONFIG: Partial<WebSocketClientConfig> = {
  autoReconnect: true,
  reconnectAttempts: 10,
  reconnectIntervalMs: 3000,
  heartbeatIntervalMs: 25000,
  debug: false,
};

/**
 * WebSocket Client
 *
 * Client-side WebSocket connection for Quant apps.
 * Features:
 * - Automatic reconnection with exponential backoff
 * - Heartbeat keepalive
 * - Channel subscription management
 * - Message queuing during disconnects
 * - Ack/sequence tracking for reliable delivery
 * - Typed event handlers
 */
export class WebSocketClient {
  private config: WebSocketClientConfig;
  private callbacks: ClientCallbacks;
  private state: ClientState = 'disconnected';
  private ws: WebSocket | null = null;
  private reconnectCount: number = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private messageQueue: string[] = [];
  private channelHandlers: Map<string, Set<EventHandler>> = new Map();
  private eventHandlers: Map<string, Set<EventHandler>> = new Map();
  private subscribedChannels: Set<string> = new Set();
  private lastAckedSequence: Map<string, number> = new Map();

  constructor(
    config: Partial<WebSocketClientConfig> & { url: string; token: string; app: QuantApp },
    callbacks: ClientCallbacks = {},
  ) {
    this.config = { ...DEFAULT_CLIENT_CONFIG, ...config } as WebSocketClientConfig;
    this.callbacks = callbacks;
  }

  /**
   * Connect to the WebSocket server
   */
  connect(): void {
    if (this.state === 'connected' || this.state === 'connecting') return;

    this.state = 'connecting';
    this.log('Connecting...');

    try {
      const url = new URL(this.config.url);
      url.searchParams.set('token', this.config.token);
      url.searchParams.set('app', this.config.app);

      this.ws = new WebSocket(url.toString());
      this.setupEventListeners();
    } catch (error) {
      this.handleError(error instanceof Error ? error : new Error('Connection failed'));
    }
  }

  /**
   * Disconnect from the server
   */
  disconnect(): void {
    this.state = 'disconnected';
    this.stopHeartbeat();
    this.clearReconnectTimer();
    this.reconnectCount = 0;

    if (this.ws) {
      this.ws.close(1000, 'Client disconnecting');
      this.ws = null;
    }
  }

  /**
   * Subscribe to a channel
   */
  subscribe(channel: string, handler: EventHandler): () => void {
    if (!this.channelHandlers.has(channel)) {
      this.channelHandlers.set(channel, new Set());
    }
    this.channelHandlers.get(channel)!.add(handler);
    this.subscribedChannels.add(channel);

    // Send subscribe message with last acked sequence for replay
    const lastSeq = this.lastAckedSequence.get(channel) || 0;
    this.send({ type: 'subscribe', channel, lastSequence: lastSeq });

    return () => {
      this.channelHandlers.get(channel)?.delete(handler);
      if (this.channelHandlers.get(channel)?.size === 0) {
        this.channelHandlers.delete(channel);
        this.subscribedChannels.delete(channel);
        this.send({ type: 'unsubscribe', channel });
      }
    };
  }

  /**
   * Publish a message to a channel
   */
  publish(channel: string, payload: unknown): void {
    this.send({ type: 'publish', channel, payload });
  }

  /**
   * Register a handler for a specific event type
   */
  on(eventType: string, handler: EventHandler): () => void {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, new Set());
    }
    this.eventHandlers.get(eventType)!.add(handler);
    return () => this.eventHandlers.get(eventType)?.delete(handler);
  }

  /**
   * Send a raw message
   */
  send(data: unknown): void {
    const message = JSON.stringify(data);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(message);
    } else {
      this.messageQueue.push(message);
    }
  }

  /**
   * Get current connection state
   */
  getState(): ClientState {
    return this.state;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.state === 'connected';
  }

  /**
   * Get last acknowledged sequence for a channel
   */
  getLastAckedSequence(channel: string): number {
    return this.lastAckedSequence.get(channel) || 0;
  }

  private setupEventListeners(): void {
    if (!this.ws) return;

    this.ws.onopen = () => {
      this.state = 'connected';
      this.reconnectCount = 0;
      this.startHeartbeat();
      this.flushMessageQueue();
      this.resubscribeChannels();
      this.callbacks.onConnect?.();
      this.log('Connected');
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data as string);
        this.handleIncomingMessage(message);
      } catch {
        this.log('Failed to parse message');
      }
    };

    this.ws.onclose = (event) => {
      this.state = 'disconnected';
      this.stopHeartbeat();
      this.callbacks.onDisconnect?.(event.reason || 'Connection closed');

      // Do not reconnect on auth failure
      if (event.code === CloseCodes.AUTH_FAILED) {
        this.callbacks.onError?.(new Error('Authentication failed'));
        return;
      }

      if (this.config.autoReconnect && this.reconnectCount < this.config.reconnectAttempts) {
        this.attemptReconnect();
      }
    };

    this.ws.onerror = () => {
      this.handleError(new Error('WebSocket error'));
    };
  }

  private handleIncomingMessage(message: ServerMessage | RealtimeEvent): void {
    // Handle ack_required: send ack back
    if (
      'requiresAck' in message &&
      message.requiresAck &&
      'id' in message &&
      'sequence' in message
    ) {
      const msg = message as { id: string; sequence: number; channel?: string };
      this.send({ type: 'ack', messageId: msg.id, sequence: msg.sequence });

      // Track sequence
      if (msg.channel) {
        this.lastAckedSequence.set(msg.channel, msg.sequence);
      }
    }

    // Treat as RealtimeEvent for callbacks
    const event = message as RealtimeEvent;
    this.callbacks.onMessage?.(event);

    // Route to channel handlers
    if ('channel' in message && (message as { channel?: string }).channel) {
      const channel = (message as { channel: string }).channel;
      const handlers = this.channelHandlers.get(channel);
      if (handlers) {
        for (const handler of handlers) {
          handler(event);
        }
      }
    }

    // Route to event type handlers
    if ('type' in message && message.type) {
      const handlers = this.eventHandlers.get(message.type);
      if (handlers) {
        for (const handler of handlers) {
          handler(event);
        }
      }
    }
  }

  private attemptReconnect(): void {
    this.state = 'reconnecting';
    this.reconnectCount++;
    const delay = Math.min(
      this.config.reconnectIntervalMs * Math.pow(1.5, this.reconnectCount - 1),
      30000,
    );
    this.callbacks.onReconnecting?.(this.reconnectCount);
    this.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectCount})`);
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private flushMessageQueue(): void {
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift()!;
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(message);
      }
    }
  }

  private resubscribeChannels(): void {
    for (const channel of this.subscribedChannels) {
      const lastSeq = this.lastAckedSequence.get(channel) || 0;
      this.send({ type: 'subscribe', channel, lastSequence: lastSeq });
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.send({ type: 'heartbeat', timestamp: Date.now() });
    }, this.config.heartbeatIntervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private handleError(error: Error): void {
    this.callbacks.onError?.(error);
    this.log(`Error: ${error.message}`);
  }

  private log(message: string): void {
    if (this.config.debug) {
      const timestamp = new Date().toISOString();
      globalThis.console.log(`[QuantWS ${this.config.app}] ${timestamp} - ${message}`);
    }
  }
}
