// ============================================================================
// Realtime - WebSocket Server Implementation (ws library)
// ============================================================================

import { createServer, type IncomingMessage, type Server } from 'node:http';
import { WebSocketServer as WsServer, type WebSocket, type RawData } from 'ws';
import { ChannelManager } from './channels';
import { PresenceManager } from './presence';
import { ConnectionAuth } from './auth';
import { DeliveryManager } from './delivery';
import { BackpressureHandler } from './backpressure';
import type { RealtimeEvent, EventHandler } from './events';
import type { QuantApp } from '@quant/common';
import type { ConnectionInfo, AuthPayload } from './types';
import { DEFAULT_REALTIME_CONFIG } from './types';

/** Server configuration (public API backward compat) */
export interface WebSocketServerConfig {
  port: number;
  path: string;
  maxConnections: number;
  heartbeatIntervalMs: number;
  heartbeatTimeoutMs: number;
  maxMessageSize: number;
  corsOrigins: string[];
  jwtSecret: string;
  jwtIssuer: string;
  jwtAudience: string;
}

/** Connected client state (public API backward compat) */
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
  port: DEFAULT_REALTIME_CONFIG.port,
  path: DEFAULT_REALTIME_CONFIG.path,
  maxConnections: DEFAULT_REALTIME_CONFIG.maxConnections,
  heartbeatIntervalMs: DEFAULT_REALTIME_CONFIG.heartbeatIntervalMs,
  heartbeatTimeoutMs: DEFAULT_REALTIME_CONFIG.heartbeatTimeoutMs,
  maxMessageSize: DEFAULT_REALTIME_CONFIG.maxMessageSize,
  corsOrigins: ['https://*.quant.app'],
  jwtSecret: '',
  jwtIssuer: DEFAULT_REALTIME_CONFIG.jwtIssuer,
  jwtAudience: DEFAULT_REALTIME_CONFIG.jwtAudience,
};

/**
 * WebSocket Server
 *
 * Real WebSocket server using the `ws` library.
 * Features:
 * - JWT authentication on HTTP upgrade
 * - Native ws ping/pong heartbeat
 * - Connection tracking with userId mapping
 * - Message routing and channel management
 * - Backpressure handling
 * - Delivery guarantees with ack/retry
 * - Graceful shutdown
 */
export class WebSocketServer {
  private config: WebSocketServerConfig;
  private httpServer: Server | null = null;
  private wss: WsServer | null = null;
  private connections: Map<string, WebSocket> = new Map();
  private connectionInfo: Map<string, ConnectionInfo> = new Map();
  private clients: Map<string, ConnectedClient> = new Map();
  private userClients: Map<string, Set<string>> = new Map();
  private channelManager: ChannelManager;
  private presenceManager: PresenceManager;
  private auth: ConnectionAuth;
  private delivery: DeliveryManager;
  private backpressure: BackpressureHandler;
  private messageHandlers: Map<string, EventHandler[]> = new Map();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private stats: ServerStats;
  private startedAt: number;

  constructor(config: Partial<WebSocketServerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Security guard: reject empty or too-short JWT secrets
    if (!this.config.jwtSecret || this.config.jwtSecret.length < 32) {
      throw new Error(
        'WebSocket server requires a jwtSecret of at least 32 characters. ' +
          'Set a strong secret in the server configuration.',
      );
    }

    this.channelManager = new ChannelManager();
    this.presenceManager = new PresenceManager();
    this.auth = new ConnectionAuth({
      jwtSecret: this.config.jwtSecret,
      jwtIssuer: this.config.jwtIssuer,
      jwtAudience: this.config.jwtAudience,
    });
    this.delivery = new DeliveryManager();
    this.backpressure = new BackpressureHandler();
    this.startedAt = Date.now();
    this.stats = {
      totalConnections: 0,
      activeConnections: 0,
      channelCount: 0,
      messagesSent: 0,
      messagesReceived: 0,
      uptime: 0,
    };

    // Wire delivery retry to sendToClient
    this.delivery.setRetrySender((connectionId, envelope) => {
      this.sendToClient(connectionId, envelope);
    });
  }

