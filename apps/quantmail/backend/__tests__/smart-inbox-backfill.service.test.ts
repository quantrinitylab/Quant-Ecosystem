import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Email } from '@prisma/client';
import { SmartInboxBackfillService } from '../services/smart-inbox-backfill.service';
import { SmartInboxService } from '../services/smart-inbox.service';

const row = (overrides: Partial<Email> = {}): Email =>
  ({
    id: 'email-1',
    userId: 'user-1',
    fromAddress: 'notifications@facebook.com',
    subject: 'Friend request',
    toAddresses: ['user@quantmail.in'],
    bodyPlain: 'Hello',
    bodyHtml: '',
    ...overrides,
  }) as Email;

function createPrisma() {
  const email = {
    findMany: vi.fn(),
    updateMany: vi.fn(async ({ where }: any) => ({ count: where.id.in.length })),
    count: vi.fn(async () => 0),
  };
  return {
    email,
    $transaction: vi.fn(async (writes: Array<Promise<{ count: number }>>) => Promise.all(writes)),
  };
}

describe('SmartInboxBackfillService', () => {
  let prisma: ReturnType<typeof createPrisma>;

  beforeEach(() => {
    prisma = createPrisma();
  });

  it('is user-scoped, bounded, cursor-based, and lets learned preferences beat heuristics', async () => {
    prisma.email.findMany.mockResolvedValue([
      row({ id: 'a', fromAddress: 'notifications@facebook.com' }),
      row({ id: 'b', fromAddress: 'news@store.com', subject: 'Weekly newsletter' }),
      row({ id: 'c', fromAddress: 'shipping@store.com', subject: 'Shipping update' }),
    ]);
    prisma.email.count.mockResolvedValue(1);
    const learned = {
      lookup: vi.fn(async (_userId: string, sender: string) =>
        sender === 'notifications@facebook.com' ? ('updates' as const) : null,
      ),
      record: vi.fn(),
    };
    const service = new SmartInboxBackfillService(
      prisma as never,
      new SmartInboxService(),
      learned,
    );

    const result = await service.run('user-1', { limit: 2, cursor: 'before-a' });

    expect(prisma.email.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 3,
        orderBy: { id: 'asc' },
        where: expect.objectContaining({
          userId: 'user-1',
          aiCategory: null,
          isDraft: false,
          isSent: false,
          isSpam: false,
          isTrash: false,
          id: { gt: 'before-a' },
        }),
      }),
    );
    expect(learned.lookup).toHaveBeenCalledTimes(2);
    expect(prisma.email.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'user-1', aiCategory: null, id: { in: ['a'] } }),
        data: { aiCategory: 'updates' },
      }),
    );
    expect(prisma.email.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'user-1', aiCategory: null, id: { in: ['b'] } }),
        data: { aiCategory: 'promotions' },
      }),
    );
    expect(result).toEqual({
      scanned: 2,
      updated: 2,
      skipped: 0,
      nextCursor: 'b',
      remaining: 1,
    });
  });

  it('changes nothing when learned preferences cannot be read', async () => {
    prisma.email.findMany.mockResolvedValue([row()]);
    const learned = {
      lookup: vi.fn(async () => {
        throw new Error('memory unavailable');
      }),
      record: vi.fn(),
    };
    const service = new SmartInboxBackfillService(
      prisma as never,
      new SmartInboxService(),
      learned,
    );

    await expect(service.run('user-1', { limit: 50 })).rejects.toMatchObject({
      code: 'CATEGORY_MEMORY_UNAVAILABLE',
      statusCode: 503,
    });
    expect(prisma.email.updateMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('is idempotent when no null-category rows remain and clamps work to 100', async () => {
    prisma.email.findMany.mockResolvedValue([]);
    const service = new SmartInboxBackfillService(prisma as never, new SmartInboxService());

    const result = await service.run('user-1', { limit: 10_000 });

    expect(prisma.email.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 101 }));
    expect(prisma.email.updateMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(result).toEqual({
      scanned: 0,
      updated: 0,
      skipped: 0,
      nextCursor: null,
      remaining: 0,
    });
  });
});
