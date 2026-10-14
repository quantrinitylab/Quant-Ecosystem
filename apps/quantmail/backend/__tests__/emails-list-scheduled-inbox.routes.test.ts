import { describe, it, expect, afterEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import emailsRoutes from '../routes/emails';
import { belongsInFolder } from '../../src/lib/offline/folders';

// Live (staging, 2026-10-14): a message scheduled for tomorrow 8 AM showed at
// the TOP of the inbox and of People ("You:", "now") the moment it was
// scheduled. The default inbox admits every `isSent` row (your replies live in
// the conversation), and the send service stamps the future fire time into
// sentAt/receivedAt — so an unsent scheduled message outranked all real mail.
// It belongs to the Scheduled mailbox until it fires.

type Row = Record<string, any>;

function cmp(value: any, op: string, operand: any): boolean {
  const v = value instanceof Date ? value.getTime() : value;
  const o = operand instanceof Date ? operand.getTime() : operand;
  switch (op) {
    case 'not':
      // Prisma `{ not: x }` on a non-null column.
      return v !== o;
    case 'lte':
      return v != null && v <= o;
    case 'gt':
      return v != null && v > o;
    default:
      throw new Error(`test double: unsupported operator ${op}`);
  }
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
      // Only unfiled rows in this suite: `folder.is.type` arms never match,
      // `type: { not: 'ARCHIVE' }` holds trivially for a null relation.
      const isCond = (cond as Row)?.is as Row | undefined;
      if (isCond?.type && typeof isCond.type === 'object' && 'not' in isCond.type) continue;
      return false;
    }
    if (key === 'thread') throw new Error('test double: thread relation not supported');
    if (cond === null) {
      if (row[key] !== null && row[key] !== undefined) return false;
      continue;
    }
    if (cond instanceof Date) {
      if (!(row[key] instanceof Date) || row[key].getTime() !== cond.getTime()) return false;
      continue;
    }
    if (typeof cond === 'object') {
      for (const [op, operand] of Object.entries(cond as Row)) {
        if (!cmp(row[key], op, operand)) return false;
      }
      continue;
    }
    if (row[key] !== cond) return false;
  }
  return true;
}

function makePrisma(rows: Row[]) {
  const email = {
    findMany: vi.fn(async (args: Row = {}) => {
      const out = rows.filter((r) => matchesWhere(r, args.where ?? {}));
      return [...out].sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime());
    }),
    count: vi.fn(async (args: Row = {}) => rows.filter((r) => matchesWhere(r, args.where ?? {})).length),
  };
  return { email } as any;
}

const HOUR = 3_600_000;

function row(id: string, receivedAt: Date, extra: Row = {}): Row {
  return {
    id,
    userId: 'u1',
    threadId: null,
    fromAddress: 'u1@quantmail.in',
    fromName: 'Me',
    toAddresses: ['peer@quantmail.in'],
    ccAddresses: [],
    bccAddresses: [],
    subject: `Subject ${id}`,
    bodyPlain: 'body',
    bodyHtml: '',
    snippet: 'snippet',
    isRead: true,
    isStarred: false,
    isDraft: false,
    isSent: false,
    isSpam: false,
    isTrash: false,
    aiCategory: null,
    messageKind: 'MAIL',
    deliveryStatus: 'draft',
    receivedAt,
    createdAt: receivedAt,
    updatedAt: receivedAt,
    sentAt: null,
    deletedAt: null,
    folderId: null,
    ...extra,
  };
}

async function buildApp(rows: Row[]) {
  const app: FastifyInstance = Fastify({ logger: false });
  app.addHook('onRequest', async (request) => {
    (request as any).auth = { userId: 'u1' };
  });
  app.decorate('prisma', makePrisma(rows));
  await app.register(emailsRoutes, { prefix: '/emails' });
  await app.ready();
  return app;
}

async function list(app: FastifyInstance, query: string): Promise<any[]> {
  const res = await app.inject({ method: 'GET', url: `/emails/?${query}` });
  expect(res.statusCode).toBe(200);
  return JSON.parse(res.body).data as any[];
}

describe('GET /emails — a scheduled send stays out of the inbox until it fires', () => {
  let app: FastifyInstance | null = null;
  afterEach(async () => {
    if (app) await app.close();
    app = null;
  });

  const now = Date.now();
  const tomorrow = new Date(now + 13 * HOUR);
  const seed = () => [
    // Scheduled for tomorrow: sentAt/receivedAt carry the future fire time.
    row('scheduled', tomorrow, { isSent: true, deliveryStatus: 'queued', sentAt: tomorrow }),
    // Sent a minute ago inside the undo window: queued, but sentAt is "now".
    row('undo-window', new Date(now - 60_000), {
      isSent: true,
      deliveryStatus: 'queued',
      sentAt: new Date(now - 60_000),
    }),
    // An ordinary delivered reply.
    row('sent', new Date(now - 2 * HOUR), {
      isSent: true,
      deliveryStatus: 'delivered',
      sentAt: new Date(now - 2 * HOUR),
    }),
    // A sent row with no recorded send time (legacy) — must not vanish.
    row('sent-legacy', new Date(now - 3 * HOUR), { isSent: true, deliveryStatus: 'sent', sentAt: null }),
    // Received mail.
    row('received', new Date(now - HOUR), { fromAddress: 'peer@quantmail.in', isRead: false }),
  ];

  it('INBOX omits the pending scheduled send and keeps everything else', async () => {
    app = await buildApp(seed());
    const data = await list(app, 'folderType=INBOX');
    expect(data.map((e) => e.id)).toEqual(['undo-window', 'received', 'sent', 'sent-legacy']);
  });

  it('the scheduled send is still listed in SCHEDULED', async () => {
    app = await buildApp(seed());
    const data = await list(app, 'folderType=SCHEDULED');
    expect(data.map((e) => e.id)).toEqual(['scheduled']);
    expect(belongsInFolder(data[0], 'SCHEDULED')).toBe(true);
  });

  it('the client inbox predicate agrees with the server', async () => {
    app = await buildApp(seed());
    const scheduled = (await list(app, 'folderType=SCHEDULED'))[0];
    expect(belongsInFolder(scheduled, 'INBOX')).toBe(false);
    for (const inboxRow of await list(app, 'folderType=INBOX')) {
      expect(belongsInFolder(inboxRow, 'INBOX')).toBe(true);
    }
  });

  it('once the fire time has passed the message joins the inbox', async () => {
    const past = new Date(now - 5 * 60_000);
    app = await buildApp([
      row('fired-late', past, { isSent: true, deliveryStatus: 'queued', sentAt: past }),
    ]);
    const data = await list(app, 'folderType=INBOX');
    expect(data.map((e) => e.id)).toEqual(['fired-late']);
  });
});
