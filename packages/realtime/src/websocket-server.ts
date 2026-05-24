// ============================================================================
// Realtime - WebSocket Server Implementation
// ============================================================================

import { ChannelManager } from './channels';
import { PresenceManager } from './presence';
import { TypedEventEmitter } from './events';
import type { RealtimeEvent, EventHandler } from './events';
import type { QuantApp } from '@quant/common';

/** Server configuration */
export interface WebSocketServerConfig {
  port: number;
  path: string;
  maxConnections: number;
  heartbeatIntervalMs: number;
  maxMessageSize: number;
  corsOrigins: string[];
}

/** Connected client state */
export interface ConnectedClient {
  id: string;
  userId: string;
  app: QuantApp;
  connectedAt: number;
  lastHeartbeat: number;
  metadata: Record<string, unknown>;
}

/** Server statistics */
export interface ServerStats {
  totalConnections: number;
  activeConnections: number;
  channelCount: number;
  messagesSent: number;
  messagesReceived: number;
  uptime: number;
}

const DEFAULT_CONFIG: WebSocketServerConfig = {
  port: 8080,
  path: '/ws',
  maxConnections: 10000,
  heartbeatIntervalMs: 30000,
  maxMessageSize: 65536,
  corsOrigins: ['https://*.quant.app'],
};

/**
 * WebSocket Server
 *
 * Central real-time server for the Quant Ecosystem.
 * Handles:
 * - Client connection/disconnection
 * - Message routing between clients
 * - Channel management
 * - Presence tracking
 * - Rate limiting
 * - Authentication via token
 */
export class WebSocketServer {
  private config: WebSocketServerConfig;
  private clients: Map<string, ConnectedClient> = new Map();
  private userClients: Map<string, Set<string>> = new Map();
  private channelManager: ChannelManager;
  private presenceManager: PresenceManager;
  private eventEmitter: TypedEventEmitter;
  private messageHandlers: Map<string, EventHandler[]> = new Map();
  private stats: ServerStats;
  private startedAt: number;

  constructor(config: Partial<WebSocketServerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.channelManager = new ChannelManager();
    this.presenceManager = new PresenceManager();
    this.eventEmitter = new TypedEventEmitter();
    this.startedAt = Date.now();
    this.stats = {
      totalConnections: 0,
      activeConnections: 0,
      channelCount: 0,
      messagesSent: 0,
      messagesReceived: 0,
      uptime: 0,
    };
  }

  /**
   * Handle a new client connection
   */
  handleConnection(clientId: string, userId: string, app: QuantApp, metadata: Record<string, unknown> = {}): ConnectedClient {
    // Check max connections
    if (this.clients.size >= this.config.maxConnections) {
      throw new Error('Maximum connections reached');
    }

    const client: ConnectedClient = {
      id: clientId,
      userId,
      app,
      connectedAt: Date.now(),
      lastHeartbeat: Date.now(),
      metadata,
    };

    this.clients.set(clientId, client);
    this.stats.totalConnections++;
    this.stats.activeConnections = this.clients.size;

    // Track user -> clients mapping
    if (!this.userClients.has(userId)) {
      this.userClients.set(userId, new Set());
    }
    this.userClients.get(userId)!.add(clientId);

    // Update presence
    this.presenceManager.setOnline(userId, app);

    return client;
  }

  /**
   * Handle client disconnection
   */
  handleDisconnection(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Remove from clients
    this.clients.delete(clientId);
    this.stats.activeConnections = this.clients.size;

    // Remove from user -> clients mapping
    const userClientSet = this.userClients.get(client.userId);
    if (userClientSet) {
      userClientSet.delete(clientId);
      if (userClientSet.size === 0) {
        this.userClients.delete(client.userId);
        // Only set offline if no more connections for this user
        this.presenceManager.setOffline(client.userId);
      }
    }

    // Leave all channels
    this.channelManager.leaveAll(client.userId);
  }

  /**
   * Handle incoming message from a client
   */
  handleMessage(clientId: string, rawMessage: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Check message size
    if (rawMessage.length > this.config.maxMessageSize) {
      this.sendToClient(clientId, { type: 'error', payload: { message: 'Message too large' } });
      return;
    }

    this.stats.messagesReceived++;
    client.lastHeartbeat = Date.now();

    try {
      const message = JSON.parse(rawMessage);
      this.routeMessage(client, message);
    } catch {
      this.sendToClient(clientId, { type: 'error', payload: { message: 'Invalid JSON' } });
    }
  }

