// @vitest-environment node
// ============================================================================
// /notifications/push/* — Web Push subscription registration (QM-UIUX-053).
// ============================================================================
//
// Before this task QuantMail had no push registration surface at all: the
// substrate in `@quant/notifications` was never instantiated and no route
// wrote a `PushSubscription` row. These tests hold the new surface to its
// contract:
//
//   1. Auth is mandatory and ownership comes from the session — a `userId`
//      smuggled in the body is ignored, never trusted (BOLA).
//   2. Register → re-register → unregister is a real round-trip against the
//      store: one row per (user, endpoint), keys refreshed in place — and a
//      subscribe naming ANOTHER user's endpoint never overwrites or
//      reassigns their row; the caller gets their own row (BOLA).
//   3. Malformed payloads are 400s, never 200s over a partial write.
//   4. Unsubscribe is scoped to the caller: naming another user's endpoint
//      removes nothing.
//   5. The VAPID probe reports configuration honestly — no keys in the
//      environment means `configured: false`, not a hopeful key.
//
// HARNESS: the REAL notificationRoutes on a bare Fastify app at the
// `/notifications` prefix `app.ts` mounts them under, with the REAL error
// handler. Prisma is an in-memory fake of the two delegates these routes
// touch — what the handlers pass down is the thing under test.
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import { errorHandlerPlugin } from '@quant/server-core';
import notificationRoutes from '../routes/notifications';

interface SubRow {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  expiresAt: Date | null;
  createdAt: Date;
}

const ENDPOINT = 'https://push.example.com/subscription/abc123';

function subscriptionBody(overrides: Record<string, unknown> = {}) {
  return {
    endpoint: ENDPOINT,
    keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
    expirationTime: null,
    ...overrides,
  };
}

function fakePrisma() {
  const rows: SubRow[] = [];
  let seq = 0;
  return {
    rows,
    notification: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    pushSubscription: {
      findFirst: vi.fn(async ({ where }: { where: { endpoint: string; userId?: string } }) => {
        return (
          rows.find(
            (row) =>
              row.endpoint === where.endpoint &&
              (where.userId === undefined || row.userId === where.userId),
          ) ?? null
        );
      }),
      findMany: vi.fn(async ({ where }: { where: { userId: string } }) => {
        return rows.filter((row) => row.userId === where.userId);
      }),
      create: vi.fn(
        async ({
          data,
        }: {
          data: Omit<SubRow, 'id' | 'createdAt'>;
        }): Promise<SubRow> => {
          const row: SubRow = { id: `sub-${(seq += 1)}`, createdAt: new Date(), ...data };
          rows.push(row);
          return row;
        },
      ),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<SubRow>;
        }): Promise<SubRow> => {
          const row = rows.find((candidate) => candidate.id === where.id);
          if (!row) throw new Error('row not found');
          Object.assign(row, data);
          return row;
        },
      ),
      deleteMany: vi.fn(
        async ({
          where,
        }: {
          where: { userId: string; endpoint: string | { in: string[] } };
        }): Promise<{ count: number }> => {
          const endpoints =
            typeof where.endpoint === 'string' ? [where.endpoint] : where.endpoint.in;
          let count = 0;
          for (let i = rows.length - 1; i >= 0; i -= 1) {
            const row = rows[i]!;
            if (row.userId === where.userId && endpoints.includes(row.endpoint)) {
              rows.splice(i, 1);
              count += 1;
            }
          }
          return { count };
        },
      ),
    },
  };
}

type FakePrisma = ReturnType<typeof fakePrisma>;
let prisma: FakePrisma;

async function buildApp(userId: string | null = 'user-1') {
  prisma = fakePrisma();
  const app = Fastify();
  await app.register(errorHandlerPlugin);
  app.decorate('prisma', prisma as never);
  app.addHook('onRequest', async (request) => {
    if (userId) (request as unknown as { auth: { userId: string } }).auth = { userId };
  });
  await app.register(notificationRoutes, { prefix: '/notifications' });
  await app.ready();
  return app;
}

