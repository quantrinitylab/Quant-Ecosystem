import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import emailsRoutes, {
  encodeEmailListCursor,
  decodeEmailListCursor,
} from '../routes/emails';

// QM-UIUX-040: GET /emails keyset (cursor) pagination.
//
// The prisma double below is an honest in-memory evaluator for exactly the
// query shapes this route emits (scalar equality, null checks, lt/gt
// operator objects, AND/OR nesting, orderBy, skip/take) — it applies the
// route's real `where` instead of returning canned rows, so a wrong keyset
// condition shows up here as duplicated or skipped mail, the same failure a
// user would see. Ordering mirrors Postgres: `receivedAt desc` sorts NULLs
// first, then createdAt desc, then id desc.
//
// The drift scenario is the point of the feature: fetch page 1, a newer
// email lands, fetch page 2 by cursor — offset would repeat the tail of
// page 1 and drop a row; the cursor must return exactly the next rows.

type Row = Record<string, any>;

function compareValues(a: any, b: any): number {
  const av = a instanceof Date ? a.getTime() : a;
  const bv = b instanceof Date ? b.getTime() : b;
  if (av === bv) return 0;
  if (av === null || av === undefined) return -1;
  if (bv === null || bv === undefined) return 1;
  return av < bv ? -1 : 1;
}

function matchesField(value: any, cond: any): boolean {
  if (cond === null) return value === null || value === undefined;
  if (cond instanceof Date) {
    return value instanceof Date && value.getTime() === cond.getTime();
  }
  if (typeof cond === 'object') {
    for (const [op, operand] of Object.entries(cond)) {
      switch (op) {
        case 'lt':
          if (!(value !== null && value !== undefined && compareValues(value, operand) < 0))
            return false;
          break;
        case 'lte':
          if (!(value !== null && value !== undefined && compareValues(value, operand) <= 0))
            return false;
          break;
        case 'gt':
          if (!(value !== null && value !== undefined && compareValues(value, operand) > 0))
            return false;
          break;
        case 'gte':
          if (!(value !== null && value !== undefined && compareValues(value, operand) >= 0))
            return false;
          break;
        case 'not':
          if (matchesField(value, operand)) return false;
          break;
        default:
          throw new Error(`test double: unsupported operator "${op}"`);
      }
    }
    return true;
  }
  return value === cond;
}

function matchesWhere(row: Row, where: Row): boolean {
  for (const [key, cond] of Object.entries(where)) {
    if (key === 'AND') {
      if (!(cond as Row[]).every((c) => matchesWhere(row, c))) return false;
    } else if (key === 'OR') {
      if (!(cond as Row[]).some((c) => matchesWhere(row, c))) return false;
    } else if (!matchesField(row[key], cond)) {
      return false;
    }
  }
  return true;
}

function compareRows(a: Row, b: Row, orderBy: Array<Record<string, string>>): number {
  for (const term of orderBy) {
    const [field, dir] = Object.entries(term)[0];
    const av = a[field];
    const bv = b[field];
    if (av == null && bv == null) continue;
    // Postgres defaults: NULLs first on DESC, last on ASC. Null placement is
    // decided here and must not be flipped by the value comparison below.
    if (av == null) return dir === 'desc' ? -1 : 1;
    if (bv == null) return dir === 'desc' ? 1 : -1;
    const cmp = compareValues(av, bv);
    if (cmp !== 0) return dir === 'desc' ? -cmp : cmp;
  }
  return 0;
}

function makePrisma(rows: Row[]) {
  const store = [...rows];
  const email = {
    findMany: vi.fn(async (args: Row = {}) => {
      let out = store.filter((r) => matchesWhere(r, args.where ?? {}));
      if (args.orderBy) {
        const orderBy = Array.isArray(args.orderBy) ? args.orderBy : [args.orderBy];
        out = [...out].sort((a, b) => compareRows(a, b, orderBy));
      }
      if (typeof args.skip === 'number') out = out.slice(args.skip);
      if (typeof args.take === 'number') out = out.slice(0, args.take);
      return out;
    }),
    count: vi.fn(
      async (args: Row = {}) => store.filter((r) => matchesWhere(r, args.where ?? {})).length,
    ),
  };
  return { prisma: { email } as any, store };
}

