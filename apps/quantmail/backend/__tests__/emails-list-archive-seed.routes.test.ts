import { describe, it, expect, afterEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import emailsRoutes from '../routes/emails';
// The offline seed predicate the inbox page applies to cached rows before
// showing them (`useInbox`: seed + error fallback). The server's list
// response is the only thing that can make this predicate true for archived
// mail — if the wire rows don't carry `isArchived: true`, the archived view
// seeds to [] ("Nothing archived yet.") while the warm query cache still
// shows the real count: two Archive truths, one lying.
import { belongsInFolder } from '../../src/lib/offline/folders';

// P1 (2026-10-11 mobile-style audit): inbox "Archived" shelf showed 8
// conversations while the Archive view (?archived=1) showed
// "Nothing archived yet / 0 total". Root cause: GET /emails?folderType=ARCHIVE
// filtered server-side on the folder relation but never *included* it, so
// formatEmailRecord's isArchived bridge emitted `false` on every archived row.
// The offline cache then stored rows the seed predicate rejects, and any
// cold/offline/slow load of the archive view showed an empty state for mail
// that exists.
//
// These tests pin the wire contract at the route level with an in-memory
// prisma double that evaluates exactly the query shapes the route emits,
// including the `folder: { is: { type } }` relation filter and the
// `include: { folder: { select: { type: true } } }` the fix adds.

type Row = Record<string, any>;

const FOLDERS: Row[] = [
  { id: 'folder-archive', userId: 'u1', name: 'Archive', type: 'ARCHIVE' },
  { id: 'folder-inbox', userId: 'u1', name: 'Inbox', type: 'INBOX' },
];

function folderOf(row: Row): Row | null {
  return FOLDERS.find((f) => f.id === row.folderId) ?? null;
}

function matchesWhere(row: Row, where: Row): boolean {
  for (const [key, cond] of Object.entries(where ?? {})) {
    if (key === 'AND') {
      if (!(cond as Row[]).every((c) => matchesWhere(row, c))) return false;
      continue;
    }
    if (key === 'OR') {
      if (!(cond as Row[]).some((c) => matchesWhere(row, c))) return false;
      continue;
    }
    if (key === 'folder') {
      // The only relation shape the list route emits:
      //   { is: { type: 'ARCHIVE' } } / { is: { type: { not: 'ARCHIVE' } } }
      const folder = folderOf(row);
      const isCond = (cond as Row)?.is as Row | undefined;
      if (isCond?.type && typeof isCond.type === 'string') {
        if (!folder || folder.type !== isCond.type) return false;
      } else if (isCond?.type && typeof isCond.type === 'object' && 'not' in isCond.type) {
        if (folder && folder.type === (isCond.type as Row).not) return false;
      } else {
        throw new Error(`test double: unsupported folder condition ${JSON.stringify(cond)}`);
      }
      continue;
    }
    if (key === 'thread') {
      // SNOOZED branch only; not exercised here.
      throw new Error('test double: thread relation not supported in this suite');
    }
    if (cond === null) {
      if (row[key] !== null && row[key] !== undefined) return false;
      continue;
    }
    if (typeof cond === 'object') {
      throw new Error(`test double: unsupported operator ${JSON.stringify(cond)}`);
    }
    if (row[key] !== cond) return false;
  }
  return true;
}

function makePrisma(rows: Row[]) {
  const store = [...rows];
  const email = {
    findMany: vi.fn(async (args: Row = {}) => {
      let out = store.filter((r) => matchesWhere(r, args.where ?? {}));
      // The fix's include: attach the folder relation exactly as Prisma would
      // with `include: { folder: { select: { type: true } } }`.
      if (args.include?.folder) {
        out = out.map((r) => ({ ...r, folder: { type: folderOf(r)?.type ?? null } }));
      }
      const orderBy = args.orderBy ? (Array.isArray(args.orderBy) ? args.orderBy : [args.orderBy]) : [];
      out = [...out].sort((a, b) => {
        for (const term of orderBy) {
          const [field, dir] = Object.entries(term)[0] as [string, string];
          const av = a[field] instanceof Date ? a[field].getTime() : a[field];
          const bv = b[field] instanceof Date ? b[field].getTime() : b[field];
          if (av === bv) continue;
          if (av == null) return dir === 'desc' ? -1 : 1;
          if (bv == null) return dir === 'desc' ? 1 : -1;
          return (av < bv ? -1 : 1) * (dir === 'desc' ? -1 : 1);
        }
        return 0;
      });
      if (typeof args.skip === 'number') out = out.slice(args.skip);
      if (typeof args.take === 'number') out = out.slice(0, args.take);
      return out;
    }),
    count: vi.fn(async (args: Row = {}) => store.filter((r) => matchesWhere(r, args.where ?? {})).length),
  };
  return { prisma: { email } as any, store };
}

function row(id: string, receivedAt: string, extra: Row = {}): Row {
  return {
    id,
    userId: 'u1',
    threadId: null,
    fromAddress: 'sender@example.com',
    fromName: 'Sender',
    toAddresses: ['u1@quantmail.in'],
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
    receivedAt: new Date(receivedAt),
    createdAt: new Date(receivedAt),
    updatedAt: new Date(receivedAt),
    sentAt: null,
    deletedAt: null,
    folderId: null,
    ...extra,
  };
}

async function buildApp(rows: Row[]) {
  const app: FastifyInstance = Fastify({ logger: false });
  app.addHook('onRequest', async (request) => {
    const id = (request.headers['x-test-user'] as string) || '';
    if (id) (request as any).auth = { userId: id };
  });
  const { prisma } = makePrisma(rows);
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
  return app;
}

async function list(app: FastifyInstance, query: string): Promise<any[]> {
  const res = await app.inject({
    method: 'GET',
    url: `/emails/?${query}`,
    headers: { 'x-test-user': 'u1' },
  });
  expect(res.statusCode).toBe(200);
  return JSON.parse(res.body).data as any[];
}

describe('GET /emails archive wire truth (offline-seed contract)', () => {
  let app: FastifyInstance | null = null;
  afterEach(async () => {
    if (app) await app.close();
    app = null;
  });

  const seed = () => [
    row('a1', '2026-10-10T10:00:00Z', { folderId: 'folder-archive' }),
    row('a2', '2026-10-09T10:00:00Z', { folderId: 'folder-archive' }),
    row('i1', '2026-10-11T10:00:00Z', { folderId: 'folder-inbox' }),
    row('i2', '2026-10-08T10:00:00Z', { folderId: null }),
  ];

  it('ARCHIVE list returns exactly the archived rows', async () => {
    app = await buildApp(seed());
    const data = await list(app, 'folderType=ARCHIVE');
    expect(data.map((e) => e.id)).toEqual(['a1', 'a2']);
  });

  it('every ARCHIVE row survives the client offline-seed predicate', async () => {
    // The shelf ("8 archived conversations") and the archive view read the
    // same query, but the view can also boot from the offline cache, which
    // filters with belongsInFolder(row, 'ARCHIVE'). Before the fix the rows
    // arrived with isArchived:false and the seed dropped all of them.
    app = await buildApp(seed());
    const data = await list(app, 'folderType=ARCHIVE');
    expect(data.length).toBeGreaterThan(0);
    for (const emailRow of data) {
      expect(emailRow.isArchived).toBe(true);
      expect(belongsInFolder(emailRow as any, 'ARCHIVE')).toBe(true);
    }
  });

  it('INBOX rows never claim to be archived', async () => {
    // The other half of one truth: the INBOX list must not mark rows
    // archived, or the inbox offline seed (predicate: !isArchived) would
    // hide real mail.
    app = await buildApp(seed());
    const data = await list(app, 'folderType=INBOX');
    expect(data.map((e) => e.id).sort()).toEqual(['i1', 'i2']);
    for (const emailRow of data) {
      expect(emailRow.isArchived).not.toBe(true);
      expect(belongsInFolder(emailRow as any, 'INBOX')).toBe(true);
    }
  });
});
