import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { StripeGateway } from '@quant/payments';

// ============================================================================
// payments seam — Stripe gateway decorator + scoped routes (quantmax, Task 14.4)
// ============================================================================
//
// Req 3.2, 7.6. Wires `@quant/payments` into quantmax AS-SHIPPED (no rewrite —
// Req 9.1), REUSING the completed quantube payments seam pattern EXACTLY
// (apps/quantube/backend/routes/payments.ts): the same `resolveStripeConfig` /
// `createPaymentsService` env-sourced construction, the same scoped JSON routes,
// and the same signature-verifying webhook in a SEPARATE raw-body plugin. The
// real Stripe-backed `StripeGateway` is composed once at boot into a decorated
// singleton (`fastify.payments`, never per-request) so the paid commerce/economy
// surfaces (quant-commerce, quant-economy — both `dependsOn @quant/payments`)
// have a money rail to build on.
//
// SECRETS (Req 7.6, design "Security Considerations"): the Stripe secret +
// webhook secret are read from `process.env` ONLY and are NEVER hardcoded. Per
// the resolved design Open Question 3, Stripe TEST MODE is acceptable to satisfy
// the DoD — we do NOT block on live keys. When the env vars are absent we fall
// back to obvious, non-functional TEST placeholders so the engine still
// CONSTRUCTS (and signature verification / Zod validation stay exercisable in
// test mode) without a live key. A real key is never embedded in source.
//
// AUTH (Req 7.1, 7.4): every JSON route below sits behind the global
// `onRequest` auth hook from `createApp()` (401 unauthenticated); the sensitive
// mutating routes additionally declare fine-grained scopes
// (`payments:write` / `payments:read`) via `requireAuth({ scopes })` (Req 7.4 —
// payments is explicitly called out as sensitive). The `/payments` prefix does
// NOT collide with any server-core PUBLIC_PATHS entry.
//
// WEBHOOK: the Stripe webhook is signature-authenticated, not JWT-authenticated,
// and needs the RAW request body for signature verification. It lives in a
// SEPARATE encapsulated plugin (`paymentsWebhookRoutes`) with its own raw-body
// content-type parser so the JSON routes here keep normal parsing. See that
// plugin for the PUBLIC_PATHS / signature-verification rationale.

/**
 * The payments service decorated onto the Fastify instance — the as-shipped
 * Stripe gateway from `@quant/payments`.
 */
export interface PaymentsService {
  gateway: StripeGateway;
  /** True when running against a TEST placeholder key (no live secret present). */
  testMode: boolean;
}

// Layer 2 type augmentation (mirrors prisma.ts): expose the decorated payments
// engine on the Fastify instance so routes are typed everywhere.
declare module 'fastify' {
  interface FastifyInstance {
    payments: PaymentsService;
  }
}

/**
 * Read the Stripe secrets from the environment (Req 7.6). When unset, fall back
 * to obvious TEST placeholders so the gateway constructs in test mode WITHOUT a
 * live key — never a real key, never hardcoded. Stripe's SDK only requires a
 * non-empty key string to construct; local crypto (webhook signature
 * verification) and Zod validation then work without any network/live key.
 */
export function resolveStripeConfig(): {
  secretKey: string;
  webhookSecret: string;
  testMode: boolean;
} {
  const secretKey = process.env['STRIPE_SECRET_KEY'];
  const webhookSecret = process.env['STRIPE_WEBHOOK_SECRET'];
  // A live secret key is one Stripe issues (sk_live_… / sk_test_…). Absence ⇒
  // test placeholder. We treat any non-`sk_live_` key as test mode for logging.
  const resolvedSecret = secretKey && secretKey.length > 0 ? secretKey : 'sk_test_placeholder';
  const resolvedWebhook =
    webhookSecret && webhookSecret.length > 0 ? webhookSecret : 'whsec_test_placeholder';
  return {
    secretKey: resolvedSecret,
    webhookSecret: resolvedWebhook,
    testMode: !resolvedSecret.startsWith('sk_live_'),
  };
}

/**
 * Construct the payments service (Stripe gateway) once at boot. Called from
 * quantmax's `buildApp()` via `app.decorate('payments', ...)`. Constructs even
 * when no live key is present (test mode) — see `resolveStripeConfig`.
 */
export function createPaymentsService(): PaymentsService {
  const { secretKey, webhookSecret, testMode } = resolveStripeConfig();
  return {
    gateway: new StripeGateway({ secretKey, webhookSecret }),
    testMode,
  };
}

const createIntentSchema = z.object({
  amount: z.number().int().positive(),
  currency: z.string().min(3).max(3),
  customerId: z.string().min(1).optional(),
  metadata: z.record(z.string(), z.string()).optional(),
});

const createCustomerSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  metadata: z.record(z.string(), z.string()).optional(),
});

const refundSchema = z.object({
  paymentIntentId: z.string().min(1),
  amount: z.number().int().positive().optional(),
  reason: z.enum(['duplicate', 'fraudulent', 'requested_by_customer']).optional(),
});

/**
 * Map a thrown Stripe/engine error into the canonical envelope. Stripe network
 * failures (expected in test mode without a live key) surface as a 502-class
 * gateway error rather than a bare 500 so the seam is honest about WHY.
 */
function asPaymentError(err: unknown): never {
  if (err instanceof Error && err.name === 'ZodError') {
    throw err; // let error-handler produce VALIDATION_ERROR
  }
  const message = err instanceof Error ? err.message : 'Payment gateway error';
  throw createAppError(message, 502, 'PAYMENT_GATEWAY_ERROR');
}

/**
 * JSON payment routes (Layer 3). Behind the global auth hook; mutating routes
 * carry `payments:write`. The webhook is intentionally NOT here — it needs a raw
 * body and lives in `paymentsWebhookRoutes`.
 */
