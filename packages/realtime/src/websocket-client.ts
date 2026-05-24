// ============================================================================
// Realtime - WebSocket Client for Apps
// ============================================================================

import type { RealtimeEvent, EventHandler } from './events';
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

  constructor(config: Partial<WebSocketClientConfig> & { url: string; token: string; app: QuantApp }, callbacks: ClientCallbacks = {}) {
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

    // Send subscribe message
    this.send({ type: 'subscribe', channel });

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
        const message = JSON.parse(event.data as string) as RealtimeEvent;
        this.handleIncomingMessage(message);
      } catch {
        this.log('Failed to parse message');
      }
    };

    this.ws.onclose = (event) => {
      this.state = 'disconnected';
      this.stopHeartbeat();
      this.callbacks.onDisconnect?.(event.reason || 'Connection closed');

      if (this.config.autoReconnect && this.reconnectCount < this.config.reconnectAttempts) {
        this.attemptReconnect();
      }
    };

    this.ws.onerror = () => {
      this.handleError(new Error('WebSocket error'));
    };
  }

  private handleIncomingMessage(message: RealtimeEvent): void {
    this.callbacks.onMessage?.(message);

    // Route to channel handlers
    if (message.channel) {
      const handlers = this.channelHandlers.get(message.channel);
      if (handlers) {
        for (const handler of handlers) {
          handler(message);
        }
      }
    }

    // Route to event type handlers
    if (message.type) {
      const handlers = this.eventHandlers.get(message.type);
      if (handlers) {
        for (const handler of handlers) {
          handler(message);
        }
      }
    }
  }

  private attemptReconnect(): void {
    this.state = 'reconnecting';
    this.reconnectCount++;
    const delay = Math.min(
      this.config.reconnectIntervalMs * Math.pow(1.5, this.reconnectCount - 1),
      30000
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
      this.send({ type: 'subscribe', channel });
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
      console.log(`[QuantWS ${this.config.app}] ${timestamp} - ${message}`);
    }
  }
}
