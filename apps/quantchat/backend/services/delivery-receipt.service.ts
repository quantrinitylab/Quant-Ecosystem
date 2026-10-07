// ============================================================================
// QuantChat — DeliveryReceiptService (W3, design Component 3 / Data Model 5)
// ============================================================================
//
// First-class delivery and read receipts (Requirement 10). Delivery state used
// to live in `Message.metadata` JSON (unindexable, race-prone). This service
// records receipts in the dedicated `MessageDelivery` table instead, keyed by
// the `@@unique([messageId, userId])` constraint so there is AT MOST ONE row
// per `(messageId, userId)` pair even under concurrent delivery/read updates
// (Requirement 10.3).
//
// All writes go through `prisma.messageDelivery.upsert` on that compound unique
// key: the unique constraint collapses a concurrent create race into a single
// row (one inserter wins, the other becomes an update), and repeated acks are
// idempotent.
//
// Invariants enforced here:
//   - recordDelivered sets `deliveredAt` once and never moves it later on a
//     repeat ack (Requirement 10.1).
//   - recordRead sets `readAt` and guarantees `deliveredAt <= readAt`: if no
//     prior `deliveredAt` exists it is back-filled to the read time, and an
//     existing `deliveredAt` in the future (clock skew) is clamped to the read
//     time (Requirements 10.2, 10.4).
// ============================================================================

import type { PrismaClient } from '@prisma/client';

/** A first-class delivery/read receipt for a `(messageId, userId)` pair. */
export interface DeliveryReceipt {
  messageId: string;
  userId: string;
  deliveredAt: Date | null;
  readAt: Date | null;
}

/** Minimal Prisma surface the service needs — keeps it trivially testable. */
export interface MessageDeliveryDelegate {
  findUnique(args: {
    where: { messageId_userId: { messageId: string; userId: string } };
  }): Promise<DeliveryReceipt | null>;
  upsert(args: {
    where: { messageId_userId: { messageId: string; userId: string } };
    create: { messageId: string; userId: string; deliveredAt?: Date | null; readAt?: Date | null };
    update: { deliveredAt?: Date | null; readAt?: Date | null };
  }): Promise<DeliveryReceipt>;
}

/** Prisma client subset accepted by {@link DeliveryReceiptService}. */
type DeliveryReceiptPrisma = Pick<PrismaClient, never> & {
  messageDelivery: MessageDeliveryDelegate;
};

/**
 * Records first-class delivery and read receipts in the `MessageDelivery`
 * table (design Data Model 5). Methods are idempotent and concurrency-safe via
 * upsert on the `(messageId, userId)` unique key.
 */
export class DeliveryReceiptService {
  constructor(private readonly prisma: DeliveryReceiptPrisma) {}

  /**
   * Record that `userId`'s socket acknowledged receipt of `messageId`
   * (Requirement 10.1). Upserts the `MessageDelivery` row, setting `deliveredAt`
   * on first ack. A repeat ack is idempotent: an existing `deliveredAt` is
   * preserved (never moved later) so the earliest delivery time stands. At most
   * one row per pair is maintained by the unique key + upsert (Requirement 10.3).
   */
  async recordDelivered(messageId: string, userId: string): Promise<DeliveryReceipt> {
    const now = new Date();
    const existing = await this.prisma.messageDelivery.findUnique({
      where: { messageId_userId: { messageId, userId } },
    });

    // Preserve an earlier delivery timestamp; only stamp `now` when none exists.
    const deliveredAt = existing?.deliveredAt ?? now;

    return this.prisma.messageDelivery.upsert({
      where: { messageId_userId: { messageId, userId } },
      create: { messageId, userId, deliveredAt: now },
      update: { deliveredAt },
    });
  }

  /**
   * Record that `userId` read `messageId` (Requirement 10.2). Sets `readAt` and
   * guarantees `deliveredAt <= readAt` (Requirement 10.4): a missing
   * `deliveredAt` is back-filled to the read time, and any existing
   * `deliveredAt` later than the read time (clock skew) is clamped down to it.
   * Upsert on the unique key keeps a single row per pair (Requirement 10.3).
   */
  async recordRead(messageId: string, userId: string): Promise<DeliveryReceipt> {
    const now = new Date();
    const existing = await this.prisma.messageDelivery.findUnique({
      where: { messageId_userId: { messageId, userId } },
    });

    // deliveredAt must be no later than readAt: keep a valid earlier value,
    // otherwise (absent or in the future) set it to the read time.
    const priorDelivered = existing?.deliveredAt ?? null;
    const deliveredAt = priorDelivered && priorDelivered <= now ? priorDelivered : now;

    return this.prisma.messageDelivery.upsert({
      where: { messageId_userId: { messageId, userId } },
      create: { messageId, userId, deliveredAt, readAt: now },
      update: { deliveredAt, readAt: now },
    });
  }
}
