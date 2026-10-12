// ===========================================================================
// QC-F-142 §3.4 — POST /notifications/send must never honour a
// caller-supplied deep link
// ===========================================================================
//
// Before the fix, the route passed the request body's `deepLink` straight
// into the push payload, and the service worker opens that value verbatim
// on tap. Any (self-)caller could therefore land the user on a dead route
// ('/notifications' — a page that does not exist) or on an arbitrary path.
//
// Fix: the route IGNORES the body's deepLink and computes the target
// server-side from category + contentId with the canonical resolver
// (backend/lib/notification-deeplink), which only ever returns real
// routes. The transport itself is mocked here so the test can inspect the
// exact payload the route hands to dispatch — buildPushBody serialises
// payload.deepLink verbatim, so this payload IS the wire value.
//
// QC-F-021's self-send gate is untouched and remains covered by its own
// suite; this file only pins the deep-link hygiene.
// ===========================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import type { NotificationPayload } from '../lib/notification-dispatch';

const captured = vi.hoisted(() => ({ payloads: [] as NotificationPayload[] }));

vi.mock('../lib/notification-dispatch', async (importOriginal) => {
  const original = await importOriginal<typeof import('../lib/notification-dispatch')>();
  return {
    ...original,
    dispatchNotification: async (payload: NotificationPayload) => {
      captured.payloads.push(payload);
      return { delivered: 0, failed: 0, transportAvailable: false, expiredEndpoints: [] as string[] };
    },
  };
});

import notificationsRoutes from '../routes/notifications';

const CALLER = { userId: 'user_qc_f_142_caller', username: 'caller142' };

// One stored push subscription for the caller, in the Prisma shape
// loadSubscriptions expects (module-level stable identity).
const SUB_ROW = {
  endpoint: 'https://push.example/qc-f-142-caller',
  p256dh: 'key-p',
  auth: 'key-a',
  expiresAt: null,
};

function makeFakePrisma() {
  return {
    pushSubscription: {
      async findMany() {
        return [SUB_ROW];
      },
      async deleteMany() {
        return { count: 0 };
      },
      async upsert() {
        return {};
      },
    },
  };
}

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.setErrorHandler((err, _request, reply) => {
    const e = err as Error & { statusCode?: number; code?: string };
    if (typeof e.statusCode === 'number') {
      return reply.status(e.statusCode).send({
        success: false,
        error: { code: e.code ?? 'ERROR', message: e.message, statusCode: e.statusCode },
      });
    }
    return reply.status(500).send({ success: false, error: { message: e.message } });
  });
  (app as unknown as { decorate: (key: string, value: unknown) => void }).decorate(
    'prisma',
    makeFakePrisma(),
  );
  app.addHook('preHandler', async (req) => {
    (req as unknown as { auth: unknown }).auth = {
      userId: CALLER.userId,
      username: CALLER.username,
      email: '',
      role: 'user',
      scopes: [],
      sessionId: 'sess_test',
      app: 'quantchat',
      tokenId: 'tok_test',
    };
  });
  await app.register(notificationsRoutes, { prefix: '/notifications' });
  await app.ready();
  return app;
}

describe('QC-F-142 — /notifications/send deep link is server-computed', () => {
  let app: FastifyInstance | null = null;

  beforeEach(() => {
    captured.payloads.length = 0;
  });

  afterEach(async () => {
    if (app) await app.close();
    app = null;
  });

  async function send(extra: Record<string, unknown>) {
    app = await buildApp();
    return app.inject({
      method: 'POST',
      url: '/notifications/send',
      payload: { title: 'hello', body: 'world', ...extra },
    });
  }

  it("a caller deepLink of '/notifications' is replaced by the resolver target", async () => {
    const res = await send({ category: 'MESSAGES', contentId: 'conv-9', deepLink: '/notifications' });
    expect(res.statusCode).toBe(200);
    expect(captured.payloads).toHaveLength(1);
    expect(captured.payloads[0]!.deepLink).toBe('/chat/conv-9');
  });

  it('an external caller deepLink is never passed through', async () => {
    const res = await send({ category: 'CALLS', contentId: 'call-1', deepLink: 'https://evil.example/x' });
    expect(res.statusCode).toBe(200);
    expect(captured.payloads).toHaveLength(1);
    expect(captured.payloads[0]!.deepLink).toBe('/calls');
  });

  it('without a caller deepLink the target still comes from the resolver (SYSTEM -> /)', async () => {
    const res = await send({ category: 'SYSTEM' });
    expect(res.statusCode).toBe(200);
    expect(captured.payloads).toHaveLength(1);
    expect(captured.payloads[0]!.deepLink).toBe('/');
  });

  it('STORIES with an id resolves to the real /stories page, not /stories/<id>', async () => {
    const res = await send({ category: 'STORIES', contentId: 'story-7', deepLink: '/stories/story-7' });
    expect(res.statusCode).toBe(200);
    expect(captured.payloads).toHaveLength(1);
    expect(captured.payloads[0]!.deepLink).toBe('/stories');
  });
});
