// @vitest-environment node
// ============================================================================
// POST /labels/remove backend route tests.
//
// The inbox row's label picker needs remove, not just apply — until this
// route existed the picker would have been a one-way door (apply only),
// which is why the row stayed unwired. These tests mount the REAL
// labelsRoutes plugin on a bare Fastify instance with a stubbed prisma and
// assert the contract: valid remove → 200 with the label gone from the
// email's labels; bad body → 400; no auth → 401; missing email → 404.
//
// No fake data: every label list asserted here comes from the stubbed
// prisma row in the shape the service projects.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { errorHandlerPlugin } from '@quant/server-core';
import labelsRoutes from '../routes/labels';

interface EmailRow {
  id: string;
  userId: string;
  labels: string[];
  version: number;
}

let emailRow: EmailRow | null;

function makePrisma() {
  const mock: {
    email: { findUnique: ReturnType<typeof vi.fn>; updateMany: ReturnType<typeof vi.fn> };
    outboxEvent: { create: ReturnType<typeof vi.fn> };
    $transaction: ReturnType<typeof vi.fn>;
  } = {
    email: {
      findUnique: vi.fn(async () =>
        emailRow ? { ...emailRow, labels: [...emailRow.labels] } : null,
      ),
      updateMany: vi.fn(async (args: { data: { labels: string[] } }) => {
        if (emailRow) {
          emailRow = { ...emailRow, labels: [...args.data.labels], version: emailRow.version + 1 };
        }
        return { count: 1 };
      }),
    },
    outboxEvent: {
      create: vi.fn(async (args: { data: Record<string, unknown> }) => ({
        id: 'outbox-1',
        publishedAt: null,
        createdAt: new Date(),
        ...args.data,
      })),
    },
    $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(mock)),
  };
  return mock;
}

async function buildApp(withAuth: boolean): Promise<FastifyInstance> {
  const app: FastifyInstance = Fastify();
  await app.register(errorHandlerPlugin);
  app.decorate('prisma', makePrisma() as never);
  if (withAuth) {
    app.addHook('onRequest', async (request) => {
      (request as unknown as { auth: { userId: string } }).auth = { userId: 'user-1' };
    });
  }
  await app.register(labelsRoutes, { prefix: '/labels' });
  return app;
}

beforeEach(() => {
  emailRow = { id: 'email-1', userId: 'user-1', labels: ['label-1', 'label-2'], version: 1 };
});

describe('POST /labels/remove', () => {
  it('removes the label and returns the updated email', async () => {
    const app = await buildApp(true);
    const res = await app.inject({
      method: 'POST',
      url: '/labels/remove',
      payload: { emailId: 'email-1', labelId: 'label-2' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { success: boolean; data: { labels: string[] } };
    expect(body.success).toBe(true);
    expect(body.data.labels).toEqual(['label-1']);
  });

  it('is idempotent — removing an absent label still returns the email', async () => {
    const app = await buildApp(true);
    const res = await app.inject({
      method: 'POST',
      url: '/labels/remove',
      payload: { emailId: 'email-1', labelId: 'label-9' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { success: boolean; data: { labels: string[] } };
    expect(body.success).toBe(true);
    expect(body.data.labels).toEqual(['label-1', 'label-2']);
  });

  it('rejects a body missing labelId with 400', async () => {
    const app = await buildApp(true);
    const res = await app.inject({
      method: 'POST',
      url: '/labels/remove',
      payload: { emailId: 'email-1' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects unauthenticated requests with 401', async () => {
    const app = await buildApp(false);
    const res = await app.inject({
      method: 'POST',
      url: '/labels/remove',
      payload: { emailId: 'email-1', labelId: 'label-2' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 for a missing email', async () => {
    emailRow = null;
    const app = await buildApp(true);
    const res = await app.inject({
      method: 'POST',
      url: '/labels/remove',
      payload: { emailId: 'missing', labelId: 'label-2' },
    });
    expect(res.statusCode).toBe(404);
    const body = res.json() as { error?: { code?: string } };
    expect(body.error?.code).toBe('EMAIL_NOT_FOUND');
  });
});
