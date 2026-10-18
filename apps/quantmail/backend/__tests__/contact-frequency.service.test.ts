import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ContactService } from '../services/contact.service';

function createMockPrisma() {
  return {
    contact: {
      upsert: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
}

describe('ContactService — frequency tracking', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: ContactService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new ContactService(prisma as never);
  });

  describe('recordInteraction', () => {
    it('case-folds the key: create stores the canonical lowercase email', async () => {
      prisma.contact.findFirst.mockResolvedValue(null);
      prisma.contact.create.mockResolvedValue({ id: 'c1', frequency: 1 });
      await service.recordInteraction('u1', '  Alice@Example.com  ', 'Alice');

      expect(prisma.contact.findFirst).toHaveBeenCalledWith({
        where: { userId: 'u1', email: { equals: 'alice@example.com', mode: 'insensitive' } },
      });
      const arg = prisma.contact.create.mock.calls[0]![0] as {
        data: Record<string, unknown>;
      };
      expect(arg.data).toMatchObject({
        userId: 'u1',
        email: 'alice@example.com',
        frequency: 1,
        name: 'Alice',
      });
      expect(arg.data.lastContactedAt).toBeInstanceOf(Date);
      expect(prisma.contact.update).not.toHaveBeenCalled();
    });

    it('updates the existing row on a case-variant match (one row per person)', async () => {
      prisma.contact.findFirst.mockResolvedValue({ id: 'c1', userId: 'u1', email: 'Alice@Example.com' });
      prisma.contact.update.mockResolvedValue({ id: 'c1', frequency: 3 });
      await service.recordInteraction('u1', 'alice@example.com', 'Alice');

      const arg = prisma.contact.update.mock.calls[0]![0] as {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      };
      expect(arg.where).toEqual({ id: 'c1' });
      expect(arg.data).toMatchObject({ frequency: { increment: 1 }, name: 'Alice' });
      expect(arg.data.lastContactedAt).toBeInstanceOf(Date);
      // The legacy mixed-case row is updated in place — no second row created.
      expect(prisma.contact.create).not.toHaveBeenCalled();
    });

    it('falls back to email as name when no name is given', async () => {
      prisma.contact.findFirst.mockResolvedValue(null);
      prisma.contact.create.mockResolvedValue({ id: 'c1' });
      await service.recordInteraction('u1', 'bob@example.com');
      const arg = prisma.contact.create.mock.calls[0]![0] as {
        data: Record<string, unknown>;
      };
      expect(arg.data).toMatchObject({ name: 'bob@example.com' });
    });

    it('does not refresh the name on update when none is provided', async () => {
      prisma.contact.findFirst.mockResolvedValue({ id: 'c1', userId: 'u1' });
      prisma.contact.update.mockResolvedValue({ id: 'c1' });
      await service.recordInteraction('u1', 'bob@example.com');
      const arg = prisma.contact.update.mock.calls[0]![0] as {
        data: Record<string, unknown>;
      };
      expect(arg.data).not.toHaveProperty('name');
    });

    it('rejects a blank email', async () => {
      await expect(service.recordInteraction('u1', '   ')).rejects.toMatchObject({
        code: 'INVALID_EMAIL',
      });
      expect(prisma.contact.findFirst).not.toHaveBeenCalled();
      expect(prisma.contact.create).not.toHaveBeenCalled();
    });
  });

  describe('getFrequentContacts', () => {
    it('orders by frequency then recency and clamps the limit', async () => {
      prisma.contact.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
      const out = await service.getFrequentContacts('u1', 999);
      expect(out).toHaveLength(2);
      const arg = prisma.contact.findMany.mock.calls[0]![0] as {
        where: Record<string, unknown>;
        orderBy: unknown;
        take: number;
      };
      expect(arg.where).toEqual({ userId: 'u1' });
      expect(arg.take).toBe(100); // clamped from 999
      // `lastContactedAt` outranks `updatedAt` on purpose: editing somebody's
      // phone number must not promote them past somebody you write to.
      expect(arg.orderBy).toEqual([
        { frequency: 'desc' },
        { lastContactedAt: { sort: 'desc', nulls: 'last' } },
        { name: 'asc' },
      ]);
    });
  });

  describe('recordInteraction — recency stamp', () => {
    it('stamps lastContactedAt on both create and update', async () => {
      prisma.contact.findFirst.mockResolvedValue(null);
      prisma.contact.create.mockResolvedValue({ id: 'c1' });
      await service.recordInteraction('u1', 'carol@example.com');
      const createArg = prisma.contact.create.mock.calls[0]![0] as {
        data: { lastContactedAt: unknown };
      };
      expect(createArg.data.lastContactedAt).toBeInstanceOf(Date);

      prisma.contact.findFirst.mockResolvedValue({ id: 'c1', userId: 'u1' });
      prisma.contact.update.mockResolvedValue({ id: 'c1' });
      await service.recordInteraction('u1', 'carol@example.com');
      const updateArg = prisma.contact.update.mock.calls[0]![0] as {
        data: { lastContactedAt: unknown };
      };
      // Without this, "frequent" could only ever be ordered by `updatedAt`,
      // which any edit to the row bumps.
      expect(updateArg.data.lastContactedAt).toBeInstanceOf(Date);
    });
  });
});

