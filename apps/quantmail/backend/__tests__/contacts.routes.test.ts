// @vitest-environment node
// ============================================================================
// /contacts — the routes, not the service.
// ============================================================================
//
// Everything asserted here was, until this batch, a lie the server told with a
// 200 status code:
//
//   1. `?q=` and `?favorites=true` were dropped by a pagination-only schema, so
//      the search box filtered nothing and the Favorites tab listed everybody.
//      A schema test is the only kind that catches a *silently discarded* field
//      — a service test cannot see what the route threw away before calling it.
//   2. `PUT {"isFavorite":true}` parsed to `{}` and answered 200, so the star
//      toasted "Added to favorites" over an empty update and then reverted.
//   3. `GET /contacts/:id` had a client method and a detail panel but no route.
//   4. The list handler returned the whole PaginatedResult as `data`, so the
//      page did `data.map` on an object and crashed.
//
// HARNESS: the REAL contactsRoutes on a bare Fastify app, mounted at the same
// `/contacts` prefix `app.ts` uses, with the REAL error handler so a rejected
// body is asserted as the 400 a client actually receives. Prisma is a spy
// object — what the handler *passes down* is the thing under test.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify from 'fastify';
import { errorHandlerPlugin } from '@quant/server-core';
import contactsRoutes from '../routes/contacts';

const ROW = {
  id: 'c1',
  userId: 'user-1',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  avatar: null,
  phone: '+91 90000 00000',
  company: 'Analytical Engines',
  tags: ['vip'],
  isFavorite: true,
  frequency: 4,
  lastContactedAt: new Date('2026-08-01T00:00:00.000Z'),
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-08-01T00:00:00.000Z'),
};

function fakePrisma() {
  return {
    contact: {
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(ROW),
      findMany: vi.fn().mockResolvedValue([ROW]),
      count: vi.fn().mockResolvedValue(1),
      create: vi.fn().mockResolvedValue(ROW),
      update: vi.fn().mockResolvedValue(ROW),
      upsert: vi.fn().mockResolvedValue(ROW),
      delete: vi.fn().mockResolvedValue(ROW),
    },
  };
}

let prisma: ReturnType<typeof fakePrisma>;

async function buildApp(userId: string | null = 'user-1') {
  prisma = fakePrisma();
  const app = Fastify();
  await app.register(errorHandlerPlugin);
  // Only the `contact` delegate is faked; `fastify.prisma` is typed as the
  // whole client, hence the cast.
  app.decorate('prisma', prisma as never);
  app.addHook('onRequest', async (request) => {
    if (userId) (request as unknown as { auth: { userId: string } }).auth = { userId };
  });
  await app.register(contactsRoutes, { prefix: '/contacts' });
  await app.ready();
  return app;
}

/** The `where` the list handler passed to `findMany`. */
function listWhere(): Record<string, unknown> {
  const arg = prisma.contact.findMany.mock.calls[0]![0] as { where: Record<string, unknown> };
  return arg.where;
}

describe('GET /contacts', () => {
  it('answers the frontend contract: data is the array, pagination is metadata', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/contacts' });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    // `data.map is not a function` was this: the raw PaginatedResult as `data`.
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.metadata).toMatchObject({ total: 1, page: 1, pageSize: 20, totalPages: 1 });
  });

  it('forwards ?q= to the query instead of discarding it', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/contacts?q=analytical' });

    expect(res.statusCode).toBe(200);
    expect(listWhere()).toMatchObject({ userId: 'user-1' });
    expect(listWhere().OR).toHaveLength(4);
  });

  it('reads favorites=true as a filter and favorites=false as no filter', async () => {
    const on = await buildApp();
    await on.inject({ method: 'GET', url: '/contacts?favorites=true' });
    expect(listWhere()).toMatchObject({ isFavorite: true });

    const off = await buildApp();
    await off.inject({ method: 'GET', url: '/contacts?favorites=false' });
    // `z.coerce.boolean()` would have made this `true` — `Boolean('false')` is
    // `true` — and pinned the Favorites tab permanently on.
    expect(listWhere()).not.toHaveProperty('isFavorite');
  });

  it('400s a misspelt filter rather than silently listing everybody', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/contacts?favourites=true' });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
    expect(prisma.contact.findMany).not.toHaveBeenCalled();
  });

  it('400s a non-boolean favorites value', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/contacts?favorites=yes' });
    expect(res.statusCode).toBe(400);
  });

  it('forwards ?tag= as an array membership test', async () => {
    const app = await buildApp();
    await app.inject({ method: 'GET', url: '/contacts?tag=vip' });
    expect(listWhere()).toMatchObject({ tags: { has: 'vip' } });
  });

  it('401s an unauthenticated request', async () => {
    const app = await buildApp(null);
    const res = await app.inject({ method: 'GET', url: '/contacts' });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHORIZED');
  });
});

