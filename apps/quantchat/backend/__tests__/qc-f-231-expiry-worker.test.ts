import { describe, it, expect, vi } from 'vitest';
import { DisappearingService } from '../services/disappearing.service';
import { MessageExpiryWorker } from '../services/message-expiry-worker';
import { MessageService } from '../services/message.service';

// ============================================================================
// QC-F-231 Slice B: durable expiry — MessageExpiryWorker + serve-guarantee.
//
// Negative control: on the original code these tests FAIL —
//  * processExpiredMessages had no take/orderBy and purged only
//    { isDeleted, content } (media URLs + metadata survived);
//  * no worker class existed at all;
//  * getMessages/searchMessages had no expiresAt clause, so expired rows
//    were served.
// The restart test is the sharpest pin: it uses a BRAND-NEW worker
// instance with zero in-memory state — the old per-request setTimeout
// design could never purge this way.
// ============================================================================

type Row = {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  expiresAt: Date | null;
  isDeleted: boolean;
  mediaUrl: string | null;
  mediaThumbnailUrl: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
};

function row(partial: Partial<Row> & { id: string }): Row {
  return {
    conversationId: 'conv-1',
    senderId: 'user-1',
    content: 'secret',
    expiresAt: null,
    isDeleted: false,
    mediaUrl: 'https://media.example/m.jpg',
    mediaThumbnailUrl: 'https://media.example/m-thumb.jpg',
    metadata: { caption: 'keep-me' },
    createdAt: new Date('2024-01-01T00:00:00Z'),
    ...partial,
  };
}

function matchesWhere(r: Row, where: Record<string, unknown>): boolean {
  const conv = where.conversationId as string | { in: string[] } | undefined;
  if (typeof conv === 'string') {
    if (r.conversationId !== conv) return false;
  } else if (conv && typeof conv === 'object' && 'in' in conv) {
    if (!(conv.in as string[]).includes(r.conversationId)) return false;
  }
  if (where.isDeleted !== undefined && r.isDeleted !== where.isDeleted) return false;
  const or = where.OR as Array<Record<string, unknown>> | undefined;
  if (or) {
    const ok = or.some((clause) => {
      if (!('expiresAt' in clause)) return false;
      const e = clause.expiresAt as null | { gt?: Date; lte?: Date };
      if (e === null) return r.expiresAt === null;
      if (e.gt) return r.expiresAt !== null && r.expiresAt.getTime() > e.gt.getTime();
      if (e.lte) return r.expiresAt !== null && r.expiresAt.getTime() <= e.lte.getTime();
      return false;
    });
    if (!ok) return false;
  }
  const exp = where.expiresAt as { lte?: Date } | undefined;
  if (exp?.lte && !(r.expiresAt && r.expiresAt.getTime() <= exp.lte.getTime())) return false;
  const content = where.content as { contains?: string } | undefined;
  if (content?.contains && !r.content.includes(content.contains)) return false;
  return true;
}

function makeStatefulPrisma(rows: Row[]) {
  const store = new Map<string, Row>(rows.map((r) => [r.id, { ...r }]));
  const findManyCalls: unknown[] = [];
  const message = {
    findMany: vi.fn(async (args: Record<string, unknown>) => {
      findManyCalls.push(args);
      const where = (args.where ?? {}) as Record<string, unknown>;
      let out = [...store.values()].filter((r) => matchesWhere(r, where));
      const orderBy = args.orderBy as { expiresAt?: 'asc' | 'desc'; createdAt?: 'asc' | 'desc' } | undefined;
      if (orderBy?.expiresAt) {
        const dir = orderBy.expiresAt === 'desc' ? -1 : 1;
        out = out.sort(
          (a, b) => dir * ((a.expiresAt?.getTime() ?? 0) - (b.expiresAt?.getTime() ?? 0)),
        );
      } else if (orderBy?.createdAt) {
        const dir = orderBy.createdAt === 'desc' ? -1 : 1;
        out = out.sort((a, b) => dir * (a.createdAt.getTime() - b.createdAt.getTime()));
      }
      if (typeof args.take === 'number') out = out.slice(0, args.take);
      if (typeof args.skip === 'number') out = out.slice(args.skip);
      return out.map((r) => ({ ...r }));
    }),
    count: vi.fn(async (args: Record<string, unknown>) => {
      const where = (args.where ?? {}) as Record<string, unknown>;
      return [...store.values()].filter((r) => matchesWhere(r, where)).length;
    }),
    updateMany: vi.fn(async (args: Record<string, unknown>) => {
      const where = args.where as { id: { in: string[] } };
      const data = args.data as Partial<Row>;
      const ids = new Set(where.id.in);
      let count = 0;
      for (const r of store.values()) {
        if (ids.has(r.id)) {
          Object.assign(r, data);
          count += 1;
        }
      }
      return { count };
    }),
    // Read paths used by the serve-guarantee tests.
    findUnique: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
  };
  const prisma = {
    message,
    conversation: { findUnique: vi.fn(), update: vi.fn() },
    conversationMember: {
      findFirst: vi.fn().mockResolvedValue({ id: 'm1', leftAt: null }),
      findMany: vi.fn().mockResolvedValue([{ conversationId: 'conv-1' }]),
    },
    user: { findUnique: vi.fn().mockResolvedValue({ preferences: null }) },
    messageOutbox: { create: vi.fn() },
    snapView: { findUnique: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(prisma)),
  };
  return { prisma, store, findManyCalls };
}

