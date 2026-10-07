// ============================================================================
// Realtime - Backpressure Handling
// ============================================================================

/** Backpressure configuration */
export interface BackpressureConfig {
  highWaterMark: number;
  maxQueueSize: number;
}

/** Backpressure statistics */
export interface BackpressureStats {
  messagesQueued: number;
  messagesDropped: number;
  peakBufferSize: number;
  currentQueueLength: number;
}

/** Interface for a socket with bufferedAmount */
export interface BufferedSocket {
  bufferedAmount: number;
  send(data: string, cb?: (err?: Error) => void): void;
}

const DEFAULT_BACKPRESSURE_CONFIG: BackpressureConfig = {
  highWaterMark: 1024 * 64, // 64KB
  maxQueueSize: 1000,
};

/**
 * BackpressureHandler
 *
 * Manages send-side backpressure for WebSocket connections.
 * When the socket buffer exceeds the high-water mark, messages are queued.
 * On drain, queued messages are flushed.
 * If the queue exceeds max size, oldest messages are dropped.
 */
export class BackpressureHandler {
  private config: BackpressureConfig;
  private queues: Map<string, string[]> = new Map();
  private stats: Map<string, BackpressureStats> = new Map();

  constructor(config: Partial<BackpressureConfig> = {}) {
    this.config = { ...DEFAULT_BACKPRESSURE_CONFIG, ...config };
  }

  /**
   * Attempt to send a message, queuing it if backpressure is detected.
   * Returns true if the message was sent immediately, false if queued.
   */
  send(connectionId: string, socket: BufferedSocket, data: string): boolean {
    const stats = this.getOrCreateStats(connectionId);
    const buffered = socket.bufferedAmount;

    // Track peak buffer
    if (buffered > stats.peakBufferSize) {
      stats.peakBufferSize = buffered;
    }

    if (buffered >= this.config.highWaterMark) {
      // Backpressure: queue the message
      this.enqueue(connectionId, data, stats);
      return false;
    }

    // Send immediately
    socket.send(data);
    return true;
  }

  /**
   * Drain queued messages for a connection when the socket is ready.
   */
  drain(connectionId: string, socket: BufferedSocket): number {
    const queue = this.queues.get(connectionId);
    if (!queue || queue.length === 0) return 0;

    let flushed = 0;
    while (queue.length > 0 && socket.bufferedAmount < this.config.highWaterMark) {
      const message = queue.shift()!;
      socket.send(message);
      flushed++;
    }

    const stats = this.stats.get(connectionId);
    if (stats) {
      stats.currentQueueLength = queue.length;
    }

    return flushed;
  }

  /**
   * Check if a connection has queued messages.
   */
  hasQueuedMessages(connectionId: string): boolean {
    const queue = this.queues.get(connectionId);
    return queue !== undefined && queue.length > 0;
  }

  /**
   * Get stats for a connection.
   */
  getStats(connectionId: string): BackpressureStats {
    return this.getOrCreateStats(connectionId);
  }

  /**
   * Remove all state for a disconnected connection.
   */
  clearConnection(connectionId: string): void {
    this.queues.delete(connectionId);
    this.stats.delete(connectionId);
  }

  /**
   * Get the queue length for a connection.
   */
  getQueueLength(connectionId: string): number {
    return this.queues.get(connectionId)?.length || 0;
  }

  private enqueue(connectionId: string, data: string, stats: BackpressureStats): void {
    if (!this.queues.has(connectionId)) {
      this.queues.set(connectionId, []);
    }
    const queue = this.queues.get(connectionId)!;

    if (queue.length >= this.config.maxQueueSize) {
      // Drop oldest message
      queue.shift();
      stats.messagesDropped++;
    }

    queue.push(data);
    stats.messagesQueued++;
    stats.currentQueueLength = queue.length;
  }

  private getOrCreateStats(connectionId: string): BackpressureStats {
    let stats = this.stats.get(connectionId);
    if (!stats) {
      stats = {
        messagesQueued: 0,
        messagesDropped: 0,
        peakBufferSize: 0,
        currentQueueLength: 0,
      };
      this.stats.set(connectionId, stats);
    }
    return stats;
  }
}
