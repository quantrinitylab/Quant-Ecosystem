import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EmailService } from '../services/email.service';
import { extractSpamTrashScope } from '../services/search-query.service';

/**
 * fix/qm-search-spam-trash-operators — Gmail parity for the legacy search path.
 *
 * GET /emails/search (EmailService.search) used to hard-exclude trash/spam AND
 * match the whole query literally, so `in:trash invoice` could never return
 * anything: the operator tokens were part of the literal `contains` match and
 * the trash/spam rows were excluded anyway. The operator route
 * (GET /search/emails) already honoured these operators, but the legacy path
 * serves filter-chip searches and the operator route's fallback — a user who
 * trashed something and searched with a chip (or during an operator-route
 * outage) had no path back to it.
 *
 * The fix interprets ONLY the four Spam/Trash scope operators on this path
 * (`in:trash`, `in:spam`, `is:spam`, `in:anywhere`), borrowing the scope
 * semantics verbatim from SearchQueryService.buildEmailWhere() so both paths
 * always agree. Every other operator-looking token stays literal here — the
 * `from:alice@contact.io` guard below locks the documented behaviour from
 * email-search-contact-thread-filters.test.ts.
 *
 * All state is a deterministic in-memory Prisma stub that evaluates the
 * Prisma `where` clause the way Postgres would.
 */

type SeedEmail = {
  id: string;
  userId: string;
  subject: string;
  bodyPlain: string;
  fromAddress: string;
  fromName: string;
  toAddresses: string[];
  ccAddresses: string[];
  bccAddresses: string[];
  isTrash: boolean;
  isSpam: boolean;
  deletedAt: null;
};

const SEED: SeedEmail[] = [
  {
    id: 'e-inbox',
    userId: 'user-1',
    subject: 'Invoice paid',
    bodyPlain: 'thanks',
    fromAddress: 'alice@x.com',
    fromName: 'Alice',
    toAddresses: ['me@quantmail.in'],
    ccAddresses: [],
    bccAddresses: [],
    isTrash: false,
    isSpam: false,
    deletedAt: null,
  },
  {
    id: 'e-trash',
    userId: 'user-1',
    subject: 'Invoice refund',
    bodyPlain: 'refund issued',
    fromAddress: 'alice@x.com',
    fromName: 'Alice',
    toAddresses: ['me@quantmail.in'],
    ccAddresses: [],
    bccAddresses: [],
    isTrash: true,
    isSpam: false,
    deletedAt: null,
  },
  {
    id: 'e-trash-bob',
    userId: 'user-1',
    subject: 'Invoice voided',
    bodyPlain: 'voided',
    fromAddress: 'bob@x.com',
    fromName: 'Bob',
    toAddresses: ['me@quantmail.in'],
    ccAddresses: [],
    bccAddresses: [],
    isTrash: true,
    isSpam: false,
    deletedAt: null,
  },
  {
    id: 'e-spam',
    userId: 'user-1',
    subject: 'Invoice lottery',
    bodyPlain: 'you won',
    fromAddress: 'bob@x.com',
    fromName: 'Bob',
    toAddresses: ['me@quantmail.in'],
    ccAddresses: [],
    bccAddresses: [],
    isTrash: false,
    isSpam: true,
    deletedAt: null,
  },
  {
    id: 'e-trash-spam',
    userId: 'user-1',
    subject: 'Invoice double',
    bodyPlain: 'double',
    fromAddress: 'bob@x.com',
    fromName: 'Bob',
    toAddresses: ['me@quantmail.in'],
    ccAddresses: [],
    bccAddresses: [],
    isTrash: true,
    isSpam: true,
    deletedAt: null,
  },
  {
    id: 'e-other-user',
    userId: 'user-2',
    subject: 'Invoice secret',
    bodyPlain: 'not yours',
    fromAddress: 'alice@x.com',
    fromName: 'Alice',
    toAddresses: ['me@quantmail.in'],
    ccAddresses: [],
    bccAddresses: [],
    isTrash: true,
    isSpam: false,
    deletedAt: null,
  },
];

function matchesCondition(email: SeedEmail, key: string, cond: unknown): boolean {
  if (cond !== null && typeof cond === 'object' && !Array.isArray(cond)) {
    const c = cond as Record<string, unknown>;
    if ('contains' in c) {
      const value = String((email as unknown as Record<string, unknown>)[key] ?? '');
      const needle = String(c.contains);
      return c.mode === 'insensitive'
        ? value.toLowerCase().includes(needle.toLowerCase())
        : value.includes(needle);
    }
    if ('array_contains' in c) {
      const arr = (email as unknown as Record<string, unknown>)[key];
      return Array.isArray(arr) && arr.includes(c.array_contains);
    }
    return false;
  }
  return (email as unknown as Record<string, unknown>)[key] === cond;
}