describe('QC-F-231 Slice B — MessageExpiryWorker', () => {
  it('purges expired rows with a brand-new instance (restart pin — zero in-memory state)', async () => {
    const past = new Date(Date.now() - 60_000);
    const future = new Date(Date.now() + 60_000);
    const { prisma, store } = makeStatefulPrisma([
      row({ id: 'expired-1', expiresAt: past }),
      row({ id: 'expired-2', expiresAt: past }),
      row({ id: 'future-1', expiresAt: future }),
      row({ id: 'never-1', expiresAt: null }),
    ]);

    // A BRAND-NEW worker: no timers, no memory of any schedule call.
    const worker = new MessageExpiryWorker(prisma as never);
    const purged = await worker.tick();

    expect(purged).toBe(2);
    for (const id of ['expired-1', 'expired-2']) {
      const m = store.get(id)!;
      expect(m.isDeleted).toBe(true);
      expect(m.content).toBe('[Message expired]');
      // D4 (poora mitna): media + metadata wiped, not just content.
      expect(m.mediaUrl).toBeNull();
      expect(m.mediaThumbnailUrl).toBeNull();
      expect(m.metadata).toEqual({ expired: true });
    }
    for (const id of ['future-1', 'never-1']) {
      const m = store.get(id)!;
      expect(m.isDeleted).toBe(false);
      expect(m.content).toBe('secret');
    }
  });

  it('is idempotent — a second tick purges nothing', async () => {
    const { prisma, store } = makeStatefulPrisma([
      row({ id: 'e1', expiresAt: new Date(Date.now() - 1000) }),
    ]);
    const worker = new MessageExpiryWorker(prisma as never);

    expect(await worker.tick()).toBe(1);
    expect(await worker.tick()).toBe(0);
    expect(store.get('e1')!.isDeleted).toBe(true);
  });

  it('drains a backlog in batches (cap 20 batches/tick)', async () => {
    const past = new Date(Date.now() - 1000);
    const rows = Array.from({ length: 450 }, (_, i) => row({ id: `b${i}`, expiresAt: past }));
    const { prisma, findManyCalls } = makeStatefulPrisma(rows);

    const worker = new MessageExpiryWorker(prisma as never, { batchSize: 200 });
    const purged = await worker.tick();

    expect(purged).toBe(450);
    // 200 + 200 + 50 → three sweep batches.
    expect(findManyCalls.length).toBe(3);
  });

  it('two workers on the same store purge the same total (no double work)', async () => {
    const past = new Date(Date.now() - 1000);
    const { prisma } = makeStatefulPrisma([
      row({ id: 'e1', expiresAt: past }),
      row({ id: 'e2', expiresAt: past }),
    ]);
    const w1 = new MessageExpiryWorker(prisma as never);
    const w2 = new MessageExpiryWorker(prisma as never);

    const total = (await w1.tick()) + (await w2.tick());
    expect(total).toBe(2);
  });

  it('reports sweep errors to onError instead of throwing', async () => {
    const { prisma } = makeStatefulPrisma([]);
    (prisma.message.findMany as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('db down'),
    );
    const onError = vi.fn();
    const worker = new MessageExpiryWorker(prisma as never, { onError, intervalMs: 20 });

    worker.start(); // immediate tick + interval ticks, all error-sunk
    await new Promise((resolve) => setTimeout(resolve, 80));
    worker.stop();

    expect(onError).toHaveBeenCalled();
    for (const call of onError.mock.calls) {
      expect(call[0]).toBeInstanceOf(Error);
    }
  });
});

describe('QC-F-231 Slice B — serve-guarantee (D3)', () => {
  function seed() {
    const past = new Date(Date.now() - 60_000);
    const future = new Date(Date.now() + 60_000);
    return makeStatefulPrisma([
      row({ id: 'expired-1', expiresAt: past, content: 'expired secret' }),
      row({ id: 'future-1', expiresAt: future, content: 'future secret' }),
      row({ id: 'never-1', expiresAt: null, content: 'plain hello' }),
    ]);
  }

  it('getMessages never serves an expired row, even with the worker stopped', async () => {
    const { prisma } = seed();
    const service = new MessageService(prisma as never);

    // The worker is deliberately NEVER started/ticked here.
    const result = await service.getMessages('conv-1', 'user-1');

    const ids = result.data.map((m) => m.id).sort();
    expect(ids).toEqual(['future-1', 'never-1']);
    expect(result.total).toBe(2);
  });

  it('searchMessages never surfaces an expired row', async () => {
    const { prisma } = seed();
    const service = new MessageService(prisma as never);

    const result = await service.searchMessages('user-1', 'secret');

    const ids = result.data.map((m) => m.id);
    expect(ids).toEqual(['future-1']);
    expect(result.total).toBe(1);
  });
});

describe('QC-F-231 — DisappearingService.processExpiredMessages batching', () => {
  it('honours take/orderBy: oldest-first, one batch per call', async () => {
    const t0 = Date.now();
    const { prisma } = makeStatefulPrisma([
      row({ id: 'new', expiresAt: new Date(t0 - 1000) }),
      row({ id: 'old', expiresAt: new Date(t0 - 5000) }),
    ]);
    const service = new DisappearingService(prisma as never);

    expect(await service.processExpiredMessages(1)).toBe(1);
    const firstBatch = (prisma.message.updateMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(firstBatch.where.id.in).toEqual(['old']);

    expect(await service.processExpiredMessages(1)).toBe(1);
    expect(await service.processExpiredMessages(1)).toBe(0);
  });
});
