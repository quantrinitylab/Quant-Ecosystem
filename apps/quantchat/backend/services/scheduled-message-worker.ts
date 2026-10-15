// ============================================================================
// QuantChat - Scheduled Message Delivery Worker (Task 12.4, Requirement 11.4)
//
// Persists scheduled messages (via the route) and delivers them at their
// scheduled time. The worker polls every 30s; because the polling interval
// (30s) is strictly less than the 60s delivery-tolerance requirement, any
// PENDING message whose scheduledFor time has passed is delivered well within
// 60 seconds of its scheduled time.
//
// QC-F-095: before delivering, the worker re-checks that the scheduler is
// still an active member of the conversation (the same gate
// MessageService.sendMessage applies). Membership can end between creation
// and delivery; a deterministic gate failure flips the row to CANCELLED
// (terminal) instead of injecting the message or retrying forever.
//
// QC-F-095 AMEND (worker races): delivery is a SINGLE atomic
// authorization/claim operation inside one transaction:
//
//   1. Atomic claim — a conditional updateMany (status PENDING → SENT)
//      is the compare-and-swap. Every app replica runs a worker and polls
//      the same due rows; only the worker whose update still matches
//      PENDING owns the row. The update takes the row lock until commit,
//      so a concurrent claim waits and then matches zero rows once the
//      winner's outcome (SENT or CANCELLED) is visible — exactly one
//      Message is ever created per scheduled row, and terminal states
//      cannot be overwritten by a racing worker. (The status enum has no
//      intermediate value, so the claim writes SENT directly; the write
//      is invisible outside the transaction until commit, and any failure
//      below rolls it back to PENDING.)
//   2. Membership re-check INSIDE the transaction, after the claim. A
//      removal that commits after the poll — even after this worker's
//      earlier reads — is observed here, before any Message exists: the
//      row flips to CANCELLED and the transaction COMMITS that outcome
//      (it is a normal branch, not a throw), so a gate failure can never
//      be rolled back into a poison-row retry loop.
//   3. Message creation + conversation touch, still inside the same
//      transaction, only for a claimed row whose scheduler is an active
//      member.
//
// A transient failure anywhere in the transaction (DB down, lookup throw)
// rolls everything back: the row returns to PENDING and the next tick
// retries it. A transient problem never cancels a real schedule.
//
// QC-F-359: this worker does NOT route through MessageService.sendMessage
// (it creates the Message directly, below), so the blocked-pair send
// gate lives here too — deliberately, as its own gate on the same
// semantics, not as an accidental bypass a future reader should "fix"
// by rerouting. Before creating the Message, a DIRECT conversation's
// pair is checked in both block directions via PrivacyService
// (constructed directly on the transaction client — the getPrivacyService
// WeakMap cannot key a per-transaction object). 'blocked' is a
// deterministic gate failure in the QC-F-095 sense: the row flips to
// CANCELLED and the transaction COMMITS (no Message, no onDelivered).
// 'unavailable' (malformed block list, failed lookup) is transient:
// the throw rolls the transaction back, the row stays PENDING, and
// the next tick retries — a transient problem never cancels a real
// schedule, and a possibly-blocked message is never delivered on an
// unproven verdict. The gate reads the block state AT DELIVERY TIME:
// a block placed after scheduling still stops the delivery.
// ============================================================================

import type { PrismaClient } from '@prisma/client';
import { PrivacyService } from './privacy.service';

export const SCHEDULED_POLL_INTERVAL_MS = 30_000; // 30s — < 60s tolerance
export const SCHEDULED_DELIVERY_TOLERANCE_MS = 60_000; // 60s (Req 11.4)

export interface ScheduledMessageRecord {
  id: string;
  userId: string;
  conversationId: string;
  content: string;
  scheduledFor: Date;
}

