import { describe, it, expect, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';

import idempotencyPlugin, {
  MemoryIdempotencyStore,
  RedisIdempotencyStore,
  enableIdempotency,
  type IdempotencyStore,
} from '../idempotency';

/**
 * Builds a bare Fastify app with the idempotency plugin registered and a set
 * of opted-in routes backed by a counting handler.
 *
 * Auth is faked via an `x-test-user` header (the plugin scopes keys per
 * `request.auth.userId`, exactly like the real auth plugin populates it).
 */
async function buildApp(opts?: {
  store?: IdempotencyStore;
  processingTtlSeconds?: number;
  blockFirstHandler?: () => Promise<void>;
}) {
  const app = Fastify({ logger: false });
  await app.register(idempotencyPlugin, {
    store: opts?.store ?? new MemoryIdempotencyStore(),
    processingTtlSeconds: opts?.processingTtlSeconds,
  });

  // Fake auth: mirror what the real auth plugin does (request.auth.userId).
  app.addHook('onRequest', async (request: FastifyRequest) => {
    const user = request.headers['x-test-user'];
    (request as unknown as { auth?: { userId: string } }).auth = {
      userId: typeof user === 'string' && user ? user : 'user-1',
    };
  });

  let executions = 0;
  let releaseGate: (() => void) | null = null;

  // Opted-in route file (one line, like the real route files do).
  await app.register(async (instance: FastifyInstance) => {
    instance.idempotency();
    instance.post('/send', async (_request, reply) => {
      executions += 1;
      if (opts?.blockFirstHandler && executions === 1) {
        await new Promise<void>((resolve) => {
          releaseGate = resolve;
        });
      }
      return reply.code(201).send({ success: true, n: executions });
    });
    instance.get('/send', async (_request, reply) => {
      executions += 1;
      return reply.send({ success: true, n: executions });
    });
    instance.post('/flaky', async (_request, reply) => {
      executions += 1;
      if (executions === 1) {
        return reply.code(500).send({ success: false, error: 'boom' });
      }
      return reply.send({ success: true, n: executions });
    });
  });

  // NOT opted in — the header must be ignored here.
  await app.register(async (instance: FastifyInstance) => {
    instance.post('/plain', async (_request, reply) => {
      executions += 1;
      return reply.send({ success: true, n: executions });
    });
  });

  return {
    app,
    get executions() {
      return executions;
    },
    releaseGate: () => releaseGate?.(),
  };
}

function postKey(app: FastifyInstance, url: string, key: string | undefined, body = { a: 1 }, user = 'user-1') {
  return app.inject({
    method: 'POST',
    url,
    headers: {
      ...(key ? { 'idempotency-key': key } : {}),
      'x-test-user': user,
    },
    payload: body,
  });
}

describe('idempotency plugin (K4)', () => {
  let ctx: Awaited<ReturnType<typeof buildApp>>;
  beforeEach(async () => {
    ctx = await buildApp();
  });

  it('replays the identical response on a duplicate key without re-executing the handler', async () => {
    const first = await postKey(ctx.app, '/send', 'key-abc');
    expect(first.statusCode).toBe(201);
    expect(first.json()).toEqual({ success: true, n: 1 });
    expect(first.headers['idempotent-replayed']).toBeUndefined();
    expect(ctx.executions).toBe(1);

    const second = await postKey(ctx.app, '/send', 'key-abc');
    expect(second.statusCode).toBe(201);
    expect(second.json()).toEqual({ success: true, n: 1 });
    expect(second.headers['idempotent-replayed']).toBe('true');
    expect(ctx.executions).toBe(1);
  });

  it('executes again for a different key', async () => {
    await postKey(ctx.app, '/send', 'key-1');
    const res = await postKey(ctx.app, '/send', 'key-2');
    expect(res.json()).toEqual({ success: true, n: 2 });
    expect(ctx.executions).toBe(2);
  });

  it('executes normally when no key is sent', async () => {
    await postKey(ctx.app, '/send', undefined);
    await postKey(ctx.app, '/send', undefined);
    expect(ctx.executions).toBe(2);
  });

  it('rejects key reuse with a different request body (422)', async () => {
    await postKey(ctx.app, '/send', 'key-reuse', { a: 1 });
    const res = await postKey(ctx.app, '/send', 'key-reuse', { a: 2 });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('IDEMPOTENCY_KEY_REUSE');
    expect(ctx.executions).toBe(1);
  });

  it('ignores the header on non-mutating routes', async () => {
    const headers = { 'idempotency-key': 'k', 'x-test-user': 'user-1' };
    await ctx.app.inject({ method: 'GET', url: '/send', headers });
    await ctx.app.inject({ method: 'GET', url: '/send', headers });
    expect(ctx.executions).toBe(2);
  });

  it('ignores the header on routes that did not opt in', async () => {
    await postKey(ctx.app, '/plain', 'key-plain');
    await postKey(ctx.app, '/plain', 'key-plain');
    expect(ctx.executions).toBe(2);
  });

  it('ignores malformed keys', async () => {
    await postKey(ctx.app, '/send', 'has spaces and \n newlines');
    await postKey(ctx.app, '/send', 'has spaces and \n newlines');
    expect(ctx.executions).toBe(2);
  });

  it('scopes keys per authenticated user', async () => {
    await postKey(ctx.app, '/send', 'shared-key', { a: 1 }, 'user-1');
    const res = await postKey(ctx.app, '/send', 'shared-key', { a: 1 }, 'user-2');
    expect(res.json()).toEqual({ success: true, n: 2 });
    expect(res.headers['idempotent-replayed']).toBeUndefined();
    expect(ctx.executions).toBe(2);
  });

  it('releases the key after a non-2xx response so the client can retry', async () => {
    const failed = await postKey(ctx.app, '/flaky', 'key-flaky');
    expect(failed.statusCode).toBe(500);

    const retried = await postKey(ctx.app, '/flaky', 'key-flaky');
    expect(retried.statusCode).toBe(200);
    expect(retried.json()).toEqual({ success: true, n: 2 });
    expect(ctx.executions).toBe(2);
  });

  it('returns 409 while the first request is still in flight', async () => {
    const blocking = await buildApp({ blockFirstHandler: () => Promise.resolve() });
    const first = blocking.app.inject({
      method: 'POST',
      url: '/send',
      headers: { 'idempotency-key': 'key-inflight', 'x-test-user': 'user-1' },
      payload: { a: 1 },
    });
    // Let the first request claim the key and block inside the handler.
    await new Promise((r) => setTimeout(r, 50));

    const second = await postKey(blocking.app, '/send', 'key-inflight');
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe('IDEMPOTENCY_IN_FLIGHT');
    expect(second.headers['retry-after']).toBe('1');

    blocking.releaseGate();
    const firstRes = await first;
    expect(firstRes.statusCode).toBe(201);
    expect(blocking.executions).toBe(1);
  });

  it('fails closed with 503 when the store is unavailable', async () => {
    const brokenStore: IdempotencyStore = {
      get: async () => {
        throw new Error('redis down');
      },
      claimProcessing: async () => {
        throw new Error('redis down');
      },
      setCompleted: async () => {
        throw new Error('redis down');
      },
      release: async () => {},
    };
    const broken = await buildApp({ store: brokenStore });
    const res = await postKey(broken.app, '/send', 'key-broken');
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe('IDEMPOTENCY_STORE_UNAVAILABLE');
    expect(broken.executions).toBe(0);

    // Requests without a key are unaffected by the outage.
    const plain = await postKey(broken.app, '/send', undefined);
    expect(plain.statusCode).toBe(201);
  });
});

describe('enableIdempotency helper', () => {
  it('no-ops when the plugin is not registered (isolated route unit tests)', async () => {
    const app = Fastify({ logger: false });
    expect(() => enableIdempotency(app)).not.toThrow();
  });

  it('marks routes once the plugin IS registered', async () => {
    const app = Fastify({ logger: false });
    await app.register(idempotencyPlugin, { store: new MemoryIdempotencyStore() });
    let n = 0;
    await app.register(async (instance: FastifyInstance) => {
      enableIdempotency(instance);
      instance.post('/x', async (_request, reply) => {
        n += 1;
        return reply.send({ n });
      });
    });
    const headers = { 'idempotency-key': 'k1' };
    const first = await app.inject({ method: 'POST', url: '/x', headers, payload: {} });
    const second = await app.inject({ method: 'POST', url: '/x', headers, payload: {} });
    expect(first.json()).toEqual({ n: 1 });
    expect(second.json()).toEqual({ n: 1 });
    expect(second.headers['idempotent-replayed']).toBe('true');
    expect(n).toBe(1);
  });
});

describe('MemoryIdempotencyStore', () => {
  it('round-trips completed entries and honours TTL expiry', async () => {
    const store = new MemoryIdempotencyStore();
    expect(await store.get('k')).toBeNull();
    expect(await store.claimProcessing('k', 'fp', 50)).toBe(true);
    expect(await store.claimProcessing('k', 'fp', 50)).toBe(false);
    await store.setCompleted(
      'k',
      { status: 'completed', fingerprint: 'fp', statusCode: 200, headers: {}, body: '{}' },
      50,
    );
    expect((await store.get('k'))?.status).toBe('completed');
    await new Promise((r) => setTimeout(r, 70));
    expect(await store.get('k')).toBeNull();
    // After expiry the key can be claimed again.
    expect(await store.claimProcessing('k', 'fp', 1000)).toBe(true);
    await store.release('k');
    expect(await store.get('k')).toBeNull();
  });
});

describe('RedisIdempotencyStore', () => {
  it('uses SET NX for atomic claims and JSON round-trip', async () => {
    const backing = new Map<string, string>();
    const fakeRedis = {
      get: async (k: string) => backing.get(k) ?? null,
      set: async (k: string, v: string, ..._args: unknown[]) => {
        const nx = _args.includes('NX');
        if (nx && backing.has(k)) return null;
        backing.set(k, v);
        return 'OK';
      },
      del: async (k: string) => (backing.delete(k) ? 1 : 0),
    };
    const store = new RedisIdempotencyStore(fakeRedis as never);

    expect(await store.claimProcessing('k', 'fp', 1000)).toBe(true);
    expect(await store.claimProcessing('k', 'fp', 1000)).toBe(false);
    const entry = {
      status: 'completed' as const,
      fingerprint: 'fp',
      statusCode: 201,
      headers: { 'content-type': 'application/json' },
      body: '{"ok":true}',
    };
    await store.setCompleted('k', entry, 1000);
    expect(await store.get('k')).toEqual(entry);
    await store.release('k');
    expect(await store.get('k')).toBeNull();
  });
});