export default async function paymentsRoutes(fastify: FastifyInstance) {
  // POST /payments/intents — create a Stripe PaymentIntent for a paid surface.
  // Sensitive money operation → `payments:write` (Req 7.4).
  fastify.post(
    '/intents',
    { preHandler: fastify.requireAuth({ scopes: ['payments:write'] }) },
    async (request, reply) => {
      const parsed = createIntentSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        throw parsed.error;
      }
      try {
        const intent = await fastify.payments.gateway.createPaymentIntent({
          amount: parsed.data.amount,
          currency: parsed.data.currency,
          customerId: parsed.data.customerId,
          metadata: { ...parsed.data.metadata, userId: request.auth.userId },
        });
        return reply.status(201).send({
          success: true,
          data: { id: intent.id, clientSecret: intent.client_secret, status: intent.status },
        });
      } catch (err) {
        return asPaymentError(err);
      }
    },
  );

  // POST /payments/customers — create a Stripe Customer. → `payments:write`.
  fastify.post(
    '/customers',
    { preHandler: fastify.requireAuth({ scopes: ['payments:write'] }) },
    async (request, reply) => {
      const parsed = createCustomerSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        throw parsed.error;
      }
      try {
        const customer = await fastify.payments.gateway.createCustomer({
          email: parsed.data.email,
          name: parsed.data.name,
          metadata: { ...parsed.data.metadata, userId: request.auth.userId },
        });
        return reply.status(201).send({
          success: true,
          data: { id: customer.id, email: customer.email },
        });
      } catch (err) {
        return asPaymentError(err);
      }
    },
  );

  // POST /payments/refunds — refund a PaymentIntent. → `payments:write`.
  fastify.post(
    '/refunds',
    { preHandler: fastify.requireAuth({ scopes: ['payments:write'] }) },
    async (request, reply) => {
      const parsed = refundSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        throw parsed.error;
      }
      try {
        const refund = await fastify.payments.gateway.refund({
          paymentIntentId: parsed.data.paymentIntentId,
          amount: parsed.data.amount,
          reason: parsed.data.reason,
        });
        return reply.send({
          success: true,
          data: { id: refund.id, status: refund.status, amount: refund.amount },
        });
      } catch (err) {
        return asPaymentError(err);
      }
    },
  );

  // GET /payments/config — non-sensitive integration metadata for the UI
  // (test-mode flag only; NEVER the secret). Read → `payments:read`.
  fastify.get(
    '/config',
    { preHandler: fastify.requireAuth({ scopes: ['payments:read'] }) },
    async (_request, reply) => {
      return reply.send({ success: true, data: { testMode: fastify.payments.testMode } });
    },
  );
}

/** Request shape after the raw-body parser (the body is the exact bytes). */
type RawBodyRequest = FastifyRequest & { body: Buffer };

/**
 * Stripe webhook plugin (Layer 3, raw body). Registered SEPARATELY from the JSON
 * routes so its raw-body content-type parser is encapsulated and does not affect
 * the JSON payment routes.
 *
 * SIGNATURE VERIFICATION (Req 7.6): the handler verifies the `Stripe-Signature`
 * header against the RAW request body using `STRIPE_WEBHOOK_SECRET` (via the
 * gateway's `verifyWebhook`, which calls `stripe.webhooks.constructEvent`). An
 * invalid/absent signature is rejected 400. This local crypto check works in
 * TEST MODE with the placeholder webhook secret (a test signature can be
 * generated with the same secret) — no live key required.
 *
 * PUBLIC_PATHS DECISION (Req 7.3): a live Stripe delivery cannot present a JWT,
 * so a production webhook endpoint must bypass the JWT hook. PUBLIC_PATHS lives
 * in `@quant/server-core`'s `createApp()` and is OUT OF SCOPE for this task, and
 * Req 7.3 requires entries be added only under explicit review. Therefore this
 * task does NOT broaden PUBLIC_PATHS (the SAME decision taken for the quantube
 * payments seam): the webhook stays behind the global auth hook for now, with
 * the Stripe signature as its real authentication control. In a seam/test
 * context the route is exercised by presenting a JWT alongside a validly-signed
 * payload; promoting `/payments/webhook` to PUBLIC_PATHS (or fronting it with an
 * authenticated relay) is a deliberate, reviewed follow-up when live Stripe
 * delivery is enabled.
 */
export async function paymentsWebhookRoutes(fastify: FastifyInstance) {
  // Encapsulated raw-body parser: Stripe signature verification needs the EXACT
  // bytes, which Fastify's default JSON parser discards. Scoped to THIS plugin.
  fastify.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) => {
    done(null, body);
  });

  // POST /payments/webhook — verify + acknowledge a Stripe event.
  fastify.post('/webhook', async (request, reply) => {
    const signature = request.headers['stripe-signature'];
    if (typeof signature !== 'string' || signature.length === 0) {
      throw createAppError('Missing Stripe-Signature header', 400, 'WEBHOOK_SIGNATURE_MISSING');
    }

    const rawBody = (request as RawBodyRequest).body;
    let event;
    try {
      event = fastify.payments.gateway.verifyWebhook(rawBody, signature);
    } catch {
      throw createAppError(
        'Webhook signature verification failed',
        400,
        'WEBHOOK_SIGNATURE_INVALID',
      );
    }

    // Acknowledge the verified event. No money movement / no new persistent
    // schema here (Req 9.5) — downstream handling rides existing engines.
    fastify.log.info({ type: event.type, id: event.id }, 'verified stripe webhook event');
    return reply.send({ success: true, data: { received: true, type: event.type, id: event.id } });
  });
}
