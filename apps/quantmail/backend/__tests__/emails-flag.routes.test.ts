import { describe, it, expect, afterEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import emailsRoutes, { parseFlagTarget } from '../routes/emails';

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
    isFlagged: false,
    isDraft: false,
    isSent: false,
    isSpam: false,
    isTrash: false,
    version: 1,
    deletedAt: null,
    receivedAt: new Date('2026-10-10T10:00:00Z'),
    createdAt: new Date('2026-10-10T10:00:00Z'),
    updatedAt: new Date('2026-10-10T10:00:00Z'),
    ...extra,
  };
}

async function buildApp(rowSupplier: (id: string) => Row | null, updateResult?: { count: number }) {
  const app: FastifyInstance = Fastify({ logger: false });
  app.addHook('onRequest', async (request) => {
    const id = (request.headers['x-test-user'] as string) || '';
    if (id) (request as any).auth = { userId: id };
  });

  const prisma = {
    email: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => rowSupplier(where.id)),
      updateMany: vi.fn(async ({ where, data }: { where: any; data: any }) => {
        const row = rowSupplier(where.id);
        if (row && data.isFlagged !== undefined) {
          row.isFlagged = data.isFlagged;
        }
        return updateResult ?? { count: 1 };
      }),
    },
  } as any;

  app.decorate('prisma', prisma);
  app.setErrorHandler((error: any, _req, reply) => {
    const status = error?.statusCode ?? 500;
    reply.status(status).send({
      success: false,
      error: {
        code: error?.code ?? 'INTERNAL_ERROR',
        message: error?.message ?? 'error',
        details: error?.details,
      },
    });
  });

  await app.register(emailsRoutes, { prefix: '/emails' });
  await app.ready();
  return { app, prisma };
}

describe('parseFlagTarget unit tests', () => {
  it('returns undefined when body is undefined or missing isFlagged', () => {
    expect(parseFlagTarget(undefined)).toBeUndefined();
    expect(parseFlagTarget({})).toBeUndefined();
    expect(parseFlagTarget({ other: true })).toBeUndefined();
  });

  it('returns boolean when isFlagged is boolean', () => {
    expect(parseFlagTarget({ isFlagged: true })).toBe(true);
    expect(parseFlagTarget({ isFlagged: false })).toBe(false);
  });

  it('throws 400 INVALID_FLAG_VALUE when isFlagged is not a boolean', () => {
    expect(() => parseFlagTarget({ isFlagged: null })).toThrowError(/isFlagged must be a boolean/);
    expect(() => parseFlagTarget({ isFlagged: 'true' })).toThrowError(/isFlagged must be a boolean/);
    expect(() => parseFlagTarget({ isFlagged: 1 })).toThrowError(/isFlagged must be a boolean/);
  });
});

describe('POST /emails/:id/flag route (AC-7)', () => {
  let app: FastifyInstance | null = null;
  afterEach(async () => {
    if (app) await app.close();
    app = null;
  });

  it('401s when not authenticated with zero database calls', async () => {
    const { app: testApp, prisma } = await buildApp(() => emailRow('e1'));
    app = testApp;

    const res = await app.inject({
      method: 'POST',
      url: '/emails/e1/flag',
    });

    expect(res.statusCode).toBe(401);
    expect(prisma.email.findUnique).not.toHaveBeenCalled();
    expect(prisma.email.updateMany).not.toHaveBeenCalled();
  });

  it('toggles flag state for owner when no body is passed', async () => {
    let current = emailRow('e1', { isFlagged: false, version: 1 });
    const { app: testApp, prisma } = await buildApp(() => current);
    app = testApp;

    const res = await app.inject({
      method: 'POST',
      url: '/emails/e1/flag',
      headers: { 'x-test-user': 'u1' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.isFlagged).toBe(true);
    expect(prisma.email.updateMany).toHaveBeenCalledWith({
      where: { id: 'e1' },
      data: {
        isFlagged: true,
        updatedAt: expect.any(Date),
        version: { increment: 1 },
      },
    });
  });

  it('sets explicit isFlagged target when provided in body', async () => {
    let current = emailRow('e1', { isFlagged: true, version: 1 });
    const { app: testApp, prisma } = await buildApp(() => current);
    app = testApp;

    const res = await app.inject({
      method: 'POST',
      url: '/emails/e1/flag',
      headers: { 'x-test-user': 'u1' },
      payload: { isFlagged: false },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.isFlagged).toBe(false);
    expect(prisma.email.updateMany).toHaveBeenCalledWith({
      where: { id: 'e1' },
      data: {
        isFlagged: false,
        updatedAt: expect.any(Date),
        version: { increment: 1 },
      },
    });
  });

  it('returns 403 when email belongs to another user', async () => {
    const { app: testApp } = await buildApp(() => emailRow('e1', { userId: 'u2' }));
    app = testApp;

    const res = await app.inject({
      method: 'POST',
      url: '/emails/e1/flag',
      headers: { 'x-test-user': 'u1' },
    });

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('returns 404 when email does not exist', async () => {
    const { app: testApp } = await buildApp(() => null);
    app = testApp;

    const res = await app.inject({
      method: 'POST',
      url: '/emails/nonexistent/flag',
      headers: { 'x-test-user': 'u1' },
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('EMAIL_NOT_FOUND');
  });

  it('returns 400 INVALID_FLAG_VALUE for null, string, number isFlagged without DB writes', async () => {
    const { app: testApp, prisma } = await buildApp(() => emailRow('e1'));
    app = testApp;

    for (const invalid of [null, 'true', 1]) {
      const res = await app.inject({
        method: 'POST',
        url: '/emails/e1/flag',
        headers: { 'x-test-user': 'u1' },
        payload: { isFlagged: invalid },
      });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error.code).toBe('INVALID_FLAG_VALUE');
      expect(prisma.email.updateMany).not.toHaveBeenCalled();
    }
  });

  it('returns 400 INVALID_EXPECTED_VERSION for invalid versions without DB writes', async () => {
    const { app: testApp, prisma } = await buildApp(() => emailRow('e1'));
    app = testApp;

    for (const invalid of [-1, 1.5, '2']) {
      const res = await app.inject({
        method: 'POST',
        url: '/emails/e1/flag',
        headers: { 'x-test-user': 'u1' },
        payload: { expectedVersion: invalid },
      });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error.code).toBe('INVALID_EXPECTED_VERSION');
      expect(prisma.email.updateMany).not.toHaveBeenCalled();
    }
  });

  it('returns 409 VERSION_CONFLICT with details when expectedVersion does not match', async () => {
    const current = emailRow('e1', { isFlagged: false, version: 5 });
    const { app: testApp } = await buildApp(() => current, { count: 0 });
    app = testApp;

    const res = await app.inject({
      method: 'POST',
      url: '/emails/e1/flag',
      headers: { 'x-test-user': 'u1' },
      payload: { expectedVersion: 3 },
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('VERSION_CONFLICT');
    expect(body.error.details).toMatchObject({
      resource: 'Email',
      id: 'e1',
      expectedVersion: 3,
      currentVersion: 5,
    });
  });
});
