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
// Concurrency: `claimBatch` selects unprocessed, non-dead-lettered rows with
// `FOR UPDATE SKIP LOCKED` (raw SQL) so that two workers polling the table in
// parallel never claim the same event — each locked row is skipped by the other
// worker rather than blocking on it (Requirement 8.1).
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
}

/**
 * Transactional outbox contract (design Component 3). `enqueue` is called inside
 * the message-insert transaction; `claimBatch`/`markProcessed`/`markFailed` are
 * driven by the DeliveryWorker drain loop.
 */
export interface OutboxService {
  /** Enqueue within an existing Prisma transaction (same tx as the Message insert). */
  enqueue(tx: PrismaTx, event: Omit<OutboxEvent, 'id' | 'processedAt' | 'attempts'>): Promise<void>;
  /** Claim a batch of unprocessed events for a worker (FOR UPDATE SKIP LOCKED). */
  claimBatch(limit: number): Promise<OutboxEvent[]>;
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
}

/**
 * Prisma-backed {@link OutboxService}. The backend remains a zero-knowledge
 * relay: the outbox stores only routing metadata (conversation id, message id,
 * recipient ids) — never message content.
 */
export class PrismaOutboxService implements OutboxService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Insert a `MessageOutbox` row using the supplied transaction client so the
   * delivery intent commits atomically with the `Message` row (design
   * Algorithm 2). If the surrounding transaction rolls back, no outbox row
   * exists — guaranteeing `count(messages) == count(matching outbox rows)` at
   * every commit boundary (Requirements 7.1, 7.2, 7.4).
   */
  async enqueue(
    tx: PrismaTx,
    event: Omit<OutboxEvent, 'id' | 'processedAt' | 'attempts'>,
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
   * first. Uses `FOR UPDATE SKIP LOCKED` so concurrent workers never claim the
   * same event: a row locked by one worker is skipped by another rather than
   * blocking (Requirement 8.1). Dead-lettered events (`attempts` exceeding
   * {@link MAX_DELIVERY_ATTEMPTS}) are excluded (Requirement 8.7).
   */
  async claimBatch(limit: number): Promise<OutboxEvent[]> {
    const rows = await this.prisma.$queryRaw<RawOutboxRow[]>(Prisma.sql`
      SELECT "id",
             "conversationId",
             "messageId",
             "recipientIds",
             "attempts",
             "processedAt",
             "createdAt"
        FROM "message_outbox"
       WHERE "processedAt" IS NULL
         AND "attempts" <= ${MAX_DELIVERY_ATTEMPTS}
       ORDER BY "createdAt" ASC
       LIMIT ${limit}
       FOR UPDATE SKIP LOCKED
    `);

    return rows.map((row) => ({
      id: row.id,
      conversationId: row.conversationId,
      messageId: row.messageId,
      recipientIds: row.recipientIds,
      createdAt: row.createdAt,
      processedAt: row.processedAt,
      attempts: row.attempts,
    }));
  }

  /**
   * Mark an event processed by stamping `processedAt`, which removes it from
   * future `claimBatch` results (Requirement 8.4).
   */
  async markProcessed(eventId: string): Promise<void> {
    await this.prisma.messageOutbox.update({
      where: { id: eventId },
      data: { processedAt: new Date() },
    });
  }

  /**
   * Record a failed delivery attempt: increment the attempt counter and persist
   * the last error. The event remains unprocessed and therefore eligible for a
   * later retry (after the worker's backoff window), until it either succeeds or
   * crosses the dead-letter threshold (Requirements 8.5, 8.7).
   */
  async markFailed(eventId: string, error: string): Promise<void> {
    await this.prisma.messageOutbox.update({
      where: { id: eventId },
      data: {
        attempts: { increment: 1 },
        lastError: error,
      },
    });
  }
}
