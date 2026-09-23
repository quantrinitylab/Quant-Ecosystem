import { describe, expect, it, vi } from 'vitest';
import { EmailService } from '../services/email.service';

function createPrisma(rows: Array<Record<string, unknown>>) {
  const email = {
    findMany: vi.fn(async ({ where }: any) =>
      rows.filter(
        (row) =>
          where.id.in.includes(row.id) && row.userId === where.userId && row.deletedAt == null,
      ),
    ),
    updateMany: vi.fn(async ({ where }: any) => ({ count: where.id.in.length })),
  };
  const prisma = {
    email,
    $transaction: vi.fn(async (run: (tx: { email: typeof email }) => unknown) => run({ email })),
  };
  return prisma;
}

describe('EmailService.setCategory', () => {
  it('atomically updates every owner-local row represented by the conversation', async () => {
    const prisma = createPrisma([
      { id: 'anchor', userId: 'user-1', deletedAt: null, fromAddress: 'news@example.com' },
      { id: 'collapsed-copy', userId: 'user-1', deletedAt: null, fromAddress: 'news@example.com' },
    ]);
    const service = new EmailService(prisma as never);

    const result = await service.setCategory(
      'anchor',
      ['anchor', 'collapsed-copy', 'anchor'],
      'user-1',
      'updates',
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.email.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['anchor', 'collapsed-copy'] },
        userId: 'user-1',
        deletedAt: null,
      },
      data: { aiCategory: 'updates' },
    });
    expect(result.updated).toBe(2);
    expect(
      result.emails.every(
        (email) => (email as typeof email & { aiCategory?: string }).aiCategory === 'updates',
      ),
    ).toBe(true);
  });

  it('rejects the whole update when any requested row is absent or belongs to another user', async () => {
    const prisma = createPrisma([
      { id: 'anchor', userId: 'user-1', deletedAt: null },
      { id: 'other-tenant', userId: 'user-2', deletedAt: null },
    ]);
    const service = new EmailService(prisma as never);

    await expect(
      service.setCategory('anchor', ['anchor', 'other-tenant'], 'user-1', 'social'),
    ).rejects.toMatchObject({ code: 'EMAIL_NOT_FOUND', statusCode: 404 });
    expect(prisma.email.updateMany).not.toHaveBeenCalled();
  });

  it('requires the route anchor to be part of the conversation id set', async () => {
    const prisma = createPrisma([]);
    const service = new EmailService(prisma as never);

    await expect(
      service.setCategory('anchor', ['different'], 'user-1', 'primary'),
    ).rejects.toMatchObject({ code: 'INVALID_EMAIL_IDS', statusCode: 400 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