describe('POST /contacts', () => {
  it('persists phone, company, tags and isFavorite', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/contacts',
      payload: {
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        phone: '+91 90000 00000',
        company: 'Analytical Engines',
        tags: ['vip'],
        isFavorite: true,
      },
    });

    expect(res.statusCode).toBe(201);
    const arg = prisma.contact.create.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(arg.data).toMatchObject({
      userId: 'user-1',
      phone: '+91 90000 00000',
      company: 'Analytical Engines',
      tags: ['vip'],
      isFavorite: true,
      frequency: 0,
    });
  });

  it('refuses a tag containing the comma the create form splits on', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/contacts',
      payload: { name: 'Ada', email: 'ada@example.com', tags: ['vip,investor'] },
    });
    expect(res.statusCode).toBe(400);
    expect(prisma.contact.create).not.toHaveBeenCalled();
  });

  it('409s a duplicate email for the same user', async () => {
    const app = await buildApp();
    prisma.contact.findFirst.mockResolvedValue(ROW);
    const res = await app.inject({
      method: 'POST',
      url: '/contacts',
      payload: { name: 'Ada', email: 'ada@example.com' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('CONTACT_EXISTS');
  });
});

describe('PUT /contacts/:id', () => {
  it('keeps isFavorite instead of stripping it to an empty update', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/contacts/c1',
      payload: { isFavorite: true },
    });

    expect(res.statusCode).toBe(200);
    expect(prisma.contact.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { isFavorite: true },
    });
  });

  it('400s an empty body rather than reporting a no-op as success', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'PUT', url: '/contacts/c1', payload: {} });
    expect(res.statusCode).toBe(400);
    expect(prisma.contact.update).not.toHaveBeenCalled();
  });

  it('400s an unknown field rather than answering 200 to a body it ignored', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/contacts/c1',
      payload: { favourite: true },
    });
    expect(res.statusCode).toBe(400);
    expect(prisma.contact.update).not.toHaveBeenCalled();
  });

  it('refuses to let a client write its own frequency', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/contacts/c1',
      payload: { frequency: 9999 },
    });
    // Frequency is derived from send activity. A writable one would let anybody
    // fake their own "frequently contacted" ordering.
    expect(res.statusCode).toBe(400);
    expect(prisma.contact.update).not.toHaveBeenCalled();
  });

  it('403s a contact owned by somebody else', async () => {
    const app = await buildApp();
    prisma.contact.findUnique.mockResolvedValue({ ...ROW, userId: 'user-2' });
    const res = await app.inject({
      method: 'PUT',
      url: '/contacts/c1',
      payload: { name: 'Mine now' },
    });
    expect(res.statusCode).toBe(403);
    expect(prisma.contact.update).not.toHaveBeenCalled();
  });
});

describe('GET /contacts/:id and the static routes it shares a prefix with', () => {
  it('returns one contact', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/contacts/c1' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ id: 'c1', name: 'Ada Lovelace' });
    expect(prisma.contact.findUnique).toHaveBeenCalledWith({ where: { id: 'c1' } });
  });

  it('404s a contact that does not exist', async () => {
    const app = await buildApp();
    prisma.contact.findUnique.mockResolvedValue(null);
    const res = await app.inject({ method: 'GET', url: '/contacts/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('CONTACT_NOT_FOUND');
  });

  it('routes /search to search, not to :id', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/contacts/search?q=ada' });

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json().data)).toBe(true);
    // Fastify's radix router prefers the static segment. If it ever stopped,
    // this would arrive at `/:id` and 404 with a contact-shaped error.
    expect(prisma.contact.findMany).toHaveBeenCalled();
    expect(prisma.contact.findUnique).not.toHaveBeenCalled();
  });

  it('routes /frequent to the frequency ordering, not to :id', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/contacts/frequent?limit=5' });

    expect(res.statusCode).toBe(200);
    const arg = prisma.contact.findMany.mock.calls[0]![0] as { take: number; orderBy: unknown };
    expect(arg.take).toBe(5);
    expect(arg.orderBy).toEqual([
      { frequency: 'desc' },
      { lastContactedAt: { sort: 'desc', nulls: 'last' } },
      { name: 'asc' },
    ]);
    expect(prisma.contact.findUnique).not.toHaveBeenCalled();
  });

  it('400s a limit outside the range instead of clamping in the handler', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/contacts/frequent?limit=0' });
    expect(res.statusCode).toBe(400);
  });
});

