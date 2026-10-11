/**
 * F-02b regression pins — POST /payments/refunds caller-ownership (IDOR) pins.
 *
 * Before the fix, any authenticated holder of the `payments:write` scope
 * could refund ANY user's PaymentIntent: the handler never retrieved the
 * intent and never compared its owner with the caller. These tests FAIL
 * against the pre-fix route and PASS with the ownership gate.
 *
 * The narrowing pin additionally proves that a genuine gateway failure from
 * the refund call itself (a raw Stripe-shaped error carrying BOTH
 * `statusCode` and `code`) is still mapped to the canonical
 * 502 PAYMENT_GATEWAY_ERROR envelope — the first fix draft's duck-type
 * guard let such errors escape unmapped.
 */
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { errorHandlerPlugin } from '@quant/server-core';
import paymentsRoutes from '../routes/payments';

const USER_A = 'user-attacker';
const USER_B = 'user-victim';
const VICTIM_INTENT = 'pi_victim_1';
const OWN_INTENT = 'pi_attacker_1';

/** Module-level stable pre-handler: stands in for server-core's requireAuth
 * decorator (scope enforcement is orthogonal to the ownership gate). */
const noopPreHandler = async (): Promise<void> => undefined;
const stableRequireAuth = (_options?: unknown): typeof noopPreHandler => noopPreHandler;

interface FakeGateway {
  retrievePaymentIntent: ReturnType<typeof vi.fn>;
  refund: ReturnType<typeof vi.fn>;
}

/** Fake gateway with STABLE method identities per instance (created once in
 * the factory, never re-created per call). `owners` maps intentId → the
 * userId stamped into the intent's metadata at creation time. */
function createFakeGateway(owners: Record<string, string>): FakeGateway {
  return {
    retrievePaymentIntent: vi.fn(async (paymentIntentId: string) => {
      const owner = owners[paymentIntentId];
      if (!owner) {
        const err = new Error(`No such payment_intent: ${paymentIntentId}`) as Error & {
          statusCode: number;
          code: string;
        };
        err.statusCode = 404;
        err.code = 'resource_missing';
        throw err;
      }
      return { id: paymentIntentId, metadata: { userId: owner } };
    }),
    refund: vi.fn(async (params: { paymentIntentId: string; amount?: number }) => ({
      id: 're_test_1',
      status: 'succeeded',
      amount: params.amount ?? 100,
    })),
  };
}

async function buildApp(gateway: FakeGateway): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(errorHandlerPlugin);
  app.addHook('onRequest', async (req) => {
    // Stands in for the verified-JWT auth hook: `request.auth.userId` is the
    // caller's verified identity; the header only selects WHICH verified
    // identity the harness presents.
    (req as unknown as { auth: unknown }).auth = {
      userId: String(req.headers['x-test-user'] ?? ''),
    };
  });
  (app as unknown as { decorate: (n: string, v: unknown) => void }).decorate(
    'requireAuth',
    stableRequireAuth,
  );
  (app as unknown as { decorate: (n: string, v: unknown) => void }).decorate('payments', {
    gateway,
    testMode: true,
  });
  await app.register(paymentsRoutes, { prefix: '/payments' });
  await app.ready();
  return app;
}

describe('F-02b POST /payments/refunds — caller-ownership enforced (quantube)', () => {
  let app: FastifyInstance | null = null;

  afterEach(async () => {
    if (app) await app.close();
    app = null;
  });

  it('attacker refunds victim intent → 403 USERID_MISMATCH, refund NOT issued', async () => {
    const gateway = createFakeGateway({ [VICTIM_INTENT]: USER_B });
    app = await buildApp(gateway);
    const res = await app.inject({
      method: 'POST',
      url: '/payments/refunds',
      headers: { 'x-test-user': USER_A },
      payload: { paymentIntentId: VICTIM_INTENT },
    });
    const body = res.json();
    expect(res.statusCode).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('USERID_MISMATCH');
    expect(gateway.refund).not.toHaveBeenCalled();
  });

  it('caller refunds OWN intent → 200, refund issued (no regression)', async () => {
    const gateway = createFakeGateway({ [OWN_INTENT]: USER_A });
    app = await buildApp(gateway);
    const res = await app.inject({
      method: 'POST',
      url: '/payments/refunds',
      headers: { 'x-test-user': USER_A },
      payload: { paymentIntentId: OWN_INTENT, amount: 500, reason: 'requested_by_customer' },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(gateway.refund).toHaveBeenCalledTimes(1);
    expect(gateway.refund.mock.calls[0]?.[0]).toMatchObject({
      paymentIntentId: OWN_INTENT,
      amount: 500,
    });
  });

  it('unknown intent (ownership unverifiable) → 404 fail-closed, refund NOT issued', async () => {
    const gateway = createFakeGateway({});
    app = await buildApp(gateway);
    const res = await app.inject({
      method: 'POST',
      url: '/payments/refunds',
      headers: { 'x-test-user': USER_A },
      payload: { paymentIntentId: 'pi_does_not_exist' },
    });
    const body = res.json();
    expect(res.statusCode).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('PAYMENT_INTENT_NOT_FOUND');
    expect(gateway.refund).not.toHaveBeenCalled();
  });

  it('gateway refund failure (Stripe-shaped error) → 502 PAYMENT_GATEWAY_ERROR envelope', async () => {
    const gateway = createFakeGateway({ [OWN_INTENT]: USER_A });
    const stripeErr = new Error('This PaymentIntent has already been refunded') as Error & {
      statusCode: number;
      code: string;
    };
    stripeErr.statusCode = 402;
    stripeErr.code = 'charge_already_refunded';
    gateway.refund.mockRejectedValue(stripeErr);
    app = await buildApp(gateway);
    const res = await app.inject({
      method: 'POST',
      url: '/payments/refunds',
      headers: { 'x-test-user': USER_A },
      payload: { paymentIntentId: OWN_INTENT },
    });
    const body = res.json();
    expect(res.statusCode).toBe(502);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('PAYMENT_GATEWAY_ERROR');
  });
});
