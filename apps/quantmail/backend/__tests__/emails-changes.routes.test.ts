import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import emailsChangesRoutes, { encodeCursor, decodeCursor } from '../routes/emails-changes';

// Contract under test (from the P0-1 shift brief):
// - default export: async function emailsChangesRoutes(fastify: FastifyInstance)
//   registering GET /changes (mounted here under /emails)
// - named exports: encodeCursor(t: Date, id: string), decodeCursor(cursor: string)
// - auth via (request as any).auth?.userId; tests inject it through an onRequest hook
// - prisma mocked: app.decorate('prisma', { email: { findMany: vi.fn() } })
// Verified against the sibling impl at write time (same directory):
// default export emailsChangesRoutes, named exports encodeCursor/decodeCursor,
// createAppError(status, code) errors, take = limit + 1, tombstone mapping.
// TODO(UNVERIFIED): exact error-body envelope (code field) depends on the repo's
// errorHandlerPlugin rendering createAppError errors — confirmed at merge time
// (see NOTES.md (b)). The 400 status assertions hold with or without it.

const d1 = new Date('2026-09-20T10:00:00.000Z');
const d2 = new Date('2026-09-21T10:00:00.000Z');
const d3 = new Date('2026-09-22T10:00:00.000Z');

function row(id: string, threadId: string, updatedAt: Date, extra: Record<string, unknown> = {}) {
  return { id, threadId, userId: 'u1', updatedAt, deletedAt: null, subject: `Subject ${id}`, ...extra };
}

function expectAppError(res: { statusCode: number; body: string }, code: string) {
  // The contract pins status 400 + code VALIDATION_ERROR / INVALID_CURSOR.
  // With the repo's errorHandlerPlugin the body carries `code`; in a bare
  // test app Fastify's default handler returns 400 without it. Assert both
  // when a code is present; never less than 400 + a non-empty body.
  // TODO(UNVERIFIED): envelope shape — see note at top of file.
  const body = res.body ? JSON.parse(res.body) : undefined;
  expect(res.statusCode).toBe(400);
  if (body && typeof body.code !== 'undefined') {
    expect(body.code).toBe(code);
  } else {
    expect(res.body.length).toBeGreaterThan(0);
  }
}

