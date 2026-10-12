// ============================================================================
// QuantChat - Scheduled Message Delivery Worker (Task 12.4, Requirement 11.4)
//
// Persists scheduled messages (via the route) and delivers them at their
// scheduled time. The worker polls every 30s; because the polling interval
// (30s) is strictly less than the 60s delivery-tolerance requirement, any
// PENDING message whose scheduledFor time has passed is delivered well within
// 60 seconds of its scheduled time.
//
// On delivery the worker creates a real Message and flips the schedule status
// to SENT in a single transaction, making the operation idempotent across ticks.
//
// QC-F-095: before delivering, the worker re-checks that the scheduler is
// still an active member of the conversation (the same gate
// MessageService.sendMessage applies). Membership can end between creation
// and delivery; a deterministic gate failure flips the row to CANCELLED
// (terminal) instead of injecting the message or retrying forever.
// ============================================================================

import type { PrismaClient } from '@prisma/client';

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
  message: { create: (args: unknown) => Promise<unknown> };
  conversation: { update: (args: unknown) => Promise<unknown> };
  scheduledMessage: { update: (args: unknown) => Promise<unknown> };
}

export interface SchedulerPrisma {
  conversationMember: {
    findFirst: (args: {
      where: { conversationId: string; userId: string; leftAt: null };
    }) => Promise<{ id: string } | null>;
  };
  scheduledMessage: {
    findMany: (args: {
      where: { status: string; scheduledFor: { lte: Date } };
      orderBy?: unknown;
    }) => Promise<ScheduledMessageRecord[]>;
    update: (args: unknown) => Promise<unknown>;
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
    if (this.running) return 0; // prevent overlapping ticks
    this.running = true;
    let delivered = 0;
    try {
      const due = await this.prisma.scheduledMessage.findMany({
        where: { status: 'PENDING', scheduledFor: { lte: now } },
        orderBy: { scheduledFor: 'asc' },
      });

      for (const record of due) {
        try {
          if (!(await this.passesDeliveryGate(record))) {
            continue; // gate-cancelled: not delivered, not an error
          }
          await this.deliver(record);
          this.options.onDelivered?.(record);
          delivered++;
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
   * QC-F-095 delivery gate — runs OUTSIDE the delivery transaction on
   * purpose: if the gate ran inside it, a later rollback would also undo
   * the CANCELLED flip and the row would stay PENDING forever (poison-row
   * retry loop).
   *
   * - Membership lookup returns null → deterministic failure (never a
   *   member, left/was removed since scheduling, conversation hard-deleted,
   *   or the conversationId never existed): flip the row to CANCELLED in
   *   its own update and report "do not deliver". No Message is created,
   *   onDelivered/onError do not fire, and the row is never picked up again.
   * - Membership lookup throws → transient failure: the throw propagates to
   *   tick()'s per-record catch (onError) and the row stays PENDING for the
   *   next tick. A transient DB problem must never cancel real schedules.
   */
  private async passesDeliveryGate(record: ScheduledMessageRecord): Promise<boolean> {
    const membership = await this.prisma.conversationMember.findFirst({
      where: { conversationId: record.conversationId, userId: record.userId, leftAt: null },
    });
    if (membership) {
      return true;
    }
    await this.prisma.scheduledMessage.update({
      where: { id: record.id },
      data: { status: 'CANCELLED' },
    });
    return false;
  }

  private async deliver(record: ScheduledMessageRecord): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
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
      await tx.scheduledMessage.update({
        where: { id: record.id },
        data: { status: 'SENT' },
      });
    });
  }
}