describe('ContactService — list filters', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: ContactService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new ContactService(prisma as never);
    prisma.contact.findMany.mockResolvedValue([]);
    prisma.contact.count.mockResolvedValue(0);
  });

  /** The `where` both `findMany` and `count` were handed, asserted to be one object. */
  async function whereFor(options: Parameters<ContactService['getContacts']>[1]) {
    await service.getContacts('u1', options);
    const findArg = prisma.contact.findMany.mock.calls[0]![0] as { where: unknown };
    const countArg = prisma.contact.count.mock.calls[0]![0] as { where: unknown };
    // A `count` that sees a different predicate is the classic filtered-list
    // bug: three rows on screen, "11 contacts" in the pager.
    expect(countArg.where).toEqual(findArg.where);
    return findArg.where as Record<string, unknown>;
  }

  it('searches name, email, company and phone', async () => {
    const where = await whereFor({ q: '  acme  ' });
    expect(where).toEqual({
      userId: 'u1',
      OR: [
        { name: { contains: 'acme', mode: 'insensitive' } },
        { email: { contains: 'acme', mode: 'insensitive' } },
        { company: { contains: 'acme', mode: 'insensitive' } },
        { phone: { contains: 'acme', mode: 'insensitive' } },
      ],
    });
  });

  it('filters by tag through the array `has` operator', async () => {
    const where = await whereFor({ tag: 'investors' });
    expect(where).toEqual({ userId: 'u1', tags: { has: 'investors' } });
  });

  it('narrows on favorites=true and ignores favorites=false', async () => {
    expect(await whereFor({ favorites: true })).toEqual({ userId: 'u1', isFavorite: true });

    prisma.contact.findMany.mockClear();
    prisma.contact.count.mockClear();
    // The Favorites tab off means "no filter", not "show me the un-starred".
    expect(await whereFor({ favorites: false })).toEqual({ userId: 'u1' });
  });

  it('combines q, tag and favorites', async () => {
    const where = await whereFor({ q: 'ada', tag: 'vip', favorites: true });
    expect(where).toMatchObject({ userId: 'u1', tags: { has: 'vip' }, isFavorite: true });
    expect(where.OR).toHaveLength(4);
  });

  it('puts starred rows first, then most-contacted, then alphabetical', async () => {
    await service.getContacts('u1', {});
    const arg = prisma.contact.findMany.mock.calls[0]![0] as { orderBy: unknown };
    // `frequency` alone left a fresh all-zero account in arbitrary Postgres
    // order, so the list looked like it reshuffled itself between loads.
    expect(arg.orderBy).toEqual([{ isFavorite: 'desc' }, { frequency: 'desc' }, { name: 'asc' }]);
  });

  it('derives pagination from the filtered count', async () => {
    prisma.contact.count.mockResolvedValue(45);
    const result = await service.getContacts('u1', { page: 2, pageSize: 20 });
    const arg = prisma.contact.findMany.mock.calls[0]![0] as { skip: number; take: number };
    expect(arg).toMatchObject({ skip: 20, take: 20 });
    expect(result).toMatchObject({
      total: 45,
      page: 2,
      pageSize: 20,
      totalPages: 3,
      hasNext: true,
      hasPrev: true,
    });
  });
});