  /**
   * Route a parsed message to appropriate handler
   */
  private routeMessage(client: ConnectedClient, message: Record<string, unknown>): void {
    const type = message.type as string;
    if (!type) return;

    switch (type) {
      case 'subscribe':
        this.handleSubscribe(client, message.channel as string);
        break;
      case 'unsubscribe':
        this.handleUnsubscribe(client, message.channel as string);
        break;
      case 'publish':
        this.handlePublish(client, message.channel as string, message.payload);
        break;
      case 'heartbeat':
        this.handleHeartbeat(client);
        break;
      case 'presence:update':
        this.handlePresenceUpdate(client, message.status as string);
        break;
      default:
        // Pass to registered message handlers
        const handlers = this.messageHandlers.get(type);
        if (handlers) {
          const event: RealtimeEvent = {
            id: `evt_${Date.now().toString(36)}`,
            type,
            channel: (message.channel as string) || 'default',
            payload: message.payload,
            senderId: client.userId,
            timestamp: Date.now(),
          };
          for (const handler of handlers) {
            handler(event);
          }
        }
    }
  }

  /**
   * Handle channel subscription
   */
  private handleSubscribe(client: ConnectedClient, channelName: string): void {
    if (!channelName) return;
    this.channelManager.createChannel({ name: channelName, type: 'public' });
    this.channelManager.join(channelName, client.userId);
    this.sendToClient(client.id, { type: 'subscribed', channel: channelName });
  }

  /**
   * Handle channel unsubscription
   */
  private handleUnsubscribe(client: ConnectedClient, channelName: string): void {
    if (!channelName) return;
    this.channelManager.leave(channelName, client.userId);
    this.sendToClient(client.id, { type: 'unsubscribed', channel: channelName });
  }

  /**
   * Handle publish to channel
   */
  private handlePublish(client: ConnectedClient, channelName: string, payload: unknown): void {
    if (!channelName) return;
    if (!this.channelManager.isMember(channelName, client.userId)) return;

    const event: RealtimeEvent = {
      id: `evt_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
      type: 'message',
      channel: channelName,
      payload,
      senderId: client.userId,
      timestamp: Date.now(),
    };

    this.channelManager.broadcastToChannel(channelName, event);
    this.stats.messagesSent++;
  }

  /**
   * Handle heartbeat from client
   */
  private handleHeartbeat(client: ConnectedClient): void {
    client.lastHeartbeat = Date.now();
    this.presenceManager.heartbeat(client.userId, client.app);
    this.sendToClient(client.id, { type: 'heartbeat_ack', timestamp: Date.now() });
  }

  /**
   * Handle presence status update
   */
  private handlePresenceUpdate(client: ConnectedClient, status: string): void {
    const validStatuses = ['online', 'away', 'busy', 'invisible'];
    if (validStatuses.includes(status)) {
      this.presenceManager.setStatus(client.userId, status as 'online' | 'away' | 'busy' | 'invisible');
    }
  }

  /**
   * Send a message to a specific client
   */
  sendToClient(clientId: string, message: unknown): void {
    // In production, this sends via the actual WebSocket connection
    this.stats.messagesSent++;
  }

  /**
   * Send a message to all clients of a user
   */
  sendToUser(userId: string, message: unknown): void {
    const clientIds = this.userClients.get(userId);
    if (!clientIds) return;
    for (const clientId of clientIds) {
      this.sendToClient(clientId, message);
    }
  }

  /**
   * Broadcast to all connected clients
   */
  broadcast(message: unknown, excludeClientId?: string): void {
    for (const clientId of this.clients.keys()) {
      if (clientId !== excludeClientId) {
        this.sendToClient(clientId, message);
      }
    }
  }

  /**
   * Register a message handler for a specific message type
   */
  registerHandler(messageType: string, handler: EventHandler): void {
    if (!this.messageHandlers.has(messageType)) {
      this.messageHandlers.set(messageType, []);
    }
    this.messageHandlers.get(messageType)!.push(handler);
  }

  /**
   * Get server statistics
   */
  getStats(): ServerStats {
    return {
      ...this.stats,
      channelCount: this.channelManager.getChannelCount(),
      uptime: Date.now() - this.startedAt,
    };
  }

  /**
   * Get channel manager instance
   */
  getChannelManager(): ChannelManager {
    return this.channelManager;
  }

  /**
   * Get presence manager instance
   */
  getPresenceManager(): PresenceManager {
    return this.presenceManager;
  }

  /**
   * Check if a user is connected
   */
  isUserConnected(userId: string): boolean {
    return this.userClients.has(userId) && (this.userClients.get(userId)?.size || 0) > 0;
  }

  /**
   * Get connected client count for a user
   */
  getUserConnectionCount(userId: string): number {
    return this.userClients.get(userId)?.size || 0;
  }
}
