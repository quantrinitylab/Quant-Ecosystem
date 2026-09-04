// @vitest-environment node
// ============================================================================
// /contact-groups — the routes, not the service.
// ============================================================================
//
// The inbox shipped a "New group" button that toasted `Group "Family" created
// with 3 members!` and then pushed to /compose. Nothing was stored — there was
// no table, no route, no client method — so the group did not outlive the toast.
//
// There is therefore no legacy behaviour to protect here, and these tests exist
// for the opposite reason to the ones in `contacts.routes.test.ts`: not to pin
// down a lie that already shipped, but to hold a brand-new surface to the exact
// contract its only client was written against.
//
//   1. `data` IS the array. `useContactGroups` does `response.data ?? []` and
//      the chip strip does `savedGroups.map`, so a PaginatedResult here — the
//      bug `/contacts` actually had — crashes the inbox.
//   2. Membership is normalised server-side. The editor sends whatever chips it
//      is holding; `Ada@x.com` and `ada@x.com` are one person, and a member
//      count that says two is a count the user can see is wrong.
//   3. A duplicate name is a 409 whose message is readable, case-insensitively.
//      The dialog prints `error.message` verbatim into the form.
//   4. An unknown or empty body is a 400 — never a 200 over an empty update.
//   5. Ownership is 404-before-403, so a probe cannot use the status code to
//      confirm that somebody else's group id is real.
//
// HARNESS: the REAL contactGroupsRoutes on a bare Fastify app, at the same
// `/contact-groups` prefix `app.ts` mounts them under, with the REAL error
// handler so a rejected body is asserted as the 400 a client actually receives.
// Prisma is a spy object — what the route and service *pass down* is the thing
// under test.

import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { errorHandlerPlugin } from '@quant/server-core';
import contactGroupsRoutes from '../routes/contact-groups';

const ROW = {
  id: 'g1',
  userId: 'user-1',
  name: 'Family',
  emails: ['ada@example.com', 'grace@example.com'],
  color: '#34D399',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-08-01T00:00:00.000Z'),
};

function fakePrisma() {
  return {
    contactGroup: {
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(ROW),
      findMany: vi.fn().mockResolvedValue([ROW]),
      create: vi.fn().mockResolvedValue(ROW),
      update: vi.fn().mockResolvedValue(ROW),
      delete: vi.fn().mockResolvedValue(ROW),
    },
  };
}

let prisma: ReturnType<typeof fakePrisma>;

async function buildApp(userId: string | null = 'user-1') {
  prisma = fakePrisma();
  const app = Fastify();
  await app.register(errorHandlerPlugin);
  // Only the `contactGroup` delegate is faked; `fastify.prisma` is typed as the
  // whole client, hence the cast.
  app.decorate('prisma', prisma as never);
  app.addHook('onRequest', async (request) => {
    if (userId) (request as unknown as { auth: { userId: string } }).auth = { userId };
  });
  await app.register(contactGroupsRoutes, { prefix: '/contact-groups' });
  await app.ready();
  return app;
}

/** The single argument object a spy was called with, for reading `where`/`data`. */
function argOf(spy: { mock: { calls: unknown[][] } }, call = 0): Record<string, unknown> {
  return spy.mock.calls[call]![0] as Record<string, unknown>;
}

/** The `data` the handler handed to `create`. */
function createdData(): Record<string, unknown> {
  return argOf(prisma.contactGroup.create).data as Record<string, unknown>;
}

/** The `data` the handler handed to `update`. */
function updatedData(): Record<string, unknown> {
  return argOf(prisma.contactGroup.update).data as Record<string, unknown>;
}

/** The `where` a name-clash pre-check was run with. */
function clashWhere(): Record<string, unknown> {
  return argOf(prisma.contactGroup.findFirst).where as Record<string, unknown>;
}