function matchesWhere(email: SeedEmail, where: Record<string, unknown>): boolean {
  for (const [key, cond] of Object.entries(where)) {
    if (key === 'OR') {
      if (!(cond as unknown[]).some((c) => matchesWhere(email, c as Record<string, unknown>)))
        return false;
    } else if (key === 'AND') {
      if (!(cond as unknown[]).every((c) => matchesWhere(email, c as Record<string, unknown>)))
        return false;
    } else if (!matchesCondition(email, key, cond)) {
      return false;
    }
  }
  return true;
}

function createMockPrisma() {
  return {
    email: {
      findMany: vi.fn(async (args: { where: Record<string, unknown>; take?: number }) => {
        const matched = SEED.filter((e) => matchesWhere(e, args.where));
        return typeof args.take === 'number' ? matched.slice(0, args.take) : matched;
      }),
      count: vi.fn(
        async (args: { where: Record<string, unknown> }) =>
          SEED.filter((e) => matchesWhere(e, args.where)).length,
      ),
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    label: { findMany: vi.fn(async () => []) },
  };
}

describe('extractSpamTrashScope', () => {
  it('extracts the scope tokens and keeps the remaining text', () => {
    expect(extractSpamTrashScope('in:trash invoice refund')).toEqual({
      scopeQuery: 'in:trash',
      text: 'invoice refund',
    });
  });

  it('is case-insensitive and collects several scope tokens', () => {
    expect(extractSpamTrashScope('IN:TRASH in:spam invoice')).toEqual({
      scopeQuery: 'IN:TRASH in:spam',
      text: 'invoice',
    });
  });

  it('returns null scope for plain text and leaves it untouched', () => {
    expect(extractSpamTrashScope('invoice refund')).toEqual({ scopeQuery: null, text: 'invoice refund' });
  });

  it('does not treat quoted scope text or other operators as scope', () => {
    expect(extractSpamTrashScope('"in:trash" from:alice@x.com')).toEqual({
      scopeQuery: null,
      text: '"in:trash" from:alice@x.com',
    });
  });
});

describe('EmailService.search Spam/Trash scope operators', () => {
  let service: EmailService;

  beforeEach(() => {
    service = new EmailService(createMockPrisma() as never);
  });

  it('plain text still excludes trash and spam by default', async () => {
    const result = await service.search('user-1', 'invoice');
    expect(result.data.map((e) => e.id)).toEqual(['e-inbox']);
  });

  it('in:trash searches trash only', async () => {
    const result = await service.search('user-1', 'in:trash invoice');
    expect(result.data.map((e) => e.id).sort()).toEqual(['e-trash', 'e-trash-bob']);
  });

  it('in:spam searches spam only', async () => {
    const result = await service.search('user-1', 'in:spam invoice');
    expect(result.data.map((e) => e.id)).toEqual(['e-spam']);
  });

  it('is:spam searches spam only', async () => {
    const result = await service.search('user-1', 'is:spam invoice');
    expect(result.data.map((e) => e.id)).toEqual(['e-spam']);
  });

  it('in:anywhere searches everything including trash and spam', async () => {
    const result = await service.search('user-1', 'in:anywhere invoice');
    expect(result.data.map((e) => e.id).sort()).toEqual([
      'e-inbox',
      'e-spam',
      'e-trash',
      'e-trash-bob',
      'e-trash-spam',
    ]);
  });

  it('in:trash in:spam searches the trash ∪ spam union, not the inbox', async () => {
    const result = await service.search('user-1', 'in:trash in:spam invoice');
    expect(result.data.map((e) => e.id).sort()).toEqual([
      'e-spam',
      'e-trash',
      'e-trash-bob',
      'e-trash-spam',
    ]);
  });

  it('a bare in:trash lists trash (non-spam) without a text constraint', async () => {
    const result = await service.search('user-1', 'in:trash');
    expect(result.data.map((e) => e.id).sort()).toEqual(['e-trash', 'e-trash-bob']);
  });

  it('scope operators are case-insensitive', async () => {
    const result = await service.search('user-1', 'IN:TRASH invoice');
    expect(result.data.map((e) => e.id).sort()).toEqual(['e-trash', 'e-trash-bob']);
  });

  it('scope operators combine with filter-chip filters (AND)', async () => {
    const result = await service.search('user-1', 'in:trash invoice', {}, { from: 'alice@x.com' });
    expect(result.data.map((e) => e.id)).toEqual(['e-trash']);
  });

  it('non-scope operators stay literal on this path (documented behaviour)', async () => {
    const result = await service.search('user-1', 'from:alice@x.com');
    expect(result.data).toHaveLength(0);
    expect(result.total).toBe(0);
  });
});
