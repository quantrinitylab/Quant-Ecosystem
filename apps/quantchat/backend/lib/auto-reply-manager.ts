// ============================================================================
// QuantChat - Auto-Reply Manager (Task 12.9, Requirement 11.9)
//
// Tracks the queue of in-flight (unsent) AI responses, keyed PER USER +
// conversation (QC-F-067). When auto-reply is disabled for a user in a
// conversation, the manager immediately:
//   1. stops further generation for that user (the persisted gate lives in
//      AutoReplyService; this manager mirrors it for in-flight tracking), and
//   2. cancels every queued unsent AI response for that user+conversation.
//
// Only the enablement *mirror* + queue live here, in memory. The durable
// per-user enablement itself is persisted by AutoReplyService in
// `User.preferences.chatSettings.autoReply.conversationIds` — this class
// deliberately holds no source of truth (pre-QC-F-067 it WAS the only
// store: a global per-conversation Set, so one user's toggle silently
// armed/disarmed auto-reply for every member and a restart wiped it).
// ============================================================================

export type QueuedStatus = 'pending' | 'sent' | 'cancelled';

export interface QueuedResponse {
  ticketId: string;
  userId: string;
  conversationId: string;
  status: QueuedStatus;
  enqueuedAt: number;
}

const keyOf = (userId: string, conversationId: string) => `${userId}::${conversationId}`;

export class AutoReplyManager {
  private readonly enabled = new Set<string>();
  private readonly queue = new Map<string, QueuedResponse>();
  private seq = 0;

  /** Enable auto-reply for one user in one conversation. */
  enable(userId: string, conversationId: string): void {
    this.enabled.add(keyOf(userId, conversationId));
  }

  /**
   * Disable auto-reply for one user in one conversation and cancel all of
   * that user's queued unsent responses for it. Returns the number of
   * responses that were cancelled. Other users in the same conversation
   * are unaffected.
   */
  disable(userId: string, conversationId: string): number {
    this.enabled.delete(keyOf(userId, conversationId));
    let cancelled = 0;
    for (const entry of this.queue.values()) {
      if (
        entry.userId === userId &&
        entry.conversationId === conversationId &&
        entry.status === 'pending'
      ) {
        entry.status = 'cancelled';
        cancelled++;
      }
    }
    return cancelled;
  }

  isEnabled(userId: string, conversationId: string): boolean {
    return this.enabled.has(keyOf(userId, conversationId));
  }

  /** Register an in-flight AI response and return its tracking ticket. */
  enqueue(userId: string, conversationId: string): QueuedResponse {
    const ticketId = `ar_${Date.now().toString(36)}_${(this.seq++).toString(36)}`;
    const entry: QueuedResponse = {
      ticketId,
      userId,
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

  /** Snapshot of pending responses for one user in one conversation (testing/inspection). */
  pendingFor(userId: string, conversationId: string): QueuedResponse[] {
    return [...this.queue.values()].filter(
      (e) => e.userId === userId && e.conversationId === conversationId && e.status === 'pending',
    );
  }

  /** Drop terminal entries to keep the in-memory map bounded. */
  prune(): void {
    for (const [id, entry] of this.queue.entries()) {
      if (entry.status !== 'pending') this.queue.delete(id);
    }
  }
}