describe('GET /contact-groups', () => {
  it('answers the client contract: data is the array, with no pagination envelope', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/contact-groups' });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data).toHaveLength(1);
    // `/contacts` shipped the whole PaginatedResult as `data` and the page did
    // `data.map` on an object. A chip strip the user built by hand has no page
    // two, so there is deliberately nothing to paginate here.
    expect(body).not.toHaveProperty('metadata');
  });

  it('lists alphabetically, scoped to the caller, and unpaginated', async () => {
    const app = await buildApp();
    await app.inject({ method: 'GET', url: '/contact-groups' });

    const arg = argOf(prisma.contactGroup.findMany);
    expect(arg).toEqual({ where: { userId: 'user-1' }, orderBy: [{ name: 'asc' }] });
    // Spelled as an exact equality rather than `toMatchObject` on purpose: a
    // `take` that crept in later would be a group the strip cannot reach and the
    // user cannot delete, and `toMatchObject` would not notice it.
    expect(arg).not.toHaveProperty('take');
    expect(arg).not.toHaveProperty('skip');
  });

  it('ignores a query string it does not understand instead of 400ing', async () => {
    // There is no query schema on this route because there are no filters. A
    // stray `?page=2` from a stale client should list the groups, not fail.
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/contact-groups?page=2' });
    expect(res.statusCode).toBe(200);
  });

  it('401s an unauthenticated request', async () => {
    const app = await buildApp(null);
    const res = await app.inject({ method: 'GET', url: '/contact-groups' });

    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHORIZED');
    expect(prisma.contactGroup.findMany).not.toHaveBeenCalled();
  });
});

describe('POST /contact-groups', () => {
  it('201s and stores name, members and accent under the caller', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/contact-groups',
      payload: { name: 'Family', emails: ['ada@example.com'], color: '#34D399' },
    });

    expect(res.statusCode).toBe(201);
    expect(createdData()).toEqual({
      userId: 'user-1',
      name: 'Family',
      emails: ['ada@example.com'],
      color: '#34D399',
    });
  });

  it('lowercases and de-duplicates so one address is one member', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/contact-groups',
      payload: {
        name: 'Family',
        emails: ['  ADA@Example.COM  ', 'ada@example.com', 'Grace@Example.com'],
      },
    });

    expect(res.statusCode).toBe(201);
    // Three chips in, two members out — and the count the strip renders is
    // `emails.length`, so folding on write is what stops the chip claiming three.
    expect(createdData().emails).toEqual(['ada@example.com', 'grace@example.com']);
  });

  it('defaults the accent to null rather than leaving the column undefined', async () => {
    const app = await buildApp();
    await app.inject({ method: 'POST', url: '/contact-groups', payload: { name: 'Standup' } });

    // The editor's first swatch is "Default orange", which is `color: null` — the
    // chip then paints brand orange itself. An `undefined` here would be Prisma
    // "leave it alone" on create, which happens to mean the same thing today and
    // would stop meaning it the moment the column gained a default.
    expect(createdData().color).toBeNull();
    expect(createdData().emails).toEqual([]);
  });

  it('accepts an explicit null accent', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/contact-groups',
      payload: { name: 'Standup', color: null },
    });

    expect(res.statusCode).toBe(201);
    expect(createdData().color).toBeNull();
  });

  it('400s a member that is not an address', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/contact-groups',
      payload: { name: 'Family', emails: ['ada@example.com', 'not-an-address'] },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
    expect(prisma.contactGroup.create).not.toHaveBeenCalled();
  });

  it('400s a blank member rather than quietly dropping it', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/contact-groups',
      payload: { name: 'Family', emails: ['ada@example.com', '   '] },
    });

    // The route is the strict layer: `.trim().email()` rejects a blank before the
    // service is reached. `normalizeEmails` also folds blanks away, which is not
    // dead code — it is what protects a direct service caller — but over HTTP the
    // 400 is the observable behaviour, and no real client sends one.
    expect(res.statusCode).toBe(400);
    expect(prisma.contactGroup.create).not.toHaveBeenCalled();
  });

  it('400s an unknown field instead of storing a group that ignored it', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/contact-groups',
      payload: { name: 'Family', members: ['ada@example.com'] },
    });

    expect(res.statusCode).toBe(400);
    expect(prisma.contactGroup.create).not.toHaveBeenCalled();
  });

  it.each([
    ['whitespace only', '   '],
    ['a line break', 'Fam\nily'],
    ['past 60 characters', 'x'.repeat(61)],
  ])('400s a name that is %s', async (_label, name) => {
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/contact-groups', payload: { name } });

    expect(res.statusCode).toBe(400);
    expect(prisma.contactGroup.create).not.toHaveBeenCalled();
  });

  it('400s more than 200 members', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/contact-groups',
      payload: {
        name: 'Everyone',
        emails: Array.from({ length: 201 }, (_, i) => `u${i}@example.com`),
      },
    });

    // The cap is the envelope, not a taste judgement: a group nobody can send to
    // is a group that cannot do the one thing groups exist for.
    expect(res.statusCode).toBe(400);
    expect(prisma.contactGroup.create).not.toHaveBeenCalled();
  });

  it('409s a name that differs only in case, quoting the spelling already stored', async () => {
    const app = await buildApp();
    prisma.contactGroup.findFirst.mockResolvedValue(ROW);
    const res = await app.inject({
      method: 'POST',
      url: '/contact-groups',
      payload: { name: 'family' },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('GROUP_EXISTS');
    // The dialog prints this string verbatim, so it names the group the user can
    // actually see — `Family`, not the `family` they just typed.
    expect(res.json().error.message).toBe('You already have a group called "Family"');
    expect(clashWhere()).toEqual({
      userId: 'user-1',
      name: { equals: 'family', mode: 'insensitive' },
    });
    expect(prisma.contactGroup.create).not.toHaveBeenCalled();
  });

  it('401s a well-formed unauthenticated create without touching the database', async () => {
    const app = await buildApp(null);
    const res = await app.inject({
      method: 'POST',
      url: '/contact-groups',
      payload: { name: 'Family', emails: ['ada@example.com'] },
    });

    // The body is validated before the caller is authenticated, matching
    // `contacts.ts`. What matters is that nothing is read or written either way.
    expect(res.statusCode).toBe(401);
    expect(prisma.contactGroup.findFirst).not.toHaveBeenCalled();
    expect(prisma.contactGroup.create).not.toHaveBeenCalled();
  });
});

