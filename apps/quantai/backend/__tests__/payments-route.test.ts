// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Route-boundary tests for POST /payments/process.
 *
 * Focus: the validation-error classification added by this fix — a
 * PaymentValidationError thrown by the REAL PaymentEngine must surface as HTTP
 * 400 with a stable code (never 500), while valid requests still return the
 * transaction.
 *
 * The engine is NOT mocked: invalid request bodies drive the real validation
 * guard in `@quant/payments` (the consolidated payments package, resolved from
 * is a true seam test through route -> engine -> error mapping. Only
 * `@quant/server-core` is mocked (a faithful `createAppError`), mirroring the
 * existing route-test convention in this app and avoiding the heavy `createApp`
 * import.
 */

vi.mock('@quant/server-core', () => {
  interface AppError extends Error {
    statusCode: number;
    code: string;
  }
  const createAppError = (message: string, statusCode: number, code: string): AppError => {
    const err = new Error(message) as AppError;
    err.statusCode = statusCode;
    err.code = code;
    return err;
  };
  return { createApp: vi.fn(), createAppError };
});

import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import paymentRoutes from '../routes/payments';

function buildApp(opts: { authed: boolean }): FastifyInstance {
  const app = Fastify();

  // Faithful @quant/server-core error-handler contract: a known AppError maps to
  // its own statusCode; anything else surfaces as 500.
  app.setErrorHandler((error: Error, _request, reply) => {
    const candidate = error as { statusCode?: unknown; code?: unknown };
    if (typeof candidate.statusCode === 'number' && typeof candidate.code === 'string') {
      return reply.status(candidate.statusCode).send({
        success: false,
        error: { code: candidate.code, message: error.message, statusCode: candidate.statusCode },
      });
    }
    return reply
      .status(500)
      .send({ success: false, error: { code: 'INTERNAL_ERROR', statusCode: 500 } });
  });

  app.addHook('preHandler', async (request: FastifyRequest) => {
    (request as unknown as { auth: { userId: string } | null }).auth = opts.authed
      ? { userId: 'u1' }
      : null;
  });

  return app;
}

describe('POST /payments/process — validation boundary (real engine)', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    // Ensure the engine singleton is in its no-processor (fail-closed) mode.
    vi.stubEnv('PAYMENT_PROCESSOR_URL', '');
    app = buildApp({ authed: true });
    await app.register(paymentRoutes, { prefix: '/payments' });
    await app.ready();
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await app.close();
  });

  it('maps an invalid (negative) amount to HTTP 400 with INVALID_PAYMENT_AMOUNT (never 500)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/payments/process',
      payload: { amount: -100, currency: 'USD', type: 'one_time' },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body) as { error: { code: string; statusCode: number } };
    expect(body.error.code).toBe('INVALID_PAYMENT_AMOUNT');
    expect(body.error.statusCode).toBe(400);
  });

  it('maps a zero amount to HTTP 400 with INVALID_PAYMENT_AMOUNT', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/payments/process',
      payload: { amount: 0, currency: 'USD', type: 'one_time' },
    });

    expect(res.statusCode).toBe(400);
    expect((JSON.parse(res.body) as { error: { code: string } }).error.code).toBe(
      'INVALID_PAYMENT_AMOUNT',
    );
  });

  it('maps an invalid currency to HTTP 400 with INVALID_PAYMENT_CURRENCY', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/payments/process',
      payload: { amount: 100, currency: 'us', type: 'one_time' },
    });

    expect(res.statusCode).toBe(400);
    expect((JSON.parse(res.body) as { error: { code: string } }).error.code).toBe(
      'INVALID_PAYMENT_CURRENCY',
    );
  });

  it('rejects a negative refund with HTTP 400 (negative amount never valid)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/payments/process',
      payload: { amount: -50, currency: 'USD', type: 'refund' },
    });

    expect(res.statusCode).toBe(400);
    expect((JSON.parse(res.body) as { error: { code: string } }).error.code).toBe(
      'INVALID_PAYMENT_AMOUNT',
    );
  });

  it('returns the transaction (200) for a valid request (fail-closed, no processor)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/payments/process',
      payload: { amount: 100, currency: 'USD', type: 'one_time' },
    });

    expect(res.statusCode).toBe(200);
    const tx = JSON.parse(res.body) as { amount: number; currency: string; status: string };
    expect(tx.amount).toBe(100);
    expect(tx.currency).toBe('USD');
    // No processor configured -> fail closed (unchanged behavior).
    expect(tx.status).toBe('failed');
  });

  it('rejects unauthenticated requests with 401 before reaching the engine', async () => {
    const unauthedApp = buildApp({ authed: false });
    await unauthedApp.register(paymentRoutes, { prefix: '/payments' });
    await unauthedApp.ready();

    const res = await unauthedApp.inject({
      method: 'POST',
      url: '/payments/process',
      payload: { amount: 100, currency: 'USD', type: 'one_time' },
    });

    expect(res.statusCode).toBe(401);
    await unauthedApp.close();
  });
});
