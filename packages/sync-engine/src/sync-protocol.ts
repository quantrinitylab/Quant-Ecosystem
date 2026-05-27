import { z } from 'zod';

export const SyncMessageTypeSchema = z.enum(['sync_request', 'sync_response', 'update', 'ack']);

export type SyncMessageType = z.infer<typeof SyncMessageTypeSchema>;

export const SyncMessageSchema = z.object({
  type: SyncMessageTypeSchema,
  documentId: z.string().min(1),
  payload: z.instanceof(Uint8Array).optional(),
  timestamp: z.number(),
  messageId: z.string().min(1),
});

export type SyncMessage = z.infer<typeof SyncMessageSchema>;

export const ReconnectConfigSchema = z.object({
  maxRetries: z.number().int().positive().default(5),
  baseDelay: z.number().positive().default(1000),
  maxDelay: z.number().positive().default(30000),
});

export type ReconnectConfig = z.input<typeof ReconnectConfigSchema>;

export const SyncProtocolConfigSchema = z.object({
  wsUrl: z.string().url(),
  httpUrl: z.string().url(),
  reconnect: ReconnectConfigSchema.optional().default({}),
  httpPollInterval: z.number().positive().default(5000),
  maxQueueSize: z.number().int().positive().default(1000),
});

export type SyncProtocolConfig = z.input<typeof SyncProtocolConfigSchema>;

type SyncProtocolConfigParsed = z.output<typeof SyncProtocolConfigSchema>;

export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'http_fallback';

export interface IWebSocket {
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  onclose: (() => void) | null;
  onerror: ((error: unknown) => void) | null;
}

export type WebSocketFactory = (url: string) => IWebSocket;

export type MessageHandler = (message: SyncMessage) => void;

export type ErrorHandler = (error: unknown) => void;

export type ConnectionStateChangeCallback = (state: ConnectionState) => void;

export class SyncProtocol {
  private readonly config: SyncProtocolConfigParsed;
  private connectionState: ConnectionState = 'disconnected';
  private ws: IWebSocket | null = null;
  private readonly messageHandlers: Set<MessageHandler> = new Set();
  private readonly messageQueue: SyncMessage[] = [];
  private retryCount = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private wsFactory: WebSocketFactory | null = null;
  private httpSender: ((message: SyncMessage) => Promise<void>) | null = null;
  private readonly errorHandlers: Set<ErrorHandler> = new Set();
  private _errorCount = 0;
  private readonly connectionStateChangeHandlers: Set<ConnectionStateChangeCallback> = new Set();

  constructor(config: SyncProtocolConfig) {
    this.config = SyncProtocolConfigSchema.parse(config);
  }

  get errorCount(): number {
    return this._errorCount;
  }

  setWebSocketFactory(factory: WebSocketFactory): void {
    this.wsFactory = factory;
  }

  setHttpSender(sender: (message: SyncMessage) => Promise<void>): void {
    this.httpSender = sender;
  }

  onError(handler: ErrorHandler): () => void {
    this.errorHandlers.add(handler);
    return () => {
      this.errorHandlers.delete(handler);
    };
  }

  onConnectionStateChange(callback: ConnectionStateChangeCallback): () => void {
    this.connectionStateChangeHandlers.add(callback);
    return () => {
      this.connectionStateChangeHandlers.delete(callback);
    };
  }

  connect(): void {
    if (this.connectionState === 'connected' || this.connectionState === 'connecting') {
      return;
    }
    this.setConnectionState('connecting');
    this.attemptWebSocketConnection();
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this.setConnectionState('disconnected');
    this.retryCount = 0;
  }

  send(message: SyncMessage): void {
    const validated = SyncMessageSchema.parse(message);
    if (this.connectionState === 'connected' && this.ws) {
      this.ws.send(JSON.stringify(validated));
    } else if (this.connectionState === 'http_fallback' && this.httpSender) {
      void this.httpSender(validated);
    } else {
      if (this.messageQueue.length >= this.config.maxQueueSize) {
        this.messageQueue.shift();
      }
      this.messageQueue.push(validated);
    }
  }

  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => {
      this.messageHandlers.delete(handler);
    };
  }

  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  getQueuedMessages(): SyncMessage[] {
    return [...this.messageQueue];
  }

  private attemptWebSocketConnection(): void {
    if (!this.wsFactory) {
      this.activateHttpFallback();
      return;
    }

    try {
      this.ws = this.wsFactory(this.config.wsUrl);
    } catch {
      this.handleConnectionFailure();
      return;
    }

    this.ws.onopen = () => {
      this.setConnectionState('connected');
      this.retryCount = 0;
      this.flushQueue();
    };

    this.ws.onmessage = (event: { data: string }) => {
      try {
        const parsed = JSON.parse(event.data) as Record<string, unknown>;
        // Reconstruct Uint8Array from payload if it was serialized
        if (parsed['payload'] && typeof parsed['payload'] === 'object') {
          const payloadObj = parsed['payload'] as Record<string, unknown>;
          if (payloadObj['type'] === 'Buffer' && Array.isArray(payloadObj['data'])) {
            parsed['payload'] = new Uint8Array(payloadObj['data'] as number[]);
          }
        }
        const message = SyncMessageSchema.parse(parsed);
        for (const handler of this.messageHandlers) {
          handler(message);
        }
      } catch (error: unknown) {
        this._errorCount++;
        for (const handler of this.errorHandlers) {
          handler(error);
        }
      }
    };

    this.ws.onclose = () => {
      this.ws = null;
      this.handleConnectionFailure();
    };

    this.ws.onerror = () => {
      // Error will be followed by close event
    };
  }

  private handleConnectionFailure(): void {
    const { maxRetries, baseDelay, maxDelay } = this.config.reconnect;
    if (this.retryCount >= maxRetries) {
      this.activateHttpFallback();
      return;
    }

    this.setConnectionState('reconnecting');
    const delay = Math.min(baseDelay * Math.pow(2, this.retryCount), maxDelay);
    this.retryCount++;

    this.reconnectTimer = setTimeout(() => {
      this.attemptWebSocketConnection();
    }, delay);
  }

  private activateHttpFallback(): void {
    this.setConnectionState('http_fallback');
    this.flushQueue();
    this.startHttpPolling();
  }

  // HTTP polling simulates server-side push for environments without WebSocket.
  // The polling timer fires but the actual data fetching is intentionally left
  // for consumers to integrate via setHttpSender(). The structure is sound but
  // the poll body does not fetch data on its own.
  private startHttpPolling(): void {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
    }
    this.pollTimer = setTimeout(() => {
      // Placeholder: In a full implementation, this would poll the HTTP endpoint
      // for inbound messages. Consumers should provide data fetching logic externally.
      if (this.connectionState === 'http_fallback') {
        this.startHttpPolling();
      }
    }, this.config.httpPollInterval);
  }

  private flushQueue(): void {
    if (this.connectionState === 'connected' && this.ws) {
      while (this.messageQueue.length > 0) {
        const message = this.messageQueue.shift()!;
        this.ws.send(JSON.stringify(message));
      }
    } else if (this.connectionState === 'http_fallback' && this.httpSender) {
      while (this.messageQueue.length > 0) {
        const message = this.messageQueue.shift()!;
        void this.httpSender(message);
      }
    }
    // If neither delivery path is available, messages remain in the queue
  }

  private setConnectionState(state: ConnectionState): void {
    if (this.connectionState !== state) {
      this.connectionState = state;
      for (const callback of this.connectionStateChangeHandlers) {
        callback(state);
      }
    }
  }
}