describe('GET /contact-groups/:id', () => {
  it('returns one group', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/contact-groups/g1' });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ id: 'g1', name: 'Family' });
    expect(prisma.contactGroup.findUnique).toHaveBeenCalledWith({ where: { id: 'g1' } });
  });

  it('404s a group that does not exist', async () => {
    const app = await buildApp();
    prisma.contactGroup.findUnique.mockResolvedValue(null);
    const res = await app.inject({ method: 'GET', url: '/contact-groups/nope' });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('GROUP_NOT_FOUND');
  });

  it("403s somebody else's group, and only after proving it exists", async () => {
    const app = await buildApp();
    prisma.contactGroup.findUnique.mockResolvedValue({ ...ROW, userId: 'user-2' });
    const res = await app.inject({ method: 'GET', url: '/contact-groups/g1' });

    // 404-before-403: an id that is missing and an id that belongs to someone
    // else must not be distinguishable by anything cheaper than owning it.
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('FORBIDDEN');
  });
});

describe('PUT /contact-groups/:id', () => {
  it('400s an empty body rather than reporting a no-op as success', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'PUT', url: '/contact-groups/g1', payload: {} });

    // `.strict()` plus all-optional still admits `{}`, which Prisma would run as
    // an empty update and the editor would report as a save. The `.refine` is the
    // only thing standing between those two facts. (`updateGroup`'s own
    // EMPTY_UPDATE guard is unreachable over HTTP because of this, by design.)
    expect(res.statusCode).toBe(400);
    expect(prisma.contactGroup.update).not.toHaveBeenCalled();
  });

  it.each([
    ['an unknown field', { colour: '#ffffff' }],
    ['a client-chosen owner', { userId: 'user-2' }],
    ['a client-chosen id', { id: 'g9' }],
  ])('400s %s', async (_label, payload) => {
    const app = await buildApp();
    const res = await app.inject({ method: 'PUT', url: '/contact-groups/g1', payload });

    expect(res.statusCode).toBe(400);
    expect(prisma.contactGroup.update).not.toHaveBeenCalled();
  });

  it('replaces the whole member list instead of merging into it', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/contact-groups/g1',
      payload: { emails: ['NEW@Example.com'] },
    });

    expect(res.statusCode).toBe(200);
    // ROW holds two members; the editor always holds the whole list, so a merge
    // would make removing a member impossible.
    expect(updatedData()).toEqual({ emails: ['new@example.com'] });
  });

  it('clears the accent when sent null, and touches nothing else', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/contact-groups/g1',
      payload: { color: null },
    });

    expect(res.statusCode).toBe(200);
    // The service branches on `!== undefined`, not on truthiness. Picking
    // "Default orange" on a group that had green must actually clear the column.
    expect(updatedData()).toEqual({ color: null });
  });

  it('lets a group keep its own name on rename', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/contact-groups/g1',
      payload: { name: 'Family', emails: ['ada@example.com'] },
    });

    // The editor sends the name field on every save, untouched or not. Without
    // the `NOT` the group would collide with itself and no edit would ever land.
    expect(res.statusCode).toBe(200);
    expect(clashWhere()).toEqual({
      userId: 'user-1',
      name: { equals: 'Family', mode: 'insensitive' },
      NOT: { id: 'g1' },
    });
  });

  it("409s a rename onto another group's name", async () => {
    const app = await buildApp();
    prisma.contactGroup.findFirst.mockResolvedValue({ ...ROW, id: 'g2', name: 'Standup' });
    const res = await app.inject({
      method: 'PUT',
      url: '/contact-groups/g1',
      payload: { name: 'standup' },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('GROUP_EXISTS');
    expect(prisma.contactGroup.update).not.toHaveBeenCalled();
  });

  it("403s somebody else's group", async () => {
    const app = await buildApp();
    prisma.contactGroup.findUnique.mockResolvedValue({ ...ROW, userId: 'user-2' });
    const res = await app.inject({
      method: 'PUT',
      url: '/contact-groups/g1',
      payload: { name: 'Mine now' },
    });

    expect(res.statusCode).toBe(403);
    expect(prisma.contactGroup.update).not.toHaveBeenCalled();
  });

  it('401s an unauthenticated update', async () => {
    const app = await buildApp(null);
    const res = await app.inject({
      method: 'PUT',
      url: '/contact-groups/g1',
      payload: { name: 'Family' },
    });

    expect(res.statusCode).toBe(401);
    expect(prisma.contactGroup.update).not.toHaveBeenCalled();
  });
});

