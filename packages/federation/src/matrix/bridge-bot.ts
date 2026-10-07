import pino from 'pino';
import { RoomMapper } from './room-mapper.js';

export interface QuantMessage {
  conversationId: string;
  senderId: string;
  content: string;
}

export interface MatrixEvent {
  roomId: string;
  sender: string;
  content: string;
}

export interface ForwardedMessage {
  direction: 'quant-to-matrix' | 'matrix-to-quant';
  source: string;
  destination: string;
  content: string;
  timestamp: number;
}

export interface BridgeResult {
  forwarded: boolean;
  reason?: string;
}

export interface MatrixBridgeConfig {
  homeserverUrl: string;
  botToken: string;
}

/**
 * MatrixBridgeBot connects Quant conversations to Matrix rooms.
 *
 * When MATRIX_HOMESERVER_URL and MATRIX_BOT_TOKEN environment variables are set,
 * the bot uses the matrix-bot-sdk to connect to a real Matrix homeserver and forward
 * messages bidirectionally. When these variables are not set, it operates in
 * simulation mode using an in-memory message store for development and testing.
 */
export class MatrixBridgeBot {
  private roomMapper: RoomMapper;
  private forwardedMessages: ForwardedMessage[] = [];
  private autoCreateRooms: boolean;
  private matrixClient: unknown | null = null;
  private config: MatrixBridgeConfig | null = null;
  private logger = pino({ name: 'matrix-bridge-bot' });
  private started = false;
  private connected = false;
  private botUserId: string | null = null;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(roomMapper?: RoomMapper, options?: { autoCreateRooms?: boolean }) {
    this.roomMapper = roomMapper ?? new RoomMapper();
    this.autoCreateRooms = options?.autoCreateRooms ?? true;

    const homeserverUrl = process.env['MATRIX_HOMESERVER_URL'];
    const botToken = process.env['MATRIX_BOT_TOKEN'];

    if (homeserverUrl && botToken) {
      this.config = { homeserverUrl, botToken };
    }
  }

  /**
   * Start the Matrix client connection. Only connects when environment
   * variables are properly configured. Safe to call when not configured
   * (no-op in simulation mode).
   */
  async start(): Promise<void> {
    if (!this.config) {
      this.logger.info('Matrix bridge running in simulation mode (no MATRIX_HOMESERVER_URL set)');
      return;
    }

    try {
      // Dynamic import to avoid requiring matrix-bot-sdk when running in simulation
      const { MatrixClient, AutojoinRoomsMixin } = await import('matrix-bot-sdk');

      const client = new MatrixClient(this.config.homeserverUrl, this.config.botToken);
      AutojoinRoomsMixin.setupOnClient(client);

      client.on('room.message', (roomId: string, event: Record<string, unknown>) => {
        if (!event || !event['content']) return;
        const sender = event['sender'] as string;
        const content = (event['content'] as Record<string, unknown>)['body'] as string;

        if (!content || !sender) return;

        // Ignore messages sent by the bot itself
        if (sender === this.botUserId) return;

        this.handleIncomingMatrixMessage(roomId, sender, content);
      });

      // Listen for sync errors and connection drops to trigger reconnection
      client.on('sync.error', (err: unknown) => {
        this.logger.error({ err }, 'Matrix sync error detected');
        this.handleDisconnect();
      });

      client.on('error', (err: unknown) => {
        this.logger.error({ err }, 'Matrix client error detected');
        this.handleDisconnect();
      });

      await client.start();
      this.matrixClient = client;
      this.botUserId = await client.getUserId();
      this.started = true;
      this.connected = true;
      this.reconnectAttempts = 0;
      this.logger.info({ homeserver: this.config.homeserverUrl }, 'Matrix bridge connected');
    } catch (err) {
      this.logger.error({ err }, 'Failed to start Matrix client, falling back to simulation mode');
      this.matrixClient = null;
      this.connected = false;
    }
  }

