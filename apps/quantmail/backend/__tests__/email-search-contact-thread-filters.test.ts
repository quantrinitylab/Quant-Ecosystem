import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EmailService } from '../services/email.service';

/**
 * QM-SCREEN-012 R2 regression.
 *
 * The contact detail sheet's "Mail Conversations" used to call
 * GET /emails/search with `q = "from:alice@x.com"` (a Gmail-style operator in
 * the free text). EmailService.search never parses operators: the literal
 * string "from:alice@x.com" is `contains`-matched against
 * subject/bodyPlain/fromAddress/fromName and `array_contains`-matched against
 * the recipient JSON arrays. A real address can never contain the substring
 * "from:alice@x.com", so that query returned zero rows even when threads
 * existed — the sheet always showed "No email threads found".
 *
 * The fix sends structured `from`/`to` query params (ANDed server-side by
 * search()) with the bare email as `q`. These tests drive a real
 * EmailService against an in-memory matcher that evaluates the Prisma `where`
 * clause the way Postgres would (`contains` substring match,
 * `array_contains` exact element match, OR/AND nesting), proving:
 *   1. the old operator-laden free text returns nothing (bug reproduced), and
 *   2. the structured from/to filters return the inbound and outbound threads.
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
    id: 'e-in',
    userId: 'user-1',
    subject: 'Re: timeline',
    bodyPlain: 'sounds good',
    fromAddress: 'alice@contact.io',
    fromName: 'Alice',
    toAddresses: ['me@quantmail.in'],
    ccAddresses: [],
    bccAddresses: [],
    isTrash: false,
    isSpam: false,
    deletedAt: null,
  },
  {
    id: 'e-out',
    userId: 'user-1',
    subject: 'Re: timeline',
    bodyPlain: 'sounds good',
    fromAddress: 'me@quantmail.in',
    fromName: 'Me',
    toAddresses: ['alice@contact.io'],
    ccAddresses: [],
    bccAddresses: [],
    isTrash: false,
    isSpam: false,
    deletedAt: null,
  },
  {
    id: 'e-other',
    userId: 'user-1',
    subject: 'standup notes',
    bodyPlain: 'yesterday…',
    fromAddress: 'bob@other.io',
    fromName: 'Bob',
    toAddresses: ['me@quantmail.in'],
    ccAddresses: [],
    bccAddresses: [],
    isTrash: false,
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
      if (!(cond as unknown[]).some((c) => matchesWhere(email, c as Record<string, unknown>))) return false;
    } else if (key === 'AND') {
      if (!(cond as unknown[]).every((c) => matchesWhere(email, c as Record<string, unknown>))) return false;
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
      count: vi.fn(async (args: { where: Record<string, unknown> }) =>
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

describe('EmailService.search contact thread filters (QM-SCREEN-012 R2)', () => {
  let service: EmailService;

  beforeEach(() => {
    service = new EmailService(createMockPrisma() as never);
  });

  it('the old operator-laden free text ("from:alice@contact.io") returns NOTHING', async () => {
    const result = await service.search('user-1', 'from:alice@contact.io');
    expect(result.data).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('the old operator-laden free text ("to:alice@contact.io") returns NOTHING', async () => {
    const result = await service.search('user-1', 'to:alice@contact.io');
    expect(result.data).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('structured `from` filter returns the inbound thread', async () => {
    const result = await service.search('user-1', 'alice@contact.io', {}, { from: 'alice@contact.io' });
    const ids = result.data.map((e) => e.id);
    expect(ids).toContain('e-in');
    expect(ids).not.toContain('e-out');
    expect(ids).not.toContain('e-other');
  });

  it('structured `to` filter returns the outbound thread', async () => {
    const result = await service.search('user-1', 'alice@contact.io', {}, { to: 'alice@contact.io' });
    const ids = result.data.map((e) => e.id);
    expect(ids).toContain('e-out');
    expect(ids).not.toContain('e-in');
    expect(ids).not.toContain('e-other');
  });
});
