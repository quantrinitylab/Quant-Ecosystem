// ============================================================================
// Realtime - Message Delivery Guarantees
// ============================================================================

import type { MessageEnvelope, DeliveryReceipt } from './types';

/** Delivery configuration */
export interface DeliveryConfig {
  ackTimeoutMs: number;
  maxRetries: number;
  retryIntervalMs: number;
}

/** Pending message awaiting acknowledgement */
interface PendingMessage {
  envelope: MessageEnvelope;
  connectionId: string;
  sentAt: number;
  retries: number;
}

const DEFAULT_DELIVERY_CONFIG: DeliveryConfig = {
  ackTimeoutMs: 5000,
  maxRetries: 3,
  retryIntervalMs: 2000,
};

/**
 * DeliveryManager
 *
 * Implements message delivery guarantees with:
 * - Monotonically increasing sequence numbers per channel
 * - Ack/retry mechanism for reliable delivery
 * - Pending message tracking
 * - Periodic sweep for timed-out messages
 */
export class DeliveryManager {
  private config: DeliveryConfig;
  private sequences: Map<string, number> = new Map();
  private pending: Map<string, PendingMessage> = new Map();
  private sweepTimer: ReturnType<typeof setInterval> | null = null;
  private retrySender: ((connectionId: string, envelope: MessageEnvelope) => void) | null = null;

  constructor(config: Partial<DeliveryConfig> = {}) {
    this.config = { ...DEFAULT_DELIVERY_CONFIG, ...config };
  }

  /**
   * Set the retry sender function (called when messages need to be re-sent).
   */
  setRetrySender(sender: (connectionId: string, envelope: MessageEnvelope) => void): void {
    this.retrySender = sender;
  }

  /**
   * Get the next sequence number for a channel.
   */
  nextSequence(channel: string): number {
    const current = this.sequences.get(channel) || 0;
    const next = current + 1;
    this.sequences.set(channel, next);
    return next;
  }

  /**
   * Get the current sequence number for a channel (without incrementing).
   */
  getSequence(channel: string): number {
    return this.sequences.get(channel) || 0;
  }

  /**
   * Create a message envelope with sequence number.
   */
  createEnvelope(
    channel: string,
    type: string,
    payload: unknown,
    senderId: string,
    requiresAck: boolean = true,
  ): MessageEnvelope {
    const sequence = this.nextSequence(channel);
    return {
      id: `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      sequence,
      channel,
      type,
      payload,
      senderId,
      timestamp: Date.now(),
      requiresAck,
    };
  }

  /**
   * Track a sent message as pending acknowledgement.
   */
  trackSent(connectionId: string, envelope: MessageEnvelope): void {
    if (!envelope.requiresAck) return;
    this.pending.set(envelope.id, {
      envelope,
      connectionId,
      sentAt: Date.now(),
      retries: 0,
    });
  }

  /**
   * Acknowledge a message, removing it from pending.
   */
  acknowledge(receipt: DeliveryReceipt): boolean {
    const pending = this.pending.get(receipt.messageId);
    if (!pending) return false;
    this.pending.delete(receipt.messageId);
    return true;
  }

  /**
   * Get count of pending (unacknowledged) messages.
   */
  getPendingCount(): number {
    return this.pending.size;
  }

  /**
   * Get pending messages for a specific connection.
   */
  getPendingForConnection(connectionId: string): MessageEnvelope[] {
    const result: MessageEnvelope[] = [];
    for (const pending of this.pending.values()) {
      if (pending.connectionId === connectionId) {
        result.push(pending.envelope);
      }
    }
    return result;
  }

  /**
   * Sweep for timed-out messages and retry sending.
   */
  sweep(): void {
    const now = Date.now();
    const toRemove: string[] = [];

    for (const [id, pending] of this.pending) {
      const elapsed = now - pending.sentAt;
      if (elapsed > this.config.ackTimeoutMs) {
        if (pending.retries >= this.config.maxRetries) {
          toRemove.push(id);
        } else {
          pending.retries++;
          pending.sentAt = now;
          if (this.retrySender) {
            this.retrySender(pending.connectionId, pending.envelope);
          }
        }
      }
    }

    for (const id of toRemove) {
      this.pending.delete(id);
    }
  }

  /**
   * Start periodic sweep for unacknowledged messages.
   */
  startSweep(): void {
    this.stopSweep();
    this.sweepTimer = setInterval(() => this.sweep(), this.config.retryIntervalMs);
  }

  /**
   * Stop the periodic sweep.
   */
  stopSweep(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
  }

  /**
   * Remove all pending messages for a disconnected connection.
   */
  clearConnection(connectionId: string): void {
    const toRemove: string[] = [];
    for (const [id, pending] of this.pending) {
      if (pending.connectionId === connectionId) {
        toRemove.push(id);
      }
    }
    for (const id of toRemove) {
      this.pending.delete(id);
    }
  }

  /**
   * Reset all state.
   */
  reset(): void {
    this.stopSweep();
    this.pending.clear();
    this.sequences.clear();
  }
}
