// ============================================================================
// QuantChat — OutboxService (W3, design Component 3)
// ============================================================================
//
// Transactional outbox for at-least-once message delivery. A delivery intent
// (a `MessageOutbox` row) is written in the SAME database transaction as the
// persisted `Message` (design Algorithm 2), so a crash immediately after the
// `201` response can never lose the intent. A separate DeliveryWorker (Task 12)
// drains the outbox, fanning each recipient to realtime delivery or push.
//
// Concurrency: `claimBatch` runs INSIDE an interactive transaction: it selects
// unprocessed, non-dead-lettered rows with `FOR UPDATE SKIP LOCKED` (raw SQL)
// and stamps a claim lease (`claimedAt` / `leaseExpiresAt`, QC-F-541) on every
// row it returns, in the same transaction. Two workers polling the table in
// parallel therefore never claim the same event while a lease is live — each
// locked or lease-held row is skipped by the other worker rather than blocking
// on it (Requirement 8.1). Declared limit of this guarantee (at-least-once,
// NOT exactly-once): if a worker delivers an event and then crashes BEFORE
// `markProcessed`, the row's lease eventually expires and the event is claimed
// and delivered again. Closing that window needs per-event push idempotency
// in the dispatcher — a separate slice, not claimed here.
// ============================================================================

import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';

/**
 * The Prisma transaction client handed to {@link OutboxService.enqueue}. Using
 * the interactive-transaction client type lets the enqueue run inside the very
 * same transaction that inserts the `Message`, giving the all-or-nothing
 * atomicity guarantee (Requirement 7.1, 7.2).
 */
export type PrismaTx = Prisma.TransactionClient;

/**
 * Maximum number of delivery attempts before an outbox event is treated as
 * dead-lettered and excluded from further claims (Requirement 8.7). Events with
 * `attempts` greater than this value are skipped by {@link OutboxService.claimBatch}.
 */
export const MAX_DELIVERY_ATTEMPTS = 10;

/**
 * Default claim-lease duration for {@link PrismaOutboxService.claimBatch}
 * (QC-F-541). A claimed row stays invisible to other workers until this lease
 * lapses or the claiming worker resolves/releases it. 120s is far above a
 * normal 1s-poll drain tick (up to 100 events per batch, each
 * push dispatch retrying 1s+2s+4s internally) yet short enough that a crashed
 * worker's events are redelivered within minutes, not hours. Overridable via
 * the `QUANTCHAT_OUTBOX_LEASE_MS` env var or the service's constructor options.
 */
export const OUTBOX_CLAIM_LEASE_MS = 120_000;

/** Options for {@link PrismaOutboxService} (all defaulted for production). */
export interface PrismaOutboxServiceOptions {
  /** Claim-lease duration in ms. Defaults to the env override or {@link OUTBOX_CLAIM_LEASE_MS}. */
  leaseMs?: number;
  /** Injectable clock so lease behaviour is testable without real timers. */
  now?: () => Date;
}

/** Resolve the claim-lease duration: explicit option > env override > default. */
function resolveLeaseMs(explicit?: number): number {
  if (explicit !== undefined && Number.isFinite(explicit) && explicit > 0) {
    return Math.floor(explicit);
  }
  const fromEnv = Number(process.env.QUANTCHAT_OUTBOX_LEASE_MS);
  if (Number.isFinite(fromEnv) && fromEnv > 0) {
    return Math.floor(fromEnv);
  }
  return OUTBOX_CLAIM_LEASE_MS;
}

/**
 * A durable delivery intent recorded for a persisted message. Mirrors the
 * `MessageOutbox` Prisma model (public, non-sensitive routing data only — no
 * message content lives here).
 */
export interface OutboxEvent {
  id: string;
  conversationId: string;
  messageId: string;
  recipientIds: string[];
  createdAt: Date;
  processedAt: Date | null;
  attempts: number;
  /** When the current claim lease was taken; null when unclaimed (QC-F-541). */
  claimedAt: Date | null;
  /** When the current claim lease lapses; null when unclaimed (QC-F-541). */
  leaseExpiresAt: Date | null;
}

/**
 * Transactional outbox contract (design Component 3). `enqueue` is called inside
 * the message-insert transaction; `claimBatch`/`markProcessed`/`markFailed` are
 * driven by the DeliveryWorker drain loop.
 */
export interface OutboxService {
  /** Enqueue within an existing Prisma transaction (same tx as the Message insert). */
  enqueue(
    tx: PrismaTx,
    event: Omit<OutboxEvent, 'id' | 'processedAt' | 'attempts' | 'claimedAt' | 'leaseExpiresAt'>,
  ): Promise<void>;
  /** Claim a batch of unprocessed events for a worker (FOR UPDATE SKIP LOCKED). */
  claimBatch(limit: number): Promise<OutboxEvent[]>;
  /**
   * Release a claim without resolving the event (QC-F-541): clears the lease so
   * the event is immediately claimable again. Used by a worker that claimed an
   * event but decided not to attempt it this tick (e.g. its in-process backoff
   * window has not elapsed) — without a release, the lease would silently
   * stretch that event's retry delay to the full lease duration.
   */
  releaseClaim(eventId: string): Promise<void>;
  /** Mark an event processed so it is never claimed again. */
  markProcessed(eventId: string): Promise<void>;
  /** Record a failed attempt: increment attempts and store the last error. */
  markFailed(eventId: string, error: string): Promise<void>;
}

/** Shape of a row returned by the raw `claimBatch` query. */
interface RawOutboxRow {
  id: string;
  conversationId: string;
  messageId: string;
  recipientIds: string[];
  createdAt: Date;
  processedAt: Date | null;
  attempts: number;
  claimedAt: Date | null;
  leaseExpiresAt: Date | null;
}