describe('ContactService — ownership and empty patches', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: ContactService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new ContactService(prisma as never);
  });

  it('404s a missing contact', async () => {
    prisma.contact.findUnique.mockResolvedValue(null);
    await expect(service.getContact('c1', 'u1')).rejects.toMatchObject({
      code: 'CONTACT_NOT_FOUND',
      statusCode: 404,
    });
  });

  it('403s somebody else’s contact, and never before checking existence', async () => {
    prisma.contact.findUnique.mockResolvedValue({ id: 'c1', userId: 'u2' });
    await expect(service.getContact('c1', 'u1')).rejects.toMatchObject({
      code: 'FORBIDDEN',
      statusCode: 403,
    });
    // Existence is checked first on purpose: a 403 for an id that does not
    // exist would confirm that ids in that range are real.
    expect(prisma.contact.findUnique).toHaveBeenCalledWith({ where: { id: 'c1' } });
  });

  it('returns a contact the caller owns', async () => {
    prisma.contact.findUnique.mockResolvedValue({ id: 'c1', userId: 'u1', name: 'Ada' });
    await expect(service.getContact('c1', 'u1')).resolves.toMatchObject({ name: 'Ada' });
  });

  it('refuses an empty patch instead of reporting a no-op as success', async () => {
    prisma.contact.findUnique.mockResolvedValue({ id: 'c1', userId: 'u1' });
    await expect(service.updateContact('c1', 'u1', {})).rejects.toMatchObject({
      code: 'EMPTY_UPDATE',
      statusCode: 400,
    });
    // This is how the star used to toast "Added to favorites" and revert.
    expect(prisma.contact.update).not.toHaveBeenCalled();
  });

  it('writes only the supplied fields', async () => {
    prisma.contact.findUnique.mockResolvedValue({ id: 'c1', userId: 'u1' });
    prisma.contact.update.mockResolvedValue({ id: 'c1', isFavorite: true });
    await service.updateContact('c1', 'u1', { isFavorite: true });
    expect(prisma.contact.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { isFavorite: true },
    });
  });

  it('checks ownership before updating or deleting', async () => {
    prisma.contact.findUnique.mockResolvedValue({ id: 'c1', userId: 'u2' });

    await expect(service.updateContact('c1', 'u1', { name: 'Mine now' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(service.deleteContact('c1', 'u1')).rejects.toMatchObject({ code: 'FORBIDDEN' });

    expect(prisma.contact.update).not.toHaveBeenCalled();
    expect(prisma.contact.delete).not.toHaveBeenCalled();
  });
});

/**
 * The duplicate-row class: contact write paths must case-fold email, because
 * the (userId, email) unique constraint is case-sensitive. Before this fix,
 * emailing Alice@x.com then alice@x.com (or one-click-adding a suggestion
 * whose casing differed from an existing row) created a second row for the
 * same person, split frequency across the duplicates, and slipped past the
 * 409 CONTACT_EXISTS guard.
 */
describe('ContactService — email case-folding on write', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: ContactService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new ContactService(prisma as never);
  });

  it('addContact stores the canonical lowercase email', async () => {
    prisma.contact.findFirst.mockResolvedValue(null);
    prisma.contact.create.mockResolvedValue({ id: 'c1' });

    await service.addContact({ userId: 'u1', name: 'Alice', email: '  Alice@Example.COM ' });

    expect(prisma.contact.findFirst).toHaveBeenCalledWith({
      where: { userId: 'u1', email: { equals: 'alice@example.com', mode: 'insensitive' } },
    });
    expect(prisma.contact.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'u1', email: 'alice@example.com' }),
      }),
    );
  });

  it('addContact 409s on a case-variant of an existing row', async () => {
    prisma.contact.findFirst.mockResolvedValue({ id: 'c1', email: 'Alice@Example.com' });

    await expect(
      service.addContact({ userId: 'u1', name: 'Alice', email: 'ALICE@example.com' }),
    ).rejects.toMatchObject({ code: 'CONTACT_EXISTS', statusCode: 409 });
    expect(prisma.contact.create).not.toHaveBeenCalled();
  });

  it('updateContact canonicalizes a case-variant email patch', async () => {
    prisma.contact.findUnique.mockResolvedValue({ id: 'c1', userId: 'u1' });
    prisma.contact.update.mockResolvedValue({ id: 'c1' });

    await service.updateContact('c1', 'u1', { email: 'Ada@Example.COM' });

    expect(prisma.contact.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { email: 'ada@example.com' },
    });
  });

  it('recordInteraction case-folds before the uniqueness lookup', async () => {
    prisma.contact.findFirst.mockResolvedValue(null);
    prisma.contact.create.mockResolvedValue({ id: 'c1' });

    await service.recordInteraction('u1', 'BOB@Example.COM');

    expect(prisma.contact.findFirst).toHaveBeenCalledWith({
      where: { userId: 'u1', email: { equals: 'bob@example.com', mode: 'insensitive' } },
    });
    expect(prisma.contact.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: 'bob@example.com', name: 'bob@example.com' }),
      }),
    );
  });
});