function row(
  id: string,
  receivedAt: Date | null,
  createdAt: Date,
  extra: Row = {},
): Row {
  return {
    id,
    userId: 'u1',
    folderId: 'f1',
    threadId: null,
    fromAddress: 'sender@example.com',
    fromName: 'Sender',
    toAddresses: ['u1@example.com'],
    ccAddresses: [],
    bccAddresses: [],
    subject: `Subject ${id}`,
    bodyPlain: 'body',
    bodyHtml: '',
    snippet: 'snippet',
    isRead: false,
    isStarred: false,
    isDraft: false,
    isSent: false,
    isSpam: false,
    isTrash: false,
    aiCategory: null,
    messageKind: 'MAIL',
    receivedAt,
    createdAt,
    updatedAt: createdAt,
    sentAt: null,
    deletedAt: null,
    ...extra,
  };
}

const T = (iso: string) => new Date(iso);

async function buildApp(rows: Row[]) {
  const app: FastifyInstance = Fastify({ logger: false });
  app.addHook('onRequest', async (request) => {
    const id = (request.headers['x-test-user'] as string) || '';
    if (id) (request as any).auth = { userId: id };
  });
  const { prisma, store } = makePrisma(rows);
  app.decorate('prisma', prisma);
  app.setErrorHandler((error: any, _req, reply) => {
    const status = error?.statusCode ?? 500;
    reply.status(status).send({
      success: false,
      error: { code: error?.code ?? 'INTERNAL_ERROR', message: error?.message ?? 'error' },
    });
  });
  await app.register(emailsRoutes, { prefix: '/emails' });
  await app.ready();
  return { app, store };
}

async function listIds(
  app: FastifyInstance,
  query: string,
): Promise<{ ids: string[]; body: any }> {
  const res = await app.inject({
    method: 'GET',
    url: `/emails/?${query}`,
    headers: { 'x-test-user': 'u1' },
  });
  expect(res.statusCode).toBe(200);
  const body = JSON.parse(res.body);
  return { ids: body.data.map((e: any) => e.id), body };
}