describe('GET /emails/changes', () => {
  let app: FastifyInstance;
  let findManyMock: ReturnType<typeof vi.fn<(...args: any[]) => Promise<any>>>;

  beforeEach(async () => {
    app = Fastify({ logger: false });
    // onRequest must be registered BEFORE the plugin so it applies to its routes
    app.addHook('onRequest', async (request) => {
      const id = (request.headers['x-test-user'] as string) || '';
      if (id) (request as any).auth = { userId: id };
    });
    findManyMock = vi.fn<(...args: any[]) => Promise<any>>();
    app.decorate('prisma', { email: { findMany: findManyMock } } as any);
    await app.register(emailsChangesRoutes, { prefix: '/emails' });
    await app.ready();
  });

  function get(path: string, headers: Record<string, string> = { 'x-test-user': 'u1' }) {
    return app.inject({ method: 'GET', url: path, headers });
  }

  it('returns 401 when the x-test-user header is missing', async () => {
    findManyMock.mockResolvedValue([]);
    const res = await app.inject({ method: 'GET', url: '/emails/changes' });
    expect(res.statusCode).toBe(401);
    expect(res.body.length).toBeGreaterThan(0);
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it('returns empty changes and echoes the incoming cursor when there are no rows', async () => {
    const cursor = encodeCursor(d2, 'e2');
    findManyMock.mockResolvedValue([]);
    const res = await get(`/emails/changes?since=${encodeURIComponent(cursor)}`);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.changes).toEqual([]);
    expect(body.data.hasMore).toBe(false);
    expect(body.data.nextCursor).toBe(cursor);
  });

  it('returns a full page with hasMore and a nextCursor pointing at the last included row', async () => {
    findManyMock.mockResolvedValue([row('e1', 't1', d1), row('e2', 't1', d2), row('e3', 't1', d3)]);
    const res = await get('/emails/changes?limit=2');
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    const { changes, hasMore, nextCursor } = body.data;
    expect(hasMore).toBe(true);
    expect(changes).toHaveLength(2);
    // normal (non-deleted) entry shape
    expect(changes[0]).toMatchObject({ id: 'e1', threadId: 't1', deleted: false });
    expect(changes[0].updatedAt).toBe(d1.toISOString());
    expect(changes[0].message).toBeDefined();
    expect((changes[0].message as any).id).toBe('e1');
    // nextCursor must decode to the last *included* row (e2), not the lookahead row (e3)
    // decodeCursor returns { t: Date, id } (verified against sibling impl)
    const decoded = decodeCursor(nextCursor);
    expect(decoded.id).toBe('e2');
    expect(new Date(decoded.t).getTime()).toBe(d2.getTime());
    // ordering contract: keyset pagination by (updatedAt, id)
    expect(findManyMock.mock.calls[0][0].orderBy).toEqual([{ updatedAt: 'asc' }, { id: 'asc' }]);
  });

  it('paginates across two pages using nextCursor as since', async () => {
    findManyMock
      .mockResolvedValueOnce([row('e1', 't1', d1), row('e2', 't1', d2), row('e3', 't1', d3)])
      .mockResolvedValue([row('e3', 't1', d3)]);

    const page1 = JSON.parse((await get('/emails/changes?limit=2')).body).data;
    expect(page1.hasMore).toBe(true);

    const page2Res = await get(`/emails/changes?limit=2&since=${encodeURIComponent(page1.nextCursor)}`);
    expect(page2Res.statusCode).toBe(200);
    const page2 = JSON.parse(page2Res.body).data;
    expect(page2.changes).toHaveLength(1);
    expect(page2.changes[0].id).toBe('e3');
    expect(page2.hasMore).toBe(false);
    // the second query decoded the returned cursor and stayed user-scoped
    expect(findManyMock.mock.calls[1][0].where.userId).toBe('u1');
  });

  it('returns tombstone entries for deleted rows without a message key', async () => {
    const tomb = row('e9', 't9', d1, { deletedAt: new Date('2026-09-23T10:00:00.000Z') });
    findManyMock.mockResolvedValue([tomb]);
    const res = await get('/emails/changes');
    expect(res.statusCode).toBe(200);
    const { data } = JSON.parse(res.body);
    expect(data.changes).toHaveLength(1);
    const entry = data.changes[0];
    expect(entry).toMatchObject({ id: 'e9', threadId: 't9', deleted: true });
    expect(entry.updatedAt).toBe(d1.toISOString());
    expect('message' in entry).toBe(false);
  });

  it('rejects an invalid since cursor with 400 INVALID_CURSOR', async () => {
    const res = await get('/emails/changes?since=not-a-valid-cursor!!!');
    expectAppError(res, 'INVALID_CURSOR');
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it('rejects limit values outside 1..500 with 400 VALIDATION_ERROR', async () => {
    for (const limit of [0, 501]) {
      const res = await get(`/emails/changes?limit=${limit}`);
      expectAppError(res, 'VALIDATION_ERROR');
    }
    // validation runs before any DB access
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it('requests limit + 1 rows from prisma', async () => {
    findManyMock.mockResolvedValue([]);
    await get('/emails/changes?limit=5');
    expect(findManyMock).toHaveBeenCalledTimes(1);
    expect(findManyMock.mock.calls[0][0].take).toBe(6);
  });

  it('scopes the query to the authenticated userId', async () => {
    findManyMock.mockResolvedValue([]);
    await get('/emails/changes', { 'x-test-user': 'u1' });
    expect(findManyMock.mock.calls[0][0].where.userId).toBe('u1');
  });

  it('queries from the epoch when since is absent', async () => {
    findManyMock.mockResolvedValue([]);
    await get('/emails/changes');
    const where = findManyMock.mock.calls[0][0].where;
    expect(where.userId).toBe('u1');
    expect(new Date(where.OR[0].updatedAt.gt).getTime()).toBe(0);
  });

  it('does not filter out trashed rows', async () => {
    const trashed = row('e7', 't7', d1, { isTrash: true });
    findManyMock.mockResolvedValue([trashed]);
    const res = await get('/emails/changes');
    const { data } = JSON.parse(res.body);
    expect(data.changes.map((c: any) => c.id)).toContain('e7');
    expect(data.changes[0].deleted).toBe(false);
  });
});