describe('POST /notifications/push/subscribe', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('requires authentication', async () => {
    const app = await buildApp(null);
    const res = await app.inject({
      method: 'POST',
      url: '/notifications/push/subscribe',
      payload: subscriptionBody(),
    });
    expect(res.statusCode).toBe(401);
    expect(prisma.rows).toHaveLength(0);
  });

  it('persists the subscription under the authenticated user', async () => {
    const app = await buildApp('user-1');
    const res = await app.inject({
      method: 'POST',
      url: '/notifications/push/subscribe',
      payload: subscriptionBody(),
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ success: true, data: { subscribed: true } });
    expect(prisma.rows).toHaveLength(1);
    expect(prisma.rows[0]).toMatchObject({
      userId: 'user-1',
      endpoint: ENDPOINT,
      p256dh: 'p256dh-key',
      auth: 'auth-key',
      expiresAt: null,
    });
  });

  it('ignores a userId smuggled in the body — ownership is the session', async () => {
    const app = await buildApp('user-1');
    const res = await app.inject({
      method: 'POST',
      url: '/notifications/push/subscribe',
      payload: subscriptionBody({ userId: 'victim-9' }),
    });
    expect(res.statusCode).toBe(201);
    expect(prisma.rows).toHaveLength(1);
    expect(prisma.rows[0]!.userId).toBe('user-1');
  });

  it('rejects a payload with missing keys', async () => {
    const app = await buildApp('user-1');
    const res = await app.inject({
      method: 'POST',
      url: '/notifications/push/subscribe',
      payload: { endpoint: ENDPOINT },
    });
    expect(res.statusCode).toBe(400);
    expect(prisma.rows).toHaveLength(0);
  });

  it('rejects a non-https endpoint', async () => {
    const app = await buildApp('user-1');
    const res = await app.inject({
      method: 'POST',
      url: '/notifications/push/subscribe',
      payload: subscriptionBody({ endpoint: 'http://push.example.com/insecure' }),
    });
    expect(res.statusCode).toBe(400);
    expect(prisma.rows).toHaveLength(0);
  });

  it('re-registering the same endpoint refreshes keys in place — still one row', async () => {
    const app = await buildApp('user-1');
    await app.inject({
      method: 'POST',
      url: '/notifications/push/subscribe',
      payload: subscriptionBody(),
    });
    const res = await app.inject({
      method: 'POST',
      url: '/notifications/push/subscribe',
      payload: subscriptionBody({ keys: { p256dh: 'new-p256dh', auth: 'new-auth' } }),
    });
    expect(res.statusCode).toBe(201);
    expect(prisma.rows).toHaveLength(1);
    expect(prisma.rows[0]).toMatchObject({ p256dh: 'new-p256dh', auth: 'new-auth' });
  });

  it('does not overwrite another user’s subscription when its endpoint is re-registered', async () => {
    const app = await buildApp('user-2');
    // Seed user-1's existing subscription for the same endpoint (buildApp
    // resets the fake, so the victim row is seeded directly, mirroring the
    // unsubscribe BOLA test below).
    prisma.rows.push({
      id: 'sub-victim',
      userId: 'user-1',
      endpoint: ENDPOINT,
      p256dh: 'victim-p256dh',
      auth: 'victim-auth',
      expiresAt: null,
      createdAt: new Date(),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/notifications/push/subscribe',
      payload: subscriptionBody({ keys: { p256dh: 'attacker-p256dh', auth: 'attacker-auth' } }),
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ success: true, data: { subscribed: true } });
    // The victim's row is untouched: same owner, same keys.
    const victimRow = prisma.rows.find((row) => row.id === 'sub-victim');
    expect(victimRow).toMatchObject({
      userId: 'user-1',
      p256dh: 'victim-p256dh',
      auth: 'victim-auth',
    });
    // The caller got their own row for the endpoint.
    const callerRows = prisma.rows.filter((row) => row.userId === 'user-2');
    expect(callerRows).toHaveLength(1);
    expect(callerRows[0]).toMatchObject({
      endpoint: ENDPOINT,
      p256dh: 'attacker-p256dh',
      auth: 'attacker-auth',
    });
    expect(prisma.rows).toHaveLength(2);
  });

  it('stores expirationTime as expiresAt', async () => {
    const app = await buildApp('user-1');
    const expiry = Date.now() + 86_400_000;
    await app.inject({
      method: 'POST',
      url: '/notifications/push/subscribe',
      payload: subscriptionBody({ expirationTime: expiry }),
    });
    expect(prisma.rows[0]!.expiresAt?.getTime()).toBe(expiry);
  });
});