describe('GET /emails cursor pagination (QM-UIUX-040)', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) await app.close();
  });

  it('keeps offset pagination behaviour unchanged and reports totals', async () => {
    ({ app } = await buildApp([
      row('e1', T('2026-10-05T10:00:00Z'), T('2026-10-05T10:00:00Z')),
      row('e2', T('2026-10-04T10:00:00Z'), T('2026-10-04T10:00:00Z')),
      row('e3', T('2026-10-03T10:00:00Z'), T('2026-10-03T10:00:00Z')),
      row('e4', T('2026-10-02T10:00:00Z'), T('2026-10-02T10:00:00Z')),
      row('other-user', T('2026-10-06T10:00:00Z'), T('2026-10-06T10:00:00Z'), { userId: 'u2' }),
      row('other-folder', T('2026-10-06T10:00:00Z'), T('2026-10-06T10:00:00Z'), {
        folderId: 'f2',
      }),
    ]));

    const page1 = await listIds(app, 'folderId=f1&page=1&pageSize=2');
    expect(page1.ids).toEqual(['e1', 'e2']);
    expect(page1.body.totalCount).toBe(4);
    expect(page1.body.totalPages).toBe(2);
    expect(page1.body.nextCursor).toEqual(expect.any(String));

    const page2 = await listIds(app, 'folderId=f1&page=2&pageSize=2');
    expect(page2.ids).toEqual(['e3', 'e4']);
    expect(page2.body.nextCursor).toBeNull();
  });

  it('does not drift when a newer email arrives between pages (cursor)', async () => {
    const built = await buildApp([
      row('e1', T('2026-10-05T10:00:00Z'), T('2026-10-05T10:00:00Z')),
      row('e2', T('2026-10-04T10:00:00Z'), T('2026-10-04T10:00:00Z')),
      row('e3', T('2026-10-03T10:00:00Z'), T('2026-10-03T10:00:00Z')),
      row('e4', T('2026-10-02T10:00:00Z'), T('2026-10-02T10:00:00Z')),
      row('e5', T('2026-10-01T10:00:00Z'), T('2026-10-01T10:00:00Z')),
    ]);
    app = built.app;

    const page1 = await listIds(app, 'folderId=f1&pageSize=2');
    expect(page1.ids).toEqual(['e1', 'e2']);
    const cursor = page1.body.nextCursor as string;
    expect(cursor).toEqual(expect.any(String));

    // A newer email lands at the top of the mailbox between the two fetches.
    built.store.push(row('e0', T('2026-10-06T10:00:00Z'), T('2026-10-06T10:00:00Z')));

    const page2 = await listIds(
      app,
      `folderId=f1&pageSize=2&cursor=${encodeURIComponent(cursor)}`,
    );
    // Offset page 2 would now repeat e2 and drop e5; the cursor must not.
    expect(page2.ids).toEqual(['e3', 'e4']);
    // Totals still describe the mailbox, not the remaining window.
    expect(page2.body.totalCount).toBe(6);

    const page3 = await listIds(
      app,
      `folderId=f1&pageSize=2&cursor=${encodeURIComponent(page2.body.nextCursor)}`,
    );
    expect(page3.ids).toEqual(['e5']);
    expect(page3.body.nextCursor).toBeNull();
  });

  it('walks ties on receivedAt and createdAt exactly once, in order', async () => {
    ({ app } = await buildApp([
      // Same receivedAt: createdAt desc decides. Same receivedAt AND createdAt:
      // id desc decides.
      row('tie-b', T('2026-10-05T10:00:00Z'), T('2026-10-05T09:00:00Z')),
      row('tie-a', T('2026-10-05T10:00:00Z'), T('2026-10-05T09:00:00Z')),
      row('tie-c', T('2026-10-05T10:00:00Z'), T('2026-10-05T08:00:00Z')),
      row('last', T('2026-10-04T10:00:00Z'), T('2026-10-04T10:00:00Z')),
    ]));

    const seen: string[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 4; i++) {
      const q =
        cursor === null
          ? 'folderId=f1&pageSize=1'
          : `folderId=f1&pageSize=1&cursor=${encodeURIComponent(cursor)}`;
      const page = await listIds(app, q);
      seen.push(...page.ids);
      cursor = page.body.nextCursor;
    }
    expect(seen).toEqual(['tie-b', 'tie-a', 'tie-c', 'last']);
    expect(cursor).toBeNull();
  });

  it('pages undated rows (drafts) first, then dated rows, without loss', async () => {
    ({ app } = await buildApp([
      row('draft-new', null, T('2026-10-05T10:00:00Z'), { folderId: 'f2', isDraft: true }),
      row('draft-mid', null, T('2026-10-04T10:00:00Z'), { folderId: 'f2', isDraft: true }),
      row('draft-old', null, T('2026-10-03T10:00:00Z'), { folderId: 'f2', isDraft: true }),
      row('dated', T('2026-10-06T10:00:00Z'), T('2026-10-06T10:00:00Z'), { folderId: 'f2' }),
    ]));

    const page1 = await listIds(app, 'folderId=f2&pageSize=2');
    expect(page1.ids).toEqual(['draft-new', 'draft-mid']);

    const page2 = await listIds(
      app,
      `folderId=f2&pageSize=2&cursor=${encodeURIComponent(page1.body.nextCursor)}`,
    );
    expect(page2.ids).toEqual(['draft-old', 'dated']);
    expect(page2.body.nextCursor).toBeNull();
  });

  it('rejects a malformed cursor with 400 instead of silently restarting', async () => {
    ({ app } = await buildApp([
      row('e1', T('2026-10-05T10:00:00Z'), T('2026-10-05T10:00:00Z')),
    ]));
    const res = await app.inject({
      method: 'GET',
      url: '/emails/?folderId=f1&cursor=not-a-real-cursor',
      headers: { 'x-test-user': 'u1' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('still requires authentication', async () => {
    ({ app } = await buildApp([]));
    const res = await app.inject({ method: 'GET', url: '/emails/?folderId=f1' });
    expect(res.statusCode).toBe(401);
  });
});

describe('email list cursor codec', () => {
  it('round-trips a dated row', () => {
    const cursor = encodeEmailListCursor({
      receivedAt: T('2026-10-05T10:00:00Z'),
      createdAt: T('2026-10-05T09:00:00Z'),
      id: 'e1',
    });
    expect(decodeEmailListCursor(cursor)).toEqual({
      receivedAt: '2026-10-05T10:00:00.000Z',
      createdAt: '2026-10-05T09:00:00.000Z',
      id: 'e1',
    });
  });

  it('round-trips an undated row (receivedAt null)', () => {
    const cursor = encodeEmailListCursor({
      receivedAt: null,
      createdAt: T('2026-10-05T09:00:00Z'),
      id: 'd1',
    });
    expect(decodeEmailListCursor(cursor).receivedAt).toBeNull();
  });

  it('rejects payloads that are not cursors', () => {
    expect(() => decodeEmailListCursor('%%%')).toThrow();
    expect(() =>
      decodeEmailListCursor(Buffer.from('{"id":1}', 'utf8').toString('base64url')),
    ).toThrow();
    expect(() =>
      decodeEmailListCursor(
        Buffer.from('{"id":"x","createdAt":"not-a-date","receivedAt":null}', 'utf8').toString(
          'base64url',
        ),
      ),
    ).toThrow();
  });
});