// Structural Prisma surface for the worker. Declared locally (rather than using
// the generated PrismaClient type) so this module typechecks independently of
// the generated client version — mirroring the pattern in routes/avatar.ts.
interface SchedulerTxClient {
  conversationMember: {
    findFirst: (args: {
      where: { conversationId: string; userId: string; leftAt: null };
    }) => Promise<{ id: string } | null>;
    /** QC-F-359: peer derivation for the blocked-pair gate. */
    findMany: (args: {
      where: { conversationId: string; leftAt: null };
      select?: { userId: true };
    }) => Promise<Array<{ userId: string }>>;
  };
  message: { create: (args: unknown) => Promise<unknown> };
  conversation: {
    update: (args: unknown) => Promise<unknown>;
    /** QC-F-359: conversation-type authority for the blocked-pair gate. */
    findUnique: (args: {
      where: { id: string };
      select?: { type: true };
    }) => Promise<{ type: string } | null>;
  };
  /** QC-F-359: PrivacyService's block-list reads (checkBlockedBy). */
  user: {
    findUnique: (args: {
      where: { id: string };
      select?: { preferences: true };
    }) => Promise<{ preferences: unknown } | null>;
  };
  scheduledMessage: {
    /** Atomic claim: resolves with count 1 only if the row still matched. */
    updateMany: (args: {
      where: { id: string; status: string };
      data: { status: string };
    }) => Promise<{ count: number }>;
    update: (args: unknown) => Promise<unknown>;
  };
}

export interface SchedulerPrisma {
  scheduledMessage: {
    findMany: (args: {
      where: { status: string; scheduledFor: { lte: Date } };
      orderBy?: unknown;
    }) => Promise<ScheduledMessageRecord[]>;
  };
  $transaction: <T>(fn: (tx: SchedulerTxClient) => Promise<T>) => Promise<T>;
}

/** Accepts either a real PrismaClient or the structural SchedulerPrisma. */
export type SchedulerPrismaLike = SchedulerPrisma | PrismaClient;

export interface ScheduledWorkerOptions {
  intervalMs?: number;
  /** Hook invoked after a message is successfully delivered (e.g. WS broadcast). */
  onDelivered?: (record: ScheduledMessageRecord) => void;
  /** Error sink so a single failing delivery never stops the worker loop. */
  onError?: (error: unknown, record?: ScheduledMessageRecord) => void;
}

/** Outcome of one atomic delivery attempt for a due row. */
type DeliveryOutcome = 'delivered' | 'cancelled' | 'skipped';

export class ScheduledMessageWorker {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private readonly intervalMs: number;

  constructor(
    private readonly prisma: SchedulerPrisma,
    private readonly options: ScheduledWorkerOptions = {},
  ) {
    this.intervalMs = options.intervalMs ?? SCHEDULED_POLL_INTERVAL_MS;
  }

