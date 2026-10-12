import { describe, it, expect, afterEach } from 'vitest';
import fastify from 'fastify';
import { errorHandlerPlugin } from '@quant/server-core';
import searchRoutes from '../routes/search';

/**
 * GET /search/emails — the operator-aware mail search route.
 *
 * The web mail search (apiClient.searchEmails) fans out here for Gmail-style
 * operator queries (`from:kundan`, `"exact phrase"`, `has:attachment`, ...).
 * These tests lock the contract the frontend relies on:
 *
 * 1. The response is the same flat envelope as GET /emails/search
 *    (`data` is the item array; pagination fields at the top level).
 * 2. Rows are run through formatEmailRecord (from: {email,name}, ...), not
 *    raw DB rows.
 * 3. Operator text is parsed into the where clause (not matched literally).
 *
 * All state is a deterministic in-memory Prisma stub — no database, no network.
 */

const BASE_ROW = {
  id: 'm1',
  userId: 'user-1',
  folderId: 'f-inbox',
  threadId: 't1',
  fromAddress: 'kundan@x.com',
  fromName: 'Kundan',
  toAddresses: ['me@quantmail.in'],
  ccAddresses: [],
  bccAddresses: [],
  subject: 'Invoice for March',
  bodyPlain: 'Please find the invoice attached.',
  snippet: 'Please find the invoice...',
  isRead: false,
  isStarred: false,
  isArchived: false,
  isDraft: false,
  isTrash: false,
  isSpam: false,
  hasAttachments: true,
  attachments: [
    {
      id: 'att_1',
      filename: 'bill.pdf',
      mimeType: 'application/pdf',
      size: 123,
      url: 'https://files.test/bill.pdf',
    },
  ],
  labels: ['lbl-work'],
  createdAt: new Date('2026-10-01T10:00:00Z'),
  receivedAt: new Date('2026-10-01T10:00:00Z'),
  sentAt: null,
};

function makePrisma(opts?: { rawSql?: boolean }) {
  const findManyCalls: any[] = [];
  const countCalls: any[] = [];
  const rawCalls: string[] = [];
  const stub: any = {
    _calls: { findManyCalls, countCalls, rawCalls },
    email: {
      findMany: async (args: any) => {
        findManyCalls.push(args);
        return [{ ...BASE_ROW }];
      },
      count: async (args: any) => {
        countCalls.push(args);
        return 1;
      },
    },
  };
  if (opts?.rawSql) {
    // The service's G3-10 branch fires when free-text terms are present
    // (e.g. a "quoted phrase") and $queryRawUnsafe exists.
    stub.$queryRawUnsafe = async (sql: string, ..._params: unknown[]) => {
      rawCalls.push(String(sql));
      if (String(sql).includes('COUNT(*)')) return [{ total: 1 }];
      return [{ ...BASE_ROW }];
    };
  }
  return stub;
}

async function buildTestApp(opts?: { userId?: string; rawSql?: boolean }) {
  const app = fastify();
  await app.register(errorHandlerPlugin);
  const prisma = makePrisma({ rawSql: opts?.rawSql });
  app.decorate('prisma', prisma as unknown as never);
  app.addHook('preHandler', async (req) => {
    if (opts?.userId) {
      (req as unknown as { auth?: unknown }).auth = { userId: opts.userId };
    }
  });
  await app.register(searchRoutes, { prefix: '/search' });
  await app.ready();
  return { app, prisma };
}

describe('GET /search/emails', () => {
  let apps: { close: () => Promise<void> }[] = [];
  afterEach(async () => {
    await Promise.all(apps.map((a) => a.close()));
    apps = [];
  });

  it('returns the flat /emails/search-style envelope with formatted rows', async () => {
    const { app, prisma } = await buildTestApp({ userId: 'user-1' });
    apps.push(app);

    const res = await app.inject({
      method: 'GET',
      url: `/search/emails?q=${encodeURIComponent('from:kundan')}`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    // Flat envelope: `data` is the item array, pagination at the top level.
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(25);
    expect(body.totalPages).toBe(1);
    expect(body.totalCount).toBe(1);
    expect(body.hasNext).toBe(false);
    expect(body.hasPrev).toBe(false);

    // Formatted rows, not raw DB rows.
    const item = body.data[0];
    expect(item.from).toEqual({ email: 'kundan@x.com', name: 'Kundan' });
    expect(item.to).toEqual([{ email: 'me@quantmail.in', name: 'me' }]);
    expect(item.attachments[0].filename).toBe('bill.pdf');
    expect(item.hasAttachments).toBe(true);

    // The operator was parsed into the where clause — not matched literally.
    const where = prisma._calls.findManyCalls[0].where;
    expect(where.userId).toBe('user-1');
    expect(JSON.stringify(where.AND)).toContain('kundan');
    expect(JSON.stringify(where)).not.toContain('from:kundan');
  });

  it('formats rows from the raw-SQL branch and selects attachments/labels', async () => {
    const { app, prisma } = await buildTestApp({ userId: 'user-1', rawSql: true });
    apps.push(app);

    const res = await app.inject({
      method: 'GET',
      url: `/search/emails?q=${encodeURIComponent('"exact phrase"')}`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    const item = body.data[0];
    expect(item.from).toEqual({ email: 'kundan@x.com', name: 'Kundan' });
    // attachments/labels rode along in the SELECT, so the formatter keeps
    // the clip icon and label state honest on operator+term queries.
    expect(item.attachments[0].filename).toBe('bill.pdf');
    expect(item.hasAttachments).toBe(true);
    expect(item.labels).toContain('lbl-work');

    const dataSql = prisma._calls.rawCalls.find((s: string) => !s.includes('COUNT(*)'));
    expect(dataSql).toContain('"attachments"');
    expect(dataSql).toContain('"labels"');
  });

  it('rejects unauthenticated requests with 401', async () => {
    const { app } = await buildTestApp();
    apps.push(app);

    const res = await app.inject({
      method: 'GET',
      url: `/search/emails?q=${encodeURIComponent('from:kundan')}`,
    });

    expect(res.statusCode).toBe(401);
  });

  it('rejects an empty query with 400', async () => {
    const { app } = await buildTestApp({ userId: 'user-1' });
    apps.push(app);

    const res = await app.inject({ method: 'GET', url: '/search/emails?q=' });

    expect(res.statusCode).toBe(400);
  });
});