describe('DELETE /contact-groups/:id', () => {
  it('deletes a group the caller owns and hands the row back', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'DELETE', url: '/contact-groups/g1' });

    expect(res.statusCode).toBe(200);
    expect(prisma.contactGroup.delete).toHaveBeenCalledWith({ where: { id: 'g1' } });
    // The inbox's undo re-creates the group from what it already had client-side,
    // but returning the row keeps `apiClient.deleteContactGroup`'s envelope honest
    // rather than making a caller guess what it removed.
    expect(res.json().data).toMatchObject({ id: 'g1', name: 'Family' });
  });

  it('404s a group that does not exist', async () => {
    const app = await buildApp();
    prisma.contactGroup.findUnique.mockResolvedValue(null);
    const res = await app.inject({ method: 'DELETE', url: '/contact-groups/nope' });

    expect(res.statusCode).toBe(404);
    expect(prisma.contactGroup.delete).not.toHaveBeenCalled();
  });

  it("403s somebody else's group", async () => {
    const app = await buildApp();
    prisma.contactGroup.findUnique.mockResolvedValue({ ...ROW, userId: 'user-2' });
    const res = await app.inject({ method: 'DELETE', url: '/contact-groups/g1' });

    expect(res.statusCode).toBe(403);
    expect(prisma.contactGroup.delete).not.toHaveBeenCalled();
  });

  it('401s an unauthenticated delete', async () => {
    const app = await buildApp(null);
    const res = await app.inject({ method: 'DELETE', url: '/contact-groups/g1' });

    expect(res.statusCode).toBe(401);
    expect(prisma.contactGroup.findUnique).not.toHaveBeenCalled();
    expect(prisma.contactGroup.delete).not.toHaveBeenCalled();
  });
});
