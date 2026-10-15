import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ContactService } from '../services/contact.service';

// ============================================================================
// ContactService.searchContacts — company / phone / tags are searchable
// ============================================================================
//
// Gmail's contact lookup matches names, addresses AND company names; our
// `searchContacts` only checked name/email, so a person stored with just a
// company ("Acme") was unfindable by typing "acme". The mock below emulates
// Prisma's where-clause semantics (contains/insensitive, exact `has` on the
// tags list) so the tests pin the query the service builds, not just the
// mock's generosity.

const USER_ID = 'user-1';

interface MockContact {
  id: string;
  userId: string;
  name: string;
  email: string;
  company?: string | null;
  phone?: string | null;
  tags: string[];
  frequency: number;
}

function makeContact(overrides: Partial<MockContact> & { id: string }): MockContact {
  return {
    userId: USER_ID,
    name: 'Someone',
    email: 'someone@example.com',
    company: null,
    phone: null,
    tags: [],
    frequency: 0,
    ...overrides,
  };
}

function stringMatches(value: unknown, filter: { contains?: string; mode?: string }): boolean {
  if (value == null || filter.contains === undefined) return false;
  const hay = String(value);
  const needle = filter.contains;
  return filter.mode === 'insensitive'
    ? hay.toLowerCase().includes(needle.toLowerCase())
    : hay.includes(needle);
}

/** Minimal interpreter for the where-clauses `searchContacts` builds. */
function matchesWhere(contact: MockContact, where: Record<string, unknown>): boolean {
  if (where.userId !== undefined && contact.userId !== where.userId) return false;
  const or = where.OR as Array<Record<string, { contains?: string; mode?: string; has?: string }>> | undefined;
  if (or) {
    return or.some((cond) =>
      Object.entries(cond).every(([field, filter]) => {
        const value = (contact as unknown as Record<string, unknown>)[field];
        if (filter.has !== undefined) {
          return Array.isArray(value) && (value as string[]).includes(filter.has);
        }
        return stringMatches(value, filter);
      }),
    );
  }
  return true;
}

function createMockPrisma(contacts: MockContact[]) {
  return {
    contact: {
      findMany: vi.fn(async (args: { where?: Record<string, unknown>; take?: number; orderBy?: { frequency: string } }) => {
        let rows = contacts.filter((c) => matchesWhere(c, args.where ?? {}));
        if (args.orderBy?.frequency === 'desc') {
          rows = [...rows].sort((a, b) => b.frequency - a.frequency);
        }
        return args.take !== undefined ? rows.slice(0, args.take) : rows;
      }),
    },
  };
}

describe('ContactService.searchContacts — company/phone/tags matching', () => {
  const contacts = [
    makeContact({ id: 'c1', name: 'Anita Rao', email: 'anita@acme-corp.com', company: 'Acme', frequency: 1 }),
    makeContact({ id: 'c2', name: 'Bob Verma', email: 'bob@example.com', phone: '+91 98765 43210', frequency: 5 }),
    makeContact({ id: 'c3', name: 'Cara Lee', email: 'cara@example.com', tags: ['vendor', 'Acme Partner'], frequency: 2 }),
    makeContact({ id: 'c4', name: 'Dev Shah', email: 'dev@example.com', frequency: 9 }),
    makeContact({ id: 'c5', userId: 'other-user', name: 'Eve Other', email: 'eve@acme.com', company: 'Acme', frequency: 100 }),
  ];

  let service: ContactService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma(contacts);
    service = new ContactService(prisma as never);
  });

  it('finds a contact stored with only a company by typing the company', async () => {
    const results = await service.searchContacts(USER_ID, 'acme');
    const ids = results.map((c) => c.id);
    expect(ids).toContain('c1');
    // another user's Acme contact must not leak across the user boundary
    expect(ids).not.toContain('c5');
  });

  it('matches company case-insensitively', async () => {
    const results = await service.searchContacts(USER_ID, 'ACME');
    expect(results.map((c) => c.id)).toContain('c1');
  });

  it('finds a contact by a phone-number fragment', async () => {
    const results = await service.searchContacts(USER_ID, '98765');
    expect(results.map((c) => c.id)).toEqual(['c2']);
  });

  it('finds a contact by an exact tag', async () => {
    const results = await service.searchContacts(USER_ID, 'vendor');
    expect(results.map((c) => c.id)).toEqual(['c3']);
  });

  it('still matches name and email', async () => {
    expect((await service.searchContacts(USER_ID, 'anita')).map((c) => c.id)).toContain('c1');
    expect((await service.searchContacts(USER_ID, 'bob@example.com')).map((c) => c.id)).toContain('c2');
  });

  it('ranks name/email hits above company hits', async () => {
    // c4 has the highest frequency, but for query "anita" it is no match at
    // all; the point here: c1 matches by name (primary) AND company, c2 only
    // by phone for another query. Build the real case: a name hit with lower
    // frequency must outrank a company-only hit with higher frequency.
    const ranked = [
      makeContact({ id: 'n1', name: 'Acme Fan', email: 'fan@example.com', frequency: 1 }),
      makeContact({ id: 'n2', name: 'Zed', email: 'zed@example.com', company: 'Acme Industries', frequency: 50 }),
    ];
    const p = createMockPrisma(ranked);
    const s = new ContactService(p as never);
    const results = await s.searchContacts(USER_ID, 'acme');
    expect(results.map((c) => c.id)).toEqual(['n1', 'n2']);
  });

  it('returns no results for a non-matching query', async () => {
    const results = await service.searchContacts(USER_ID, 'zzz-no-such-contact');
    expect(results).toEqual([]);
  });
});
