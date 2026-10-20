import { describe, it, expect, afterEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import emailsRoutes from '../routes/emails';
// The offline seed predicate the inbox page applies to cached rows before
// showing them (`useInbox`: seed + error fallback). The server's list
// response is the only thing that can make this predicate true for snoozed
// mail — if the wire rows don't carry `snoozedUntil`, the snoozed view seeds
// to [] while the warm query cache still shows the real count: two Snoozed
// truths, one lying (the same class as the ARCHIVE divergent-counts P1,
// fixed by including the folder relation for the `isArchived` bridge).
import { belongsInFolder } from '../../src/lib/offline/folders';

// P1 (2026-10-11): GET /emails?folderType=SNOOZED filtered server-side on the
// thread relation (`where.thread = { is: { snoozedUntil: { gt: now } } }`)
// but never *included* it, so `formatEmailRecord`'s snooze bridge had nothing
// to read and rows shipped with `snoozedUntil` undefined. The offline cache
// then stored rows the seed predicate (`belongsInFolder(row, 'SNOOZED')`,
// which reads `email.snoozedUntil`) rejects, and any cold/offline/slow load
// of the snoozed view showed an empty state for mail that exists.
//
// These tests pin the wire contract at the route level with an in-memory
// prisma double that evaluates exactly the query shapes the route emits,
// including the `thread: { is: { snoozedUntil: ... } }` relation filter and
// the `include: { thread: { select: { snoozedUntil: true } } }` the fix adds
// for the SNOOZED view only.

type Row = Record<string, any>;

const FOLDERS: Row[] = [{ id: 'folder-inbox', userId: 'u1', name: 'Inbox', type: 'INBOX' }];

// snoozedUntil lives ONLY on EmailThread — there is no such column on Email.
// Times are relative to the run so this contract never time-bombs: the
// "snoozed" thread always wakes in the future, the "expired" one always in
// the past (a hardcoded 2026-10-20T10:00Z wake time red-d the gate on every
// CI run after that instant, 3 consecutive orchestrator runs).
const SNOOZED_UNTIL = new Date(Date.now() + 2 * 60 * 60 * 1000);
const EXPIRED_UNTIL = new Date(Date.now() - 2 * 60 * 60 * 1000);
const THREADS: Row[] = [
  { id: 't-snoozed', userId: 'u1', snoozedUntil: SNOOZED_UNTIL },
  { id: 't-expired', userId: 'u1', snoozedUntil: EXPIRED_UNTIL },
  { id: 't-plain', userId: 'u1', snoozedUntil: null },
];

function folderOf(row: Row): Row | null {
  return FOLDERS.find((f) => f.id === row.folderId) ?? null;
}

function threadOf(row: Row): Row | null {
  return THREADS.find((t) => t.id === row.threadId) ?? null;
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
      // The only folder relation shape the list route emits here:
      //   { is: { type: { not: 'ARCHIVE' } } } (default INBOX arm)
      const folder = folderOf(row);
      const isCond = (cond as Row)?.is as Row | undefined;
      if (isCond?.type && typeof isCond.type === 'object' && 'not' in isCond.type) {
        if (folder && folder.type === (isCond.type as Row).not) return false;
      } else {
        throw new Error(`test double: unsupported folder condition ${JSON.stringify(cond)}`);
      }
      continue;
    }
    if (key === 'thread') {
      // The relation shapes the list route emits:
      //   SNOOZED:       { is: { snoozedUntil: { gt: <Date> } } }
      //   default INBOX: { is: { snoozedUntil: null } } / { is: { snoozedUntil: { lte: <Date> } } }
      const thread = threadOf(row);
      const isCond = (cond as Row)?.is as Row | undefined;
      if (!isCond) throw new Error(`test double: unsupported thread shape ${JSON.stringify(cond)}`);
      // Prisma `is` on a missing relation never matches.
      if (!thread) return false;
      const sCond = isCond.snoozedUntil as Row | null | undefined;
      if (sCond === null) {
        if (thread.snoozedUntil !== null && thread.snoozedUntil !== undefined) return false;
      } else if (sCond && typeof sCond === 'object') {
        const val = thread.snoozedUntil ? new Date(thread.snoozedUntil).getTime() : null;
        if ('gt' in sCond) {
          if (val === null || !(val > new Date(sCond.gt as string).getTime())) return false;
        } else if ('lte' in sCond) {
          if (val === null || !(val <= new Date(sCond.lte as string).getTime())) return false;
        } else {
          throw new Error(`test double: unsupported snoozedUntil operator ${JSON.stringify(sCond)}`);
        }
      } else {
        throw new Error(`test double: unsupported thread condition ${JSON.stringify(cond)}`);
      }
      continue;
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
      // The fix's include: attach the relations exactly as Prisma would with
      // `include: { folder: { select: { type: true } },
      //                   thread: { select: { snoozedUntil: true } } }`
      // (the thread arm only for the SNOOZED view).
      if (args.include?.folder) {
        out = out.map((r) => ({ ...r, folder: { type: folderOf(r)?.type ?? null } }));
      }
      if (args.include?.thread) {
        out = out.map((r) => {
          const thread = threadOf(r);
          return { ...r, thread: thread ? { snoozedUntil: thread.snoozedUntil } : null };
        });
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
  return { app, prisma };
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

describe('GET /emails snoozed wire truth (offline-seed contract)', () => {
  let app: FastifyInstance | null = null;
  let prisma: any = null;
  afterEach(async () => {
    if (app) await app.close();
    app = null;
    prisma = null;
  });

  const seed = () => [
    row('s1', '2026-10-11T10:00:00Z', { threadId: 't-snoozed' }),
    row('s2', '2026-10-10T10:00:00Z', { threadId: 't-snoozed' }),
    row('e1', '2026-10-09T10:00:00Z', { threadId: 't-expired' }),
    row('p1', '2026-10-08T10:00:00Z', { threadId: 't-plain' }),
    row('n1', '2026-10-07T10:00:00Z', { threadId: null }),
    row('st1', '2026-10-06T10:00:00Z', { threadId: 't-snoozed', isTrash: true, deletedAt: null }),
    row('sd1', '2026-10-05T10:00:00Z', { threadId: 't-snoozed', isDraft: true }),
  ];

  it('SNOOZED list returns exactly the rows whose thread wake time is in the future', async () => {
    ({ app, prisma } = await buildApp(seed()));
    const data = await list(app, 'folderType=SNOOZED');
    expect(data.map((e) => e.id)).toEqual(['s1', 's2']);
  });

  it('every SNOOZED row carries snoozedUntil and survives the client offline-seed predicate', async () => {
    // The core regression: before the fix the rows shipped with
    // `snoozedUntil` undefined, so `belongsInFolder(row, 'SNOOZED')` dropped
    // every one of them and a cold/offline load of the snoozed view seeded
    // to [] while the warm query cache showed the real count.
    ({ app, prisma } = await buildApp(seed()));
    const data = await list(app, 'folderType=SNOOZED');
    expect(data.length).toBeGreaterThan(0);
    for (const emailRow of data) {
      // The wire carries an ISO string (Fastify serialises the Date); the
      // predicate only needs it truthy, and it must be the thread's wake
      // time, not an invented value.
      expect(typeof emailRow.snoozedUntil).toBe('string');
      expect(new Date(emailRow.snoozedUntil).getTime()).toBe(
        SNOOZED_UNTIL.getTime(),
      );
      expect(belongsInFolder(emailRow as any, 'SNOOZED')).toBe(true);
    }
  });

  it('the thread include is emitted for SNOOZED and for no other view', async () => {
    // Pins the other half of the contract: the relation must be present on
    // the SNOOZED query (that is what feeds the bridge), and the include
    // stays off everywhere else so no other view pays the join or risks a
    // stale bridge.
    ({ app, prisma } = await buildApp(seed()));
    await list(app, 'folderType=SNOOZED');
    const snoozedCalls = prisma.email.findMany.mock.calls;
    expect(snoozedCalls.length).toBeGreaterThan(0);
    for (const [args] of snoozedCalls) {
      expect(args.include?.thread).toEqual({ select: { snoozedUntil: true } });
    }
    prisma.email.findMany.mockClear();

    await list(app, 'folderType=INBOX');
    const inboxCalls = prisma.email.findMany.mock.calls;
    expect(inboxCalls.length).toBeGreaterThan(0);
    for (const [args] of inboxCalls) {
      expect(args.include?.thread).toBeUndefined();
    }
  });

  it('INBOX rows never claim to be snoozed, and snoozed rows stay out of INBOX', async () => {
    // The other half of one truth: the INBOX server filter excludes snoozed
    // threads, so the offline seed (`!email.snoozedUntil`) must keep every
    // returned row — and the snoozed rows must not leak back in.
    ({ app, prisma } = await buildApp(seed()));
    const data = await list(app, 'folderType=INBOX');
    expect(data.map((e) => e.id).sort()).toEqual(['e1', 'n1', 'p1']);
    for (const emailRow of data) {
      expect(emailRow.snoozedUntil ?? null).toBeNull();
      expect(belongsInFolder(emailRow as any, 'INBOX')).toBe(true);
    }
  });
});