  /** Start the polling loop. Safe to call once; subsequent calls are no-ops. */
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, this.intervalMs);
    // Don't keep the process alive solely for this timer.
    if (typeof this.timer === 'object' && 'unref' in this.timer) {
      (this.timer as { unref: () => void }).unref();
    }
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Deliver every due PENDING message. Exposed (and accepts `now`) so it can be
   * driven deterministically from tests without real timers.
   * Returns the number of messages delivered this tick.
   */
  async tick(now: Date = new Date()): Promise<number> {
    if (this.running) return 0; // prevent overlapping ticks on THIS instance;
    // other replicas are excluded by the atomic claim inside deliverOne().
    this.running = true;
    let delivered = 0;
    try {
      const due = await this.prisma.scheduledMessage.findMany({
        where: { status: 'PENDING', scheduledFor: { lte: now } },
        orderBy: { scheduledFor: 'asc' },
      });

      for (const record of due) {
        try {
          const outcome = await this.deliverOne(record);
          if (outcome === 'delivered') {
            this.options.onDelivered?.(record);
            delivered++;
          }
          // 'cancelled' (gate failure) and 'skipped' (another replica won
          // the claim) are normal outcomes: no hooks, no error, and the row
          // is never picked up by this worker again.
        } catch (error) {
          this.options.onError?.(error, record);
        }
      }
    } catch (error) {
      this.options.onError?.(error);
    } finally {
      this.running = false;
    }
    return delivered;
  }

  /**
   * The single atomic authorization/claim operation (see the file header).
   * Runs entirely inside one transaction:
   *
   * - Claim matches zero rows → the row already left PENDING (delivered or
   *   cancelled by a racing worker, or claimed-and-committed first): skip.
   * - Membership lookup inside the transaction returns null → deterministic
   *   failure (never a member, left/was removed since scheduling — including
   *   a removal that committed after this tick's poll — conversation
   *   hard-deleted, or the conversationId never existed): flip the claimed
   *   row to CANCELLED and COMMIT. No Message is created, onDelivered /
   *   onError do not fire, and the row is never picked up again.
   * - Membership lookup throws → transient failure: the throw aborts the
   *   transaction, the claim rolls back with it, and the row stays PENDING
   *   for the next tick. A transient DB problem must never cancel real
   *   schedules.
   */
  private async deliverOne(record: ScheduledMessageRecord): Promise<DeliveryOutcome> {
    return this.prisma.$transaction(async (tx) => {
      // 1. Atomic claim (compare-and-swap on the PENDING status).
      const claim = await tx.scheduledMessage.updateMany({
        where: { id: record.id, status: 'PENDING' },
        data: { status: 'SENT' },
      });
      if (claim.count === 0) {
        return 'skipped';
      }

      // 2. Authorization, re-checked inside the transaction, after the claim.
      const membership = await tx.conversationMember.findFirst({
        where: { conversationId: record.conversationId, userId: record.userId, leftAt: null },
      });
      if (!membership) {
        await tx.scheduledMessage.update({
          where: { id: record.id },
          data: { status: 'CANCELLED' },
        });
        return 'cancelled';
      }

      // 2b. QC-F-359 blocked-pair gate (see the file header). DIRECT
      // only, both directions, delivery-time state. A lookup that
      // throws (or a missing conversation row) propagates out of this
      // callback: the transaction rolls back and the row stays
      // PENDING — transient, never a cancellation.
      const conversation = await tx.conversation.findUnique({
        where: { id: record.conversationId },
        select: { type: true },
      });
      if (!conversation) {
        throw new Error(
          `Scheduled delivery gate: conversation ${record.conversationId} not found`,
        );
      }
      if (conversation.type === 'DIRECT') {
        const activeMembers = await tx.conversationMember.findMany({
          where: { conversationId: record.conversationId, leftAt: null },
          select: { userId: true },
        });
        const peerIds = activeMembers
          .map((m) => m.userId)
          .filter((userId) => userId !== record.userId);
        if (peerIds.length > 0) {
          // Direct construction on the tx client (see header): the
          // shared-instance WeakMap must not cache a per-transaction
          // object, and checkBlockedBy only needs user.findUnique.
          const privacy = new PrivacyService(tx as never);
          let sawUnavailable = false;
          let blocked = false;
          for (const peerId of peerIds) {
            const peerBlockedScheduler = await privacy.checkBlockedBy(
              peerId,
              record.userId,
            );
            if (peerBlockedScheduler === 'blocked') blocked = true;
            if (peerBlockedScheduler === 'unavailable') sawUnavailable = true;

            const schedulerBlockedPeer = await privacy.checkBlockedBy(
              record.userId,
              peerId,
            );
            if (schedulerBlockedPeer === 'blocked') blocked = true;
            if (schedulerBlockedPeer === 'unavailable') sawUnavailable = true;
          }
          if (blocked) {
            // Deterministic: same CANCELLED + commit path as the
            // membership failure above. A real block never hides
            // behind a transient-looking 503 retry loop.
            await tx.scheduledMessage.update({
              where: { id: record.id },
              data: { status: 'CANCELLED' },
            });
            return 'cancelled';
          }
          if (sawUnavailable) {
            throw new Error(
              'Scheduled delivery gate: block status unavailable (transient — row stays PENDING)',
            );
          }
        }
      }

      // 3. Deliver. The row's status is already SENT from the claim; commit
      // publishes the Message and the status atomically together.
      await tx.message.create({
        data: {
          conversationId: record.conversationId,
          senderId: record.userId,
          content: record.content,
          type: 'TEXT',
        },
      });
      await tx.conversation.update({
        where: { id: record.conversationId },
        data: { lastMessageAt: new Date() },
      });
      return 'delivered';
    });
  }
}
