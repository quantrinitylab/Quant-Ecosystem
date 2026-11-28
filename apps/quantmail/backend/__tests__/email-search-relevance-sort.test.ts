import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EmailService, computeSearchScore } from '../services/email.service';

/**
 * fix/qm-search-relevance-sort — Gmail sorts search results by relevance by
 * default (newest/oldest as options); QuantMail hard-coded
 * `ORDER BY receivedAt DESC` with no way to change it, so a 6-month-old
 * highly-matching mail was buried under every recent partial match.
 *
 * These tests drive a real EmailService against an in-memory matcher that
 * evaluates the Prisma `where` clause the way Postgres would (`contains`
 * substring match, `array_contains` exact element match, OR/AND nesting,
 * receivedAt gte/lte) and honours `orderBy`/`skip`/`take`, proving:
 *   1. the default sort is relevance — the old subject-phrase mail beats
 *      recent partial matches despite being months older;
 *   2. `newest`/`oldest` return strict chronological order;
 *   3. equal scores break ties by recency;
 *   4. relevance pagination slices the ranked list, not the DB page;
 *   5. an unknown sort value degrades to relevance, never an error.
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
  receivedAt: Date;
};

const SEED: SeedEmail[] = [
  {
    id: 'e-old',
    userId: 'user-1',
    subject: 'Q4 budget planning',
    bodyPlain: 'see attached deck',
    fromAddress: 'alice@old.io',
    fromName: 'Alice',
    toAddresses: ['me@quantmail.in'],
    ccAddresses: [],
    bccAddresses: [],
    isTrash: false,
    isSpam: false,
    deletedAt: null,
    receivedAt: new Date('2026-04-01T10:00:00Z'),
  },
  {
    id: 'e-recent-body',
    userId: 'user-1',
    subject: 'Weekly update',
    bodyPlain: 'the Q4 budget is approved',
    fromAddress: 'bob@new.io',
    fromName: 'Bob',
    toAddresses: ['me@quantmail.in'],
    ccAddresses: [],
    bccAddresses: [],
    isTrash: false,
    isSpam: false,
    deletedAt: null,
    receivedAt: new Date('2026-10-20T10:00:00Z'),
  },
  {
    // Scores below e-old but above e-recent-body for 'Q4 budget': the
    // subject carries one term (20) and the body carries the full phrase
    // (10 + 5 + 5). Note the seed MUST contain the whole query string
    // somewhere — the service's where clause matches the full `q`, not
    // individual terms, so a term-only mail never reaches the ranker.
    id: 'e-mid',
    userId: 'user-1',
    subject: 'budget review',
    bodyPlain: 'the Q4 budget draft',
    fromAddress: 'carol@new.io',
    fromName: 'Carol',
    toAddresses: ['me@quantmail.in'],
    ccAddresses: [],
    bccAddresses: [],
    isTrash: false,
    isSpam: false,
    deletedAt: null,
    receivedAt: new Date('2026-10-21T10:00:00Z'),
  },
  {
    id: 'e-tie-newer',
    userId: 'user-1',
    subject: 'budget',
    bodyPlain: 'x',
    fromAddress: 'dan@new.io',
    fromName: 'Dan',
    toAddresses: ['me@quantmail.in'],
    ccAddresses: [],
    bccAddresses: [],
    isTrash: false,
    isSpam: false,
    deletedAt: null,
    receivedAt: new Date('2026-10-22T10:00:00Z'),
  },
  {
    id: 'e-tie-older',
    userId: 'user-1',
    subject: 'budget',
    bodyPlain: 'y',
    fromAddress: 'erin@new.io',
    fromName: 'Erin',
    toAddresses: ['me@quantmail.in'],
    ccAddresses: [],
    bccAddresses: [],
    isTrash: false,
    isSpam: false,
    deletedAt: null,
    receivedAt: new Date('2026-10-19T10:00:00Z'),
  },
];

function timeOf(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  const t = Date.parse(String(value ?? ''));
  return Number.isNaN(t) ? 0 : t;
}

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
    if ('gte' in c || 'lte' in c) {
      const value = timeOf((email as unknown as Record<string, unknown>)[key]);
      if ('gte' in c && value < timeOf(c.gte)) return false;
      if ('lte' in c && value > timeOf(c.lte)) return false;
      return true;
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
      findMany: vi.fn(
        async (args: {
          where: Record<string, unknown>;
          skip?: number;
          take?: number;
          orderBy?: { receivedAt?: 'asc' | 'desc' };
        }) => {
          let matched = SEED.filter((e) => matchesWhere(e, args.where));
          if (args.orderBy?.receivedAt) {
            const dir = args.orderBy.receivedAt === 'asc' ? 1 : -1;
            matched = [...matched].sort(
              (a, b) => dir * (a.receivedAt.getTime() - b.receivedAt.getTime()),
            );
          }
          if (typeof args.skip === 'number') matched = matched.slice(args.skip);
          if (typeof args.take === 'number') matched = matched.slice(0, args.take);
          return matched;
        },
      ),
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

describe('computeSearchScore field weights', () => {
  it('a subject-phrase hit outscores a body-phrase hit', () => {
    const subjectHit = computeSearchScore(
      { subject: 'Q4 budget planning', bodyPlain: 'other' },
      'Q4 budget',
    );
    const bodyHit = computeSearchScore(
      { subject: 'Weekly update', bodyPlain: 'the Q4 budget is approved' },
      'Q4 budget',
    );
    expect(subjectHit).toBeGreaterThan(bodyHit);
  });

  it('a sender term hit outscores a body-only term hit', () => {
    // Multi-term query, neither field holding the full phrase, so the
    // phrase bonus does not muddy the per-term weights: sender 10 > body 5.
    const senderHit = computeSearchScore(
      { subject: 'Hello', bodyPlain: 'nothing here', fromAddress: 'budget@x.io', fromName: 'Budget' },
      'budget forecast',
    );
    const bodyHit = computeSearchScore(
      { subject: 'Hello', bodyPlain: 'budget notes', fromAddress: 'a@x.io', fromName: 'A' },
      'budget forecast',
    );
    expect(senderHit).toBeGreaterThan(bodyHit);
  });

  it('repeating one term does not inflate the score (presence, not count)', () => {
    const once = computeSearchScore({ subject: 'Hi', bodyPlain: 'budget' }, 'budget');
    const repeated = computeSearchScore(
      { subject: 'Hi', bodyPlain: 'budget budget budget budget budget' },
      'budget',
    );
    expect(repeated).toBe(once);
  });

  it('an empty query scores zero', () => {
    expect(computeSearchScore({ subject: 'Q4 budget' }, '   ')).toBe(0);
  });
});

describe('EmailService.search relevance + sort', () => {
  let service: EmailService;

  beforeEach(() => {
    service = new EmailService(createMockPrisma() as never);
  });

  it('defaults to relevance: the 6-month-old subject-phrase mail beats recent partial matches', async () => {
    const result = await service.search('user-1', 'Q4 budget');
    expect(result.data.map((e) => e.id)).toEqual(['e-old', 'e-mid', 'e-recent-body']);
    expect(result.total).toBe(3);
  });

  it('sort=newest returns strict reverse-chronological order', async () => {
    const result = await service.search('user-1', 'Q4 budget', { sort: 'newest' });
    expect(result.data.map((e) => e.id)).toEqual(['e-mid', 'e-recent-body', 'e-old']);
  });

  it('sort=oldest returns strict chronological order', async () => {
    const result = await service.search('user-1', 'Q4 budget', { sort: 'oldest' });
    expect(result.data.map((e) => e.id)).toEqual(['e-old', 'e-recent-body', 'e-mid']);
  });

  it('equal relevance scores break ties by recency', async () => {
    // e-mid leads outright (subject 60 + body 15 = 75); the three
    // subject-only 60s then order newest-first, ahead of the body-only 15.
    const result = await service.search('user-1', 'budget', { sort: 'relevance' });
    expect(result.data.map((e) => e.id)).toEqual([
      'e-mid',
      'e-tie-newer',
      'e-tie-older',
      'e-old',
      'e-recent-body',
    ]);
  });

  it('relevance pagination slices the ranked list, not the DB page', async () => {
    const page2 = await service.search('user-1', 'Q4 budget', { page: 2, pageSize: 2 });
    expect(page2.data.map((e) => e.id)).toEqual(['e-recent-body']);
    expect(page2.total).toBe(3);
    expect(page2.hasNext).toBe(false);
    expect(page2.hasPrev).toBe(true);
  });

  it('an unknown sort value degrades to relevance instead of failing', async () => {
    const result = await service.search('user-1', 'Q4 budget', {
      sort: 'bogus' as never,
    });
    expect(result.data.map((e) => e.id)).toEqual(['e-old', 'e-mid', 'e-recent-body']);
  });
});