describe('QM-SCREEN-012 R2: strict schemas 400 unknown keys instead of ignoring them', () => {
  it('400s an unknown query key on /search', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/contacts/search?q=ada&bogus=1' });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
    expect(prisma.contact.findMany).not.toHaveBeenCalled();
  });

  it('400s an unknown query key on /frequent', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/contacts/frequent?limit=5&bogus=1' });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
    expect(prisma.contact.findMany).not.toHaveBeenCalled();
  });

  it('400s an unknown body key on /duplicates/dismiss', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/contacts/duplicates/dismiss',
      payload: { primaryId: 'c1', duplicateId: 'c2', bogus: true },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('400s an unknown body key on /merge', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/contacts/merge',
      payload: { primaryId: 'c1', duplicateIds: ['c2'], bogus: true },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });
});

describe('DELETE /contacts/:id', () => {
  it('deletes a contact the caller owns', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'DELETE', url: '/contacts/c1' });
    expect(res.statusCode).toBe(200);
    expect(prisma.contact.delete).toHaveBeenCalledWith({ where: { id: 'c1' } });
  });

  it('403s a contact owned by somebody else', async () => {
    const app = await buildApp();
    prisma.contact.findUnique.mockResolvedValue({ ...ROW, userId: 'user-2' });
    const res = await app.inject({ method: 'DELETE', url: '/contacts/c1' });
    expect(res.statusCode).toBe(403);
    expect(prisma.contact.delete).not.toHaveBeenCalled();
  });
});

// ============================================================================
// GET /contacts/companies — server-side aggregation across ALL contacts.
// ============================================================================
//
// Regression: the Companies tab used to group on the client from the paginated
// list page (`GET /contacts` is 20/page, capped at 100), so companies whose
// members all sat on other pages never appeared and member counts
// undercounted — while the header copy read as complete. The endpoint is
// deliberately UNPAGINATED; the test that matters asserts `findMany` runs
// with no skip/take.
const COMPANIES_ROWS = [
  { ...ROW, id: 'c1', name: 'Ada Lovelace', email: 'ada@acme.example', company: 'Acme Corp' },
  // Same company, different case — and the member that used to sit on page 2
  // of the list, invisible to the old client-side grouping.
  { ...ROW, id: 'c2', name: 'Grace Hopper', email: 'grace@acme.example', company: 'acme corp' },
  // Same address as c1 on a different row: a duplicated import must not
  // inflate the company's headcount.
  { ...ROW, id: 'c3', name: 'Ada Duplicate', email: 'ADA@acme.example', company: 'Acme Corp' },
  { ...ROW, id: 'c4', name: 'Linus Torvalds', email: 'linus@linux.example', company: 'Linux Foundation' },
  // No company on the record — nothing honest to group by.
  { ...ROW, id: 'c5', name: 'Solo Act', email: 'solo@example.org', company: null },
];