  /**
   * Start the WebSocket server (listen on port).
   */
  start(): Promise<void> {
    return new Promise((resolve) => {
      this.httpServer = createServer((req, res) => {
        const url = req.url || '';
        if (url === '/health' || url === '/api/health') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok', uptime: Date.now() - this.startedAt }));
        } else {
          res.writeHead(404);
          res.end();
        }
      });
      this.wss = new WsServer({
        noServer: true,
        maxPayload: this.config.maxMessageSize,
      });

      // Handle HTTP upgrade with authentication
      this.httpServer.on('upgrade', (request, socket, head) => {
        this.handleUpgrade(request, socket, head);
      });

      // Handle new connections
      this.wss.on('connection', (ws: WebSocket, request: IncomingMessage) => {
        // Auth payload is attached to the request during upgrade
        const authPayload = (request as IncomingMessage & { _authPayload?: AuthPayload })
          ._authPayload;
        if (authPayload) {
          this.handleNewConnection(ws, request, authPayload);
        }
      });

      // Start heartbeat interval
      this.startHeartbeatCheck();
      this.delivery.startSweep();

      this.httpServer.listen(this.config.port, () => {
        resolve();
      });
    });
  }

  /**
   * Handle HTTP upgrade with JWT authentication.
   */
  private handleUpgrade(request: IncomingMessage, socket: unknown, head: Buffer): void {
    // Check path
    const url = request.url || '';
    const pathMatch = url.startsWith(this.config.path) || url.split('?')[0] === this.config.path;
    if (!pathMatch) {
      (socket as { destroy: () => void }).destroy();
      return;
    }

    // Check max connections
    if (this.connections.size >= this.config.maxConnections) {
      (socket as { destroy: () => void }).destroy();
      return;
    }

    // Authenticate
    this.auth
      .authenticateUpgrade(request)
      .then((authPayload) => {
        (request as IncomingMessage & { _authPayload?: AuthPayload })._authPayload = authPayload;
        this.wss!.handleUpgrade(request, socket as never, head, (ws) => {
          this.wss!.emit('connection', ws, request);
        });
      })
      .catch(() => {
        (socket as { destroy: () => void }).destroy();
      });
  }

  /**
   * Handle a new authenticated WebSocket connection.
   */
  private handleNewConnection(
    ws: WebSocket,
    _request: IncomingMessage,
    authPayload: AuthPayload,
  ): void {
    const connectionId = `conn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();

    // Store connection
    this.connections.set(connectionId, ws);
    this.connectionInfo.set(connectionId, {
      id: connectionId,
      userId: authPayload.userId,
      app: authPayload.app,
      connectedAt: now,
      lastPing: now,
      metadata: {},
    });

    const client: ConnectedClient = {
      id: connectionId,
      userId: authPayload.userId,
      app: authPayload.app,
      connectedAt: now,
      lastHeartbeat: now,
      metadata: {},
    };
    this.clients.set(connectionId, client);

    // Track user mapping
    if (!this.userClients.has(authPayload.userId)) {
      this.userClients.set(authPayload.userId, new Set());
    }
    this.userClients.get(authPayload.userId)!.add(connectionId);

    this.stats.totalConnections++;
    this.stats.activeConnections = this.connections.size;

    // Update presence
    this.presenceManager.setOnline(authPayload.userId, authPayload.app);

    // Set up event listeners
    ws.on('message', (data: RawData) => {
      this.handleMessage(connectionId, data.toString());
    });

    ws.on('pong', () => {
      const info = this.connectionInfo.get(connectionId);
      if (info) info.lastPing = Date.now();
      const clientRef = this.clients.get(connectionId);
      if (clientRef) clientRef.lastHeartbeat = Date.now();
    });

    ws.on('close', () => {
      this.handleClose(connectionId);
    });

    ws.on('error', () => {
      this.handleClose(connectionId);
    });
  }

  /**
   * Handle a new client connection (programmatic, for backward compat).
   */
  handleConnection(
    clientId: string,
    userId: string,
    app: QuantApp,
    metadata: Record<string, unknown> = {},
  ): ConnectedClient {
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

    if (!this.userClients.has(userId)) {
      this.userClients.set(userId, new Set());
    }
    this.userClients.get(userId)!.add(clientId);

    this.presenceManager.setOnline(userId, app);
    return client;
  }

  /**
   * Handle client disconnection (programmatic, for backward compat).
   */
  handleDisconnection(clientId: string): void {
    this.handleClose(clientId);
  }

  /**
   * Handle WebSocket close / cleanup.
   */
  private handleClose(connectionId: string): void {
    const client = this.clients.get(connectionId);
    if (!client) return;

    // Remove connection
    this.connections.delete(connectionId);
    this.connectionInfo.delete(connectionId);
    this.clients.delete(connectionId);
    this.stats.activeConnections = this.clients.size;

    // Remove from user mapping
    const userClientSet = this.userClients.get(client.userId);
    if (userClientSet) {
      userClientSet.delete(connectionId);
      if (userClientSet.size === 0) {
        this.userClients.delete(client.userId);
        this.presenceManager.setOffline(client.userId);
      }
    }

    // Leave all channels
    this.channelManager.leaveAll(client.userId);

    // Clean delivery and backpressure state
    this.delivery.clearConnection(connectionId);
    this.backpressure.clearConnection(connectionId);
  }

  /**
   * Handle incoming message from a client.
   */
  handleMessage(clientId: string, rawMessage: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    if (rawMessage.length > this.config.maxMessageSize) {
      this.sendToClient(clientId, { type: 'error', code: 4003, message: 'Message too large' });
      return;
    }

    this.stats.messagesReceived++;
    client.lastHeartbeat = Date.now();

    try {
      const message = JSON.parse(rawMessage);
      this.routeMessage(client, message);
    } catch {
      this.sendToClient(clientId, { type: 'error', code: 4004, message: 'Invalid JSON' });
    }
  }

  /**
   * Route a parsed message to appropriate handler.
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
      case 'ack':
        this.handleAck(message.messageId as string, message.sequence as number);
        break;
      case 'presence_update':
        this.handlePresenceUpdate(client, message.status as string);
        break;
      default: {
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
  }

  private handleSubscribe(client: ConnectedClient, channelName: string): void {
    if (!channelName) return;
    this.channelManager.createChannel({ name: channelName, type: 'public' });
    this.channelManager.join(channelName, client.userId);
    this.sendToClient(client.id, { type: 'subscribed', channel: channelName });
  }

  private handleUnsubscribe(client: ConnectedClient, channelName: string): void {
    if (!channelName) return;
    this.channelManager.leave(channelName, client.userId);
    this.sendToClient(client.id, { type: 'unsubscribed', channel: channelName });
  }

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

  private handleHeartbeat(client: ConnectedClient): void {
    client.lastHeartbeat = Date.now();
    this.presenceManager.heartbeat(client.userId, client.app);
    this.sendToClient(client.id, { type: 'heartbeat_ack', timestamp: Date.now() });
  }

  private handleAck(messageId: string, sequence: number): void {
    if (!messageId) return;
    this.delivery.acknowledge({
      messageId,
      sequence: sequence || 0,
      acknowledgedAt: Date.now(),
    });
  }

  private handlePresenceUpdate(client: ConnectedClient, status: string): void {
    const validStatuses = ['online', 'away', 'busy', 'invisible'];
    if (validStatuses.includes(status)) {
      this.presenceManager.setStatus(
        client.userId,
        status as 'online' | 'away' | 'busy' | 'invisible',
      );
    }
  }

  /**
   * Send a message to a specific client.
   * Checks backpressure before sending.
   */
  sendToClient(clientId: string, message: unknown): void {
    this.stats.messagesSent++;

    const ws = this.connections.get(clientId);
    if (!ws || ws.readyState !== 1 /* OPEN */) return;

    const data = JSON.stringify(message);
    this.backpressure.send(
      clientId,
      ws as unknown as {
        bufferedAmount: number;
        send: (d: string, cb?: (err?: Error) => void) => void;
      },
      data,
    );
  }

  /**
   * Send a message to all clients of a user.
   */
  sendToUser(userId: string, message: unknown): void {
    const clientIds = this.userClients.get(userId);
    if (!clientIds) return;
    for (const clientId of clientIds) {
      this.sendToClient(clientId, message);
    }
  }

  /**
   * Broadcast to all connected clients.
   */
  broadcast(message: unknown, excludeClientId?: string): void {
    for (const clientId of this.clients.keys()) {
      if (clientId !== excludeClientId) {
        this.sendToClient(clientId, message);
      }
    }
  }

  /**
   * Register a message handler for a specific message type.
   */
  registerHandler(messageType: string, handler: EventHandler): void {
    if (!this.messageHandlers.has(messageType)) {
      this.messageHandlers.set(messageType, []);
    }
    this.messageHandlers.get(messageType)!.push(handler);
  }

  /**
   * Get server statistics.
   */
  getStats(): ServerStats {
    return {
      ...this.stats,
      channelCount: this.channelManager.getChannelCount(),
      uptime: Date.now() - this.startedAt,
    };
  }

  /**
   * Get channel manager instance.
   */
  getChannelManager(): ChannelManager {
    return this.channelManager;
  }

  /**
   * Get presence manager instance.
   */
  getPresenceManager(): PresenceManager {
    return this.presenceManager;
  }

  /**
   * Get delivery manager instance.
   */
  getDeliveryManager(): DeliveryManager {
    return this.delivery;
  }

  /**
   * Check if a user is connected.
   */
  isUserConnected(userId: string): boolean {
    return this.userClients.has(userId) && (this.userClients.get(userId)?.size || 0) > 0;
  }

  /**
   * Get connected client count for a user.
   */
  getUserConnectionCount(userId: string): number {
    return this.userClients.get(userId)?.size || 0;
  }

  /**
   * Start native ws ping/pong heartbeat check.
   * Terminates connections that don't respond to ping.
   */
  private startHeartbeatCheck(): void {
    this.heartbeatTimer = setInterval(() => {
      const now = Date.now();
      for (const [id, info] of this.connectionInfo) {
        if (now - info.lastPing > this.config.heartbeatTimeoutMs) {
          // Connection is dead
          const ws = this.connections.get(id);
          if (ws) ws.terminate();
          this.handleClose(id);
        } else {
          // Send ping
          const ws = this.connections.get(id);
          if (ws && ws.readyState === 1) {
            ws.ping();
          }
        }
      }
    }, this.config.heartbeatIntervalMs);
  }

  /**
   * Graceful shutdown: close all connections and stop listening.
   */
  async shutdown(): Promise<void> {
    this.delivery.stopSweep();

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    // Send close frame to all connections
    for (const [id, ws] of this.connections) {
      try {
        ws.close(1001, 'Server shutting down');
      } catch {
        ws.terminate();
      }
      this.handleClose(id);
    }

    // Close WebSocket server
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    // Close HTTP server
    if (this.httpServer) {
      await new Promise<void>((resolve) => {
        this.httpServer!.close(() => resolve());
      });
      this.httpServer = null;
    }
  }
}