/**
 * Prisma-backed {@link OutboxService}. The backend remains a zero-knowledge
 * relay: the outbox stores only routing metadata (conversation id, message id,
 * recipient ids) — never message content.
 */
export class PrismaOutboxService implements OutboxService {
  private readonly leaseMs: number;
  private readonly now: () => Date;

  constructor(
    private readonly prisma: PrismaClient,
    options: PrismaOutboxServiceOptions = {},
  ) {
    this.leaseMs = resolveLeaseMs(options.leaseMs);
    this.now = options.now ?? (() => new Date());
  }

  /**
   * Insert a `MessageOutbox` row using the supplied transaction client so the
   * delivery intent commits atomically with the `Message` row (design
   * Algorithm 2). If the surrounding transaction rolls back, no outbox row
   * exists — guaranteeing `count(messages) == count(matching outbox rows)` at
   * every commit boundary (Requirements 7.1, 7.2, 7.4).
   */
  async enqueue(
    tx: PrismaTx,
    event: Omit<OutboxEvent, 'id' | 'processedAt' | 'attempts' | 'claimedAt' | 'leaseExpiresAt'>,
  ): Promise<void> {
    await tx.messageOutbox.create({
      data: {
        conversationId: event.conversationId,
        messageId: event.messageId,
        recipientIds: event.recipientIds,
        createdAt: event.createdAt,
      },
    });
  }

  /**
   * Claim up to `limit` unprocessed, non-dead-lettered outbox events, oldest
   * first (QC-F-541). The whole claim runs inside ONE interactive transaction:
   * the raw SELECT takes `FOR UPDATE SKIP LOCKED` row locks that are now held
   * until commit (previously the SELECT stood alone, so its locks evaporated
   * with the statement and the "claim" reserved nothing), rows under a live
   * claim lease are excluded, and every selected row is stamped with
   * `claimedAt` / `leaseExpiresAt` in the same transaction — the commit is the
   * moment the claim exists. A second worker therefore sees a claimed row only
   * after its lease lapses (the claiming worker crashed) or is cleared
   * (markProcessed / markFailed / releaseClaim). Dead-lettered events
   * (`attempts` exceeding {@link MAX_DELIVERY_ATTEMPTS}) are excluded
   * (Requirements 8.1, 8.7).
   */
  async claimBatch(limit: number): Promise<OutboxEvent[]> {
    const now = this.now();
    const leaseExpiresAt = new Date(now.getTime() + this.leaseMs);

    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<RawOutboxRow[]>(Prisma.sql`
        SELECT "id",
               "conversationId",
               "messageId",
               "recipientIds",
               "attempts",
               "processedAt",
               "createdAt",
               "claimedAt",
               "leaseExpiresAt"
          FROM "message_outbox"
         WHERE "processedAt" IS NULL
           AND "attempts" <= ${MAX_DELIVERY_ATTEMPTS}
           AND ("leaseExpiresAt" IS NULL OR "leaseExpiresAt" <= ${now})
         ORDER BY "createdAt" ASC
         LIMIT ${limit}
         FOR UPDATE SKIP LOCKED
      `);

      if (rows.length === 0) {
        return [];
      }

      const ids = rows.map((row) => row.id);
      await tx.$executeRaw(Prisma.sql`
        UPDATE "message_outbox"
           SET "claimedAt" = ${now},
               "leaseExpiresAt" = ${leaseExpiresAt}
         WHERE "id" IN (${Prisma.join(ids)})
      `);

      return rows.map((row) => ({
        id: row.id,
        conversationId: row.conversationId,
        messageId: row.messageId,
        recipientIds: row.recipientIds,
        createdAt: row.createdAt,
        processedAt: row.processedAt,
        attempts: row.attempts,
        claimedAt: now,
        leaseExpiresAt,
      }));
    });
  }

  /**
   * Release a claim without resolving the event (QC-F-541): clears the lease
   * stamp so the row is claimable again on the very next poll. Only an
   * unprocessed row can be released — a processed row's claim state is already
   * terminal and is left untouched.
   */
  async releaseClaim(eventId: string): Promise<void> {
    await this.prisma.messageOutbox.updateMany({
      where: { id: eventId, processedAt: null },
      data: { claimedAt: null, leaseExpiresAt: null },
    });
  }

  /**
   * Mark an event processed by stamping `processedAt`, which removes it from
   * future `claimBatch` results (Requirement 8.4). The claim lease is cleared
   * in the same write: a terminal row carries no live claim (QC-F-541).
   */
  async markProcessed(eventId: string): Promise<void> {
    await this.prisma.messageOutbox.update({
      where: { id: eventId },
      data: { processedAt: this.now(), claimedAt: null, leaseExpiresAt: null },
    });
  }

  /**
   * Record a failed delivery attempt: increment the attempt counter and persist
   * the last error. The event remains unprocessed and therefore eligible for a
   * later retry (after the worker's backoff window), until it either succeeds or
   * crosses the dead-letter threshold (Requirements 8.5, 8.7). The claim lease
   * is cleared in the same write (QC-F-541) — a failed event must not stay
   * buried under its dead claim; the worker's in-process backoff window, not
   * the lease, governs when it is retried.
   */
  async markFailed(eventId: string, error: string): Promise<void> {
    await this.prisma.messageOutbox.update({
      where: { id: eventId },
      data: {
        attempts: { increment: 1 },
        lastError: error,
        claimedAt: null,
        leaseExpiresAt: null,
      },
    });
  }
}