describe('GET /contacts/companies', () => {
  it('groups across ALL contacts — the aggregation is not paginated', async () => {
    const app = await buildApp();
    prisma.contact.findMany.mockResolvedValue(COMPANIES_ROWS);
    const res = await app.inject({ method: 'GET', url: '/contacts/companies' });

    expect(res.statusCode).toBe(200);
    const groups = res.json().data;

    const acme = groups.find((g: { name: string }) => g.name === 'Acme Corp');
    expect(acme).toBeDefined();
    // c1 + c2 merged (case-insensitive key); the c3 duplicate address dropped.
    expect(acme.members).toHaveLength(2);
    expect(acme.members.map((m: { id: string }) => m.id).sort()).toEqual(['c1', 'c2']);
    // Subtitle is the members' own most common email domain — never invented.
    expect(acme.subtitle).toBe('@acme.example');

    const linux = groups.find((g: { name: string }) => g.name === 'Linux Foundation');
    expect(linux.members).toHaveLength(1);
    expect(linux.subtitle).toBe('@linux.example');

    // Solo Act has no company: no group is invented for them.
    expect(groups).toHaveLength(2);
    // Most members first, then alphabetical.
    expect(groups[0].name).toBe('Acme Corp');

    // THE regression assertion: no skip/take — every matching contact is
    // grouped, not just one list page of them.
    const findManyArg = prisma.contact.findMany.mock.calls[0]![0] as Record<string, unknown>;
    expect(findManyArg.skip).toBeUndefined();
    expect(findManyArg.take).toBeUndefined();
    expect((findManyArg.where as Record<string, unknown>).userId).toBe('user-1');
  });

  it('honours ?q= with the same predicate the list tab uses', async () => {
    const app = await buildApp();
    prisma.contact.findMany.mockResolvedValue(COMPANIES_ROWS);
    const res = await app.inject({ method: 'GET', url: '/contacts/companies?q=acme' });

    expect(res.statusCode).toBe(200);
    const where = prisma.contact.findMany.mock.calls[0]![0].where as Record<string, unknown>;
    expect(where.OR).toBeDefined();
  });

  it('honours ?favorites=true', async () => {
    const app = await buildApp();
    prisma.contact.findMany.mockResolvedValue(COMPANIES_ROWS);
    const res = await app.inject({ method: 'GET', url: '/contacts/companies?favorites=true' });

    expect(res.statusCode).toBe(200);
    const where = prisma.contact.findMany.mock.calls[0]![0].where as Record<string, unknown>;
    expect(where.isFavorite).toBe(true);
  });

  it('401s an unauthenticated request', async () => {
    const app = await buildApp(null);
    const res = await app.inject({ method: 'GET', url: '/contacts/companies' });

    expect(res.statusCode).toBe(401);
  });

  it('400s an unknown query key (strict schema)', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/contacts/companies?bogus=1' });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });
});

// ============================================================================
// GET /contacts/letters — server-side per-letter totals across ALL contacts.
// ============================================================================
//
// Regression: the contacts page rendered `{letter} ({group.contacts.length})`
// from the paginated list page (`GET /contacts` is 20/page, capped at 100),
// so a header reading "A (7)" on page 2 of 5 counted only page 2's
// A-contacts while reading as a total — and letters whose contacts all sat on
// other pages vanished from the sidebar index entirely. The endpoint is
// deliberately UNPAGINATED; the test that matters asserts `findMany` runs
// with no skip/take and selects only the columns the index needs.
const LETTER_ROWS = [
  { ...ROW, id: 'c1', name: 'Ada Lovelace', email: 'ada@example.com' },
  // Lowercase initial still buckets into 'A', like the client's toUpperCase().
  { ...ROW, id: 'c2', name: 'alan turing', email: 'alan@example.com' },
  // Empty name falls back to the email's initial, like the client.
  { ...ROW, id: 'c3', name: '', email: 'bob@example.com' },
  // Digit initial is not A–Z: buckets into '#', like the client.
  { ...ROW, id: 'c4', name: '123 Corp', email: 'info@123.example' },
  { ...ROW, id: 'c5', name: 'Zoe Adams', email: 'zoe@example.com' },
  // Phone-only record: no name AND no email — buckets into '#', like the client.
  { ...ROW, id: 'c6', name: null, email: null },
];

describe('GET /contacts/letters', () => {
  it('totals every letter across ALL contacts — the aggregation is not paginated', async () => {
    const app = await buildApp();
    prisma.contact.findMany.mockResolvedValue(LETTER_ROWS);
    const res = await app.inject({ method: 'GET', url: '/contacts/letters' });

    expect(res.statusCode).toBe(200);
    const groups = res.json().data as Array<{ letter: string; count: number }>;

    expect(groups).toEqual([
      { letter: 'A', count: 2 },
      { letter: 'B', count: 1 },
      { letter: 'Z', count: 1 },
      { letter: '#', count: 2 },
    ]);

    // THE regression assertion: no skip/take — every matching contact is
    // counted, not just one list page of them — and only name/email are
    // selected, the two columns the index groups by.
    const findManyArg = prisma.contact.findMany.mock.calls[0]![0] as Record<string, unknown>;
    expect(findManyArg.skip).toBeUndefined();
    expect(findManyArg.take).toBeUndefined();
    expect(findManyArg.select).toEqual({ name: true, email: true });
    expect((findManyArg.where as Record<string, unknown>).userId).toBe('user-1');
  });

  it('honours ?q= with the same predicate the list tab uses', async () => {
    const app = await buildApp();
    prisma.contact.findMany.mockResolvedValue(LETTER_ROWS);
    const res = await app.inject({ method: 'GET', url: '/contacts/letters?q=ada' });

    expect(res.statusCode).toBe(200);
    const where = prisma.contact.findMany.mock.calls[0]![0].where as Record<string, unknown>;
    expect(where.OR).toBeDefined();
  });

  it('honours ?favorites=true', async () => {
    const app = await buildApp();
    prisma.contact.findMany.mockResolvedValue(LETTER_ROWS);
    const res = await app.inject({ method: 'GET', url: '/contacts/letters?favorites=true' });

    expect(res.statusCode).toBe(200);
    const where = prisma.contact.findMany.mock.calls[0]![0].where as Record<string, unknown>;
    expect(where.isFavorite).toBe(true);
  });

  it('401s an unauthenticated request', async () => {
    const app = await buildApp(null);
    const res = await app.inject({ method: 'GET', url: '/contacts/letters' });

    expect(res.statusCode).toBe(401);
  });

  it('400s an unknown query key (strict schema)', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/contacts/letters?bogus=1' });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });
});