/**
 * The send paths call this once per sent message. It is the only reason
 * `frequency` is ever non-zero, and it runs *after* a message has already gone
 * out — so its most important property is the one it must never have: throwing.
 */
describe('ContactService — recordRecipients', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: ContactService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new ContactService(prisma as never);
    // No row exists yet: every distinct address creates its canonical row.
    prisma.contact.findFirst.mockResolvedValue(null);
    prisma.contact.create.mockImplementation((arg: unknown) => {
      const data = (arg as { data: Record<string, unknown> }).data;
      return Promise.resolve({ id: `c-${data.email}`, ...data });
    });
  });

  function createdEmails(): string[] {
    return prisma.contact.create.mock.calls.map((call) => {
      const arg = call[0] as { data: { email: string } };
      return arg.data.email;
    });
  }

  function lookupEmails(): string[] {
    return prisma.contact.findFirst.mock.calls.map((call) => {
      const arg = call[0] as { where: { email: { equals: string } } };
      return arg.where.email.equals;
    });
  }

  it('records one interaction per distinct address across To, Cc and Bcc', async () => {
    const result = await service.recordRecipients('u1', [
      ['ada@example.com', 'grace@example.com'],
      ['ada@example.com'],
      ['linus@example.com'],
    ]);

    // The same person in To and Cc received one message, so one interaction.
    expect(createdEmails()).toEqual(['ada@example.com', 'grace@example.com', 'linus@example.com']);
    expect(result).toEqual({ recorded: 3, failed: 0, total: 3 });
  });

  it('de-duplicates case-insensitively, keeping the first spelling', async () => {
    await service.recordRecipients('u1', [['Ada@Example.com'], ['ada@example.com']]);
    expect(createdEmails()).toEqual(['ada@example.com']);
  });

  it('case-folds every lookup, so the upsert-key stays canonical', async () => {
    await service.recordRecipients('u1', [['  Grace@Example.COM  ']]);
    expect(lookupEmails()).toEqual(['grace@example.com']);
  });

  it('updates a legacy mixed-case row in place instead of creating a duplicate', async () => {
    prisma.contact.findFirst.mockResolvedValue({ id: 'c-legacy', userId: 'u1', email: 'Ada@Example.com' });
    prisma.contact.update.mockResolvedValue({ id: 'c-legacy' });

    const result = await service.recordRecipients('u1', [['ada@example.com']]);

    expect(prisma.contact.create).not.toHaveBeenCalled();
    expect(prisma.contact.update).toHaveBeenCalledWith({
      where: { id: 'c-legacy' },
      data: expect.objectContaining({ frequency: { increment: 1 } }),
    });
    expect(result).toEqual({ recorded: 1, failed: 0, total: 1 });
  });

  it('skips blanks, whitespace and non-strings without touching the database', async () => {
    const result = await service.recordRecipients('u1', [
      ['   ', ''],
      [undefined, '  ada@example.com  '],
      undefined,
    ]);

    expect(createdEmails()).toEqual(['ada@example.com']);
    expect(result.total).toBe(1);
  });

  it('does nothing at all when there is nobody to record', async () => {
    const result = await service.recordRecipients('u1', [[], undefined]);
    expect(prisma.contact.findFirst).not.toHaveBeenCalled();
    expect(result).toEqual({ recorded: 0, failed: 0, total: 0 });
  });

  it('never throws, and one failure does not cost the others their interaction', async () => {
    prisma.contact.create
      .mockRejectedValueOnce(new Error('deadlock detected'))
      .mockImplementation((arg: unknown) => {
        const data = (arg as { data: Record<string, unknown> }).data;
        return Promise.resolve({ id: `c-${data.email}`, ...data });
      });

    const result = await service.recordRecipients('u1', [
      ['ada@example.com', 'grace@example.com', 'linus@example.com'],
    ]);

    // A delivered message must not be reported as a failed request because the
    // address book lost a race.
    expect(result).toEqual({ recorded: 2, failed: 1, total: 3 });
  });
});
