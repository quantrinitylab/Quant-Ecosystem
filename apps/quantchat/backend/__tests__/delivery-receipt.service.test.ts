// ============================================================================
// Unit tests — DeliveryReceiptService (first-class delivery/read receipts)
// Spec: quantchat-launch-readiness, Task 14 (Requirements 10.1, 10.2, 10.3, 10.4)
//
// A live PostgreSQL is not available in the sandbox, so these tests drive the
// REAL DeliveryReceiptService against a faithful in-memory fake of the exact
// `prisma.messageDelivery` operations it issues (findUnique + upsert on the
// `messageId_userId` compound unique key). The fake enforces the @@unique
// constraint so the "at most one row per (messageId, userId)" invariant
// (Requirement 10.3) is genuinely exercised.
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  DeliveryReceiptService,
  type DeliveryReceipt,
  type MessageDeliveryDelegate,
} from '../services/delivery-receipt.service';

interface Row extends DeliveryReceipt {
  id: string;
}

/** Minimal in-memory model of the MessageDelivery delegate with unique key. */
function createFakeDelivery(): {
  delegate: MessageDeliveryDelegate;
  rows: Map<string, Row>;
} {
  const rows = new Map<string, Row>();
  let seq = 0;
  const keyOf = (messageId: string, userId: string): string => `${messageId}::${userId}`;

  const delegate: MessageDeliveryDelegate = {
    async findUnique({ where }) {
      const row = rows.get(keyOf(where.messageId_userId.messageId, where.messageId_userId.userId));
      return row ? { ...row } : null;
    },
    async upsert({ where, create, update }) {
      const k = keyOf(where.messageId_userId.messageId, where.messageId_userId.userId);
      const existing = rows.get(k);
      if (existing) {
        // Update path: only the provided fields change (mirrors Prisma upsert).
        if ('deliveredAt' in update) existing.deliveredAt = update.deliveredAt ?? null;
        if ('readAt' in update) existing.readAt = update.readAt ?? null;
        rows.set(k, existing);
        return { ...existing };
      }
      const row: Row = {
        id: `del_${(seq += 1)}`,
        messageId: create.messageId,
        userId: create.userId,
        deliveredAt: create.deliveredAt ?? null,
        readAt: create.readAt ?? null,
      };
      rows.set(k, row);
      return { ...row };
    },
  };

  return { delegate, rows };
}

function makeService(): {
  service: DeliveryReceiptService;
  rows: Map<string, Row>;
} {
  const { delegate, rows } = createFakeDelivery();
  const service = new DeliveryReceiptService({ messageDelivery: delegate } as never);
  return { service, rows };
}

describe('DeliveryReceiptService', () => {
  it('records deliveredAt on first ack (Req 10.1)', async () => {
    const { service } = makeService();
    const receipt = await service.recordDelivered('m1', 'u1');
    expect(receipt.deliveredAt).toBeInstanceOf(Date);
    expect(receipt.readAt).toBeNull();
  });

  it('keeps a single row and preserves the earliest deliveredAt on repeat ack (Req 10.1, 10.3)', async () => {
    const { service, rows } = makeService();
    const first = await service.recordDelivered('m1', 'u1');
    await new Promise((r) => setTimeout(r, 5));
    const second = await service.recordDelivered('m1', 'u1');
    expect(rows.size).toBe(1);
    expect(second.deliveredAt?.getTime()).toBe(first.deliveredAt?.getTime());
  });

  it('records readAt and back-fills deliveredAt no later than readAt when no prior delivery (Req 10.2, 10.4)', async () => {
    const { service, rows } = makeService();
    const receipt = await service.recordRead('m1', 'u1');
    expect(rows.size).toBe(1);
    expect(receipt.readAt).toBeInstanceOf(Date);
    expect(receipt.deliveredAt).toBeInstanceOf(Date);
    expect(receipt.deliveredAt!.getTime()).toBeLessThanOrEqual(receipt.readAt!.getTime());
  });

  it('preserves an earlier deliveredAt when a read follows a delivery (Req 10.4)', async () => {
    const { service } = makeService();
    const delivered = await service.recordDelivered('m1', 'u1');
    await new Promise((r) => setTimeout(r, 5));
    const read = await service.recordRead('m1', 'u1');
    expect(read.deliveredAt?.getTime()).toBe(delivered.deliveredAt?.getTime());
    expect(read.deliveredAt!.getTime()).toBeLessThanOrEqual(read.readAt!.getTime());
  });

  it('maintains at most one row across interleaved delivered/read updates (Req 10.3)', async () => {
    const { service, rows } = makeService();
    await Promise.all([
      service.recordDelivered('m1', 'u1'),
      service.recordRead('m1', 'u1'),
      service.recordDelivered('m1', 'u1'),
    ]);
    expect(rows.size).toBe(1);
    const row = rows.get('m1::u1')!;
    expect(row.deliveredAt).toBeInstanceOf(Date);
  });

  it('scopes rows per (messageId, userId) pair', async () => {
    const { service, rows } = makeService();
    await service.recordDelivered('m1', 'u1');
    await service.recordDelivered('m1', 'u2');
    await service.recordRead('m2', 'u1');
    expect(rows.size).toBe(3);
  });
});