describe('POST /notifications/push/unsubscribe', () => {
  it('removes the caller\u2019s subscription — register/unregister round-trip', async () => {
    const app = await buildApp('user-1');
    await app.inject({
      method: 'POST',
      url: '/notifications/push/subscribe',
      payload: subscriptionBody(),
    });
    expect(prisma.rows).toHaveLength(1);

    const res = await app.inject({
      method: 'POST',
      url: '/notifications/push/unsubscribe',
      payload: { endpoint: ENDPOINT },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ success: true, data: { removed: 1 } });
    expect(prisma.rows).toHaveLength(0);
  });

  it('cannot remove another user\u2019s subscription by naming its endpoint', async () => {
    const app = await buildApp('user-1');
    await app.inject({
      method: 'POST',
      url: '/notifications/push/subscribe',
      payload: subscriptionBody(),
    });

    const otherApp = await buildApp('user-2');
    // buildApp resets the fake; reseed user-1's row into this app's store.
    prisma.rows.push({
      id: 'sub-other',
      userId: 'user-1',
      endpoint: ENDPOINT,
      p256dh: 'p256dh-key',
      auth: 'auth-key',
      expiresAt: null,
      createdAt: new Date(),
    });
    const res = await otherApp.inject({
      method: 'POST',
      url: '/notifications/push/unsubscribe',
      payload: { endpoint: ENDPOINT },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ success: true, data: { removed: 0 } });
    expect(prisma.rows).toHaveLength(1);
    expect(prisma.rows[0]!.userId).toBe('user-1');
  });

  it('requires authentication', async () => {
    const app = await buildApp(null);
    const res = await app.inject({
      method: 'POST',
      url: '/notifications/push/unsubscribe',
      payload: { endpoint: ENDPOINT },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects a malformed body', async () => {
    const app = await buildApp('user-1');
    const res = await app.inject({
      method: 'POST',
      url: '/notifications/push/unsubscribe',
      payload: { endpoint: 'not-a-url' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /notifications/push/vapid-public-key', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('requires authentication', async () => {
    const app = await buildApp(null);
    const res = await app.inject({ method: 'GET', url: '/notifications/push/vapid-public-key' });
    expect(res.statusCode).toBe(401);
  });

  it('reports not-configured when no VAPID keys are in the environment', async () => {
    vi.stubEnv('VAPID_PUBLIC_KEY', '');
    vi.stubEnv('VAPID_PRIVATE_KEY', '');
    const app = await buildApp('user-1');
    const res = await app.inject({ method: 'GET', url: '/notifications/push/vapid-public-key' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      success: true,
      data: { configured: false, publicKey: null },
    });
  });

  it('returns the public key when VAPID is configured', async () => {
    vi.stubEnv('VAPID_PUBLIC_KEY', 'BPublicKeyFromEnv');
    vi.stubEnv('VAPID_PRIVATE_KEY', 'private-key-from-env');
    const app = await buildApp('user-1');
    const res = await app.inject({ method: 'GET', url: '/notifications/push/vapid-public-key' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      success: true,
      data: { configured: true, publicKey: 'BPublicKeyFromEnv' },
    });
  });
});
