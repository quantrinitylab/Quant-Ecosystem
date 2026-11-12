import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import emailsRoutes from '../routes/emails';
import threadsRoutes from '../routes/threads';
import emailsChangesRoutes from '../routes/emails-changes';
import { formatEmailRecord } from '../lib/format-email';

type Row = Record<string, any>;

function emailRow(id: string, extra: Row = {}): Row {
  return {
    id,
    userId: 'u1',
    threadId: 't1',
    subject: `Subject ${id}`,
    fromAddress: 'sender@example.com',
    toAddresses: ['u1@quantmail.in'],
    ccAddresses: [],
    bccAddresses: [],
    bodyPlain: 'body',
    snippet: 'snippet',
    isRead: false,
    isStarred: false,
    isPinned: false,
    isFlagged: true,
    isDraft: false,
    isSent: false,
    isSpam: false,
    isTrash: false,
    hasAttachments: false,
    attachments: [],
    labels: [],
    version: 1,
    deletedAt: null,
    receivedAt: new Date('2026-10-10T10:00:00Z'),
    createdAt: new Date('2026-10-10T10:00:00Z'),
    updatedAt: new Date('2026-10-10T10:00:00Z'),
    ...extra,
  };
}

describe('emails-flag-fields (AC-8)', () => {
  let app: FastifyInstance | null = null;
  const savedSecret = process.env.SYNC_CURSOR_SECRET;

  beforeEach(() => {
    process.env.SYNC_CURSOR_SECRET = 'test-secret-0123456789-abcdefghij!!';
  });

  afterEach(async () => {
    if (app) await app.close();
    app = null;
    process.env.SYNC_CURSOR_SECRET = savedSecret;
  });

  it('formatEmailRecord preserves isFlagged', () => {
    const raw = emailRow('e1', { isFlagged: true });
    const formatted = formatEmailRecord(raw);
    expect(formatted.isFlagged).toBe(true);

    const rawFalse = emailRow('e2', { isFlagged: false });
    expect(formatEmailRecord(rawFalse).isFlagged).toBe(false);
  });

  it('GET /emails returns isFlagged: true on flagged rows', async () => {
    app = Fastify({ logger: false });
    app.addHook('onRequest', async (req) => {
      (req as any).auth = { userId: 'u1' };
    });

    const flaggedRow = emailRow('e1', { isFlagged: true });
    const prisma = {
      email: {
        findMany: vi.fn(async () => [flaggedRow]),
        count: vi.fn(async () => 1),
      },
    } as any;
    app.decorate('prisma', prisma);
    await app.register(emailsRoutes, { prefix: '/emails' });
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/emails',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].isFlagged).toBe(true);
  });

  it('GET /threads/:id returns isFlagged: true on thread messages', async () => {
    app = Fastify({ logger: false });
    app.addHook('onRequest', async (req) => {
      (req as any).auth = { userId: 'u1' };
    });

    const flaggedRow = emailRow('e1', { threadId: 't1', isFlagged: true });
    const prisma = {
      emailThread: {
        findUnique: vi.fn(async () => ({
          id: 't1',
          userId: 'u1',
          subject: 'Thread subject',
          snippet: 'snippet',
          lastMessageAt: new Date(),
          unreadCount: 0,
          totalCount: 1,
          isStarred: false,
          isPinned: false,
          folder: { id: 'f1', name: 'INBOX', type: 'INBOX' },
        })),
      },
      email: {
        findMany: vi.fn(async () => [flaggedRow]),
      },
    } as any;
    app.decorate('prisma', prisma);
    await app.register(threadsRoutes, { prefix: '/threads' });
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/threads/t1',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.messages).toHaveLength(1);
    expect(body.data.messages[0].isFlagged).toBe(true);
  });

  it('GET /emails/changes returns isFlagged on delta-sync items', async () => {
    app = Fastify({ logger: false });
    app.addHook('onRequest', async (req) => {
      (req as any).auth = { userId: 'u1' };
    });

    const flaggedRow = emailRow('e1', { isFlagged: true });
    const prisma = {
      email: {
        findMany: vi.fn(async () => [flaggedRow]),
      },
    } as any;
    app.decorate('prisma', prisma);
    await app.register(emailsChangesRoutes, { prefix: '/emails' });
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/emails/changes',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.changes).toHaveLength(1);
    expect(body.data.changes[0].message.isFlagged).toBe(true);
  });
});
