import { describe, it, expect, afterEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import emailsRoutes from '../routes/emails';

// SNOOZED predicate parity (2026-10-19): the server's
// `GET /emails?folderType=SNOOZED` filters
// `isTrash = false, isDraft = false, isSpam = false` plus a future
// `thread.is.snoozedUntil`. Snoozing a draft or spam row used to write a wake
// time the server would never surface — a silent no-op the client then
// mirrored as a phantom cached SNOOZED row (the client predicate admitted any
// non-trashed row with `snoozedUntil`; fixed in
// src/lib/offline/folders.ts). The endpoint now refuses drafts and spam
// honestly (409), the same way it already refused trash.
//
// These tests pin the endpoint half of that contract at the route level with
// a prisma double. The guards fire before any thread lookup or
// versioned-update work, so the 409 cases need only `email.findUnique`.

type Row = Record<string, any>;

function emailRow(id: string, extra: Row = {}): Row {
  return {
    id,
    userId: 'u1',
    threadId: 't1',
    subject: `Subject ${id}`,
    fromAddress: 'sender@example.com',
    toAddresses: ['u1@quantmail.in'],
    isRead: false,
    isStarred: false,
    isDraft: false,
    isSent: false,
    isSpam: false,
    isTrash: false,
    deletedAt: null,
    receivedAt: new Date('2026-10-10T10:00:00Z'),
    createdAt: new Date('2026-10-10T10:00:00Z'),
    ...extra,
  };
}

const THREAD = { id: 't1', userId: 'u1', snoozedUntil: null, version: 3 };

async function buildApp(row: Row) {
  const app: FastifyInstance = Fastify({ logger: false });
  app.addHook('onRequest', async (request) => {
    const id = (request.headers['x-test-user'] as string) || '';
    if (id) (request as any).auth = { userId: id };
  });
  const prisma = {
    email: { findUnique: vi.fn(async () => row) },
    emailThread: {
      findUnique: vi.fn(async () => ({ ...THREAD })),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
  } as any;
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

async function snooze(app: FastifyInstance, id: string) {
  const res = await app.inject({
    method: 'POST',
    url: `/emails/${id}/snooze`,
    headers: { 'x-test-user': 'u1' },
    payload: { snoozeUntil: new Date(Date.now() + 3_600_000).toISOString() },
  });
  return { status: res.statusCode, body: JSON.parse(res.body) };
}

describe('POST /emails/:id/snooze — draft/spam guards (SNOOZED predicate parity)', () => {
  let app: FastifyInstance | null = null;
  afterEach(async () => {
    if (app) await app.close();
    app = null;
  });

  it('409s a draft with EMAIL_IS_DRAFT and never touches the thread', async () => {
    ({ app } = await buildApp(emailRow('d1', { isDraft: true })));
    const { status, body } = await snooze(app, 'd1');
    expect(status).toBe(409);
    expect(body.error.code).toBe('EMAIL_IS_DRAFT');
  });

  it('409s spam with EMAIL_IS_SPAM and never touches the thread', async () => {
    ({ app } = await buildApp(emailRow('s1', { isSpam: true })));
    const { status, body } = await snooze(app, 's1');
    expect(status).toBe(409);
    expect(body.error.code).toBe('EMAIL_IS_SPAM');
  });

  it('keeps the trash guard (EMAIL_IN_TRASH) — unchanged behavior', async () => {
    ({ app } = await buildApp(emailRow('t-trash', { isTrash: true })));
    const { status, body } = await snooze(app, 't-trash');
    expect(status).toBe(409);
    expect(body.error.code).toBe('EMAIL_IN_TRASH');
  });

  it('still snoozes ordinary mail — the guards do not break the normal path', async () => {
    ({ app } = await buildApp(emailRow('m1')));
    const { status, body } = await snooze(app, 'm1');
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.message).toBe('Email snoozed');
  });

  it('rejects a non-future snooze time before any guard (400 INVALID_SNOOZE_TIME)', async () => {
    ({ app } = await buildApp(emailRow('m1')));
    const res = await app.inject({
      method: 'POST',
      url: '/emails/m1/snooze',
      headers: { 'x-test-user': 'u1' },
      payload: { snoozeUntil: new Date(Date.now() - 3_600_000).toISOString() },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe('INVALID_SNOOZE_TIME');
  });
});