  /**
   * Stop the Matrix client connection gracefully.
   */
  async stop(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.matrixClient && this.started) {
      try {
        await (this.matrixClient as { stop: () => Promise<void> }).stop();
      } catch {
        // Ignore stop errors
      }
      this.matrixClient = null;
      this.started = false;
      this.connected = false;
      this.logger.info('Matrix bridge disconnected');
    }
  }

  /**
   * Returns true when connected to a real Matrix homeserver.
   */
  isConnected(): boolean {
    return this.matrixClient !== null && this.started && this.connected;
  }

  /**
   * Handle a message originating from the Quant platform destined for Matrix.
   */
  onQuantMessage(message: QuantMessage): void {
    let matrixRoom = this.roomMapper.getMatrixRoom(message.conversationId);

    if (!matrixRoom && this.autoCreateRooms) {
      matrixRoom = `!auto-${message.conversationId}:matrix.local`;
      this.roomMapper.createMapping(message.conversationId, matrixRoom, 'dm');
    }

    if (matrixRoom) {
      this.forwardedMessages.push({
        direction: 'quant-to-matrix',
        source: message.conversationId,
        destination: matrixRoom,
        content: message.content,
        timestamp: Date.now(),
      });

      // Send to real Matrix room when connected
      if (this.matrixClient && this.started) {
        this.sendToMatrix(matrixRoom, message.content).catch((err) => {
          this.logger.error({ err, roomId: matrixRoom }, 'Failed to send message to Matrix');
        });
      }
    }
  }

  /**
   * Handle a message originating from Matrix destined for Quant.
   */
  onMatrixMessage(event: MatrixEvent): BridgeResult {
    const quantConv = this.roomMapper.getQuantConversation(event.roomId);

    if (quantConv) {
      this.forwardedMessages.push({
        direction: 'matrix-to-quant',
        source: event.roomId,
        destination: quantConv,
        content: event.content,
        timestamp: Date.now(),
      });
      return { forwarded: true };
    }

    return { forwarded: false, reason: `No mapping for room ${event.roomId}` };
  }

  /**
   * Get the history of forwarded messages (both directions).
   */
  getForwardedMessages(): ForwardedMessage[] {
    return [...this.forwardedMessages];
  }

  /**
   * Access the underlying RoomMapper instance.
   */
  getRoomMapper(): RoomMapper {
    return this.roomMapper;
  }

  // --- Private methods ---

  private handleIncomingMatrixMessage(roomId: string, sender: string, content: string): void {
    this.onMatrixMessage({ roomId, sender, content });
  }

  private async sendToMatrix(roomId: string, content: string): Promise<void> {
    if (!this.matrixClient) return;

    const client = this.matrixClient as {
      sendMessage: (roomId: string, content: Record<string, unknown>) => Promise<string>;
    };

    await client.sendMessage(roomId, {
      msgtype: 'm.text',
      body: content,
    });
  }

  /**
   * Handle a detected disconnect from the Matrix homeserver.
   * Marks the connection as down and schedules a reconnection attempt
   * with exponential backoff.
   */
  private handleDisconnect(): void {
    if (!this.connected) return; // Already handling a disconnect

    this.connected = false;
    this.logger.warn('Matrix bridge connection lost, scheduling reconnection');
    this.scheduleReconnect();
  }

  /**
   * Schedule a reconnection attempt with exponential backoff.
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.logger.error(
        { attempts: this.reconnectAttempts },
        'Max reconnect attempts reached, giving up. Manual restart required.',
      );
      return;
    }

    // Exponential backoff: 1s, 2s, 4s, 8s, 16s
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;

    this.logger.info(
      { attempt: this.reconnectAttempts, delayMs: delay },
      'Scheduling Matrix reconnection attempt',
    );

    this.reconnectTimer = setTimeout(() => {
      this.attemptReconnect().catch((err) => {
        this.logger.error({ err }, 'Reconnection attempt failed');
        this.scheduleReconnect();
      });
    }, delay);
  }

  /**
   * Attempt to reconnect to the Matrix homeserver by stopping
   * the old client and starting fresh.
   */
  private async attemptReconnect(): Promise<void> {
    // Stop existing client if any
    if (this.matrixClient) {
      try {
        await (this.matrixClient as { stop: () => Promise<void> }).stop();
      } catch {
        // Ignore stop errors during reconnect
      }
      this.matrixClient = null;
    }

    this.started = false;

    // Re-use the start() logic
    await this.start();

    if (this.connected) {
      this.logger.info('Matrix bridge reconnected successfully');
    }
  }
}
