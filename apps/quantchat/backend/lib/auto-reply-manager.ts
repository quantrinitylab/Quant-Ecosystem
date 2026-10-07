// ============================================================================
// QuantChat - Auto-Reply Manager (Task 12.9, Requirement 11.9)
//
// Tracks per-conversation auto-reply enablement and the queue of in-flight
// (unsent) AI responses. When auto-reply is disabled for a conversation, the
// manager immediately:
//   1. stops further generation (isEnabled() returns false), and
//   2. cancels every queued unsent AI response for that conversation.
//
// In-memory only (no new persistence — Req 9.5), decorated once at boot.
// ============================================================================

export type QueuedStatus = 'pending' | 'sent' | 'cancelled';

export interface QueuedResponse {
  ticketId: string;
  conversationId: string;
  status: QueuedStatus;
  enqueuedAt: number;
}

export class AutoReplyManager {
  private readonly enabled = new Set<string>();
  private readonly queue = new Map<string, QueuedResponse>();
  private seq = 0;

  /** Enable auto-reply for a conversation. */
  enable(conversationId: string): void {
    this.enabled.add(conversationId);
  }

  /**
   * Disable auto-reply for a conversation and cancel all queued unsent
   * responses for it. Returns the number of responses that were cancelled.
   */
  disable(conversationId: string): number {
    this.enabled.delete(conversationId);
    let cancelled = 0;
    for (const entry of this.queue.values()) {
      if (entry.conversationId === conversationId && entry.status === 'pending') {
        entry.status = 'cancelled';
        cancelled++;
      }
    }
    return cancelled;
  }

  isEnabled(conversationId: string): boolean {
    return this.enabled.has(conversationId);
  }

  /** Register an in-flight AI response and return its tracking ticket. */
  enqueue(conversationId: string): QueuedResponse {
    const ticketId = `ar_${Date.now().toString(36)}_${(this.seq++).toString(36)}`;
    const entry: QueuedResponse = {
      ticketId,
      conversationId,
      status: 'pending',
      enqueuedAt: Date.now(),
    };
    this.queue.set(ticketId, entry);
    return entry;
  }

  /** True only while the ticket is still pending (not cancelled by a disable). */
  isPending(ticketId: string): boolean {
    return this.queue.get(ticketId)?.status === 'pending';
  }

  /**
   * Mark a ticket as sent. Returns false if it was already cancelled (the
   * caller MUST NOT deliver the response in that case).
   */
  markSent(ticketId: string): boolean {
    const entry = this.queue.get(ticketId);
    if (!entry || entry.status === 'cancelled') return false;
    entry.status = 'sent';
    return true;
  }

  /** Cancel a single in-flight response (e.g. the incoming message was retracted). */
  cancel(ticketId: string): boolean {
    const entry = this.queue.get(ticketId);
    if (!entry || entry.status !== 'pending') return false;
    entry.status = 'cancelled';
    return true;
  }

  /** Snapshot of pending responses for a conversation (testing/inspection). */
  pendingFor(conversationId: string): QueuedResponse[] {
    return [...this.queue.values()].filter(
      (e) => e.conversationId === conversationId && e.status === 'pending',
    );
  }

  /** Drop terminal entries to keep the in-memory map bounded. */
  prune(): void {
    for (const [id, entry] of this.queue.entries()) {
      if (entry.status !== 'pending') this.queue.delete(id);
    }
  }
}
