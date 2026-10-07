import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { PayoutService } from '@quant/creator-economy';
import { PayoutMethodSchema } from '@quant/creator-economy';
import type { PayoutMethod } from '@quant/creator-economy';

// ============================================================================
// creator-economy PAYOUT seam — money-movement routes (quantube, Task 13.2)
// ============================================================================
//
// Req 3.1, 7.4. Surfaces the creator-economy `PayoutService` money-movement
// routes that were DEFERRED in Task 13.1. Per the inventory, `creator-economy`
// `dependsOn` `@quant/payments`; 13.1 wired only the NON-payment creator
// surfaces and explicitly held back the payout request/process/complete flow
// until the Stripe-backed `@quant/payments` engine was wired. Task 13.2 wires
// payments (see `routes/payments.ts`), so the payout money rails are surfaced
// here, alongside the now-decorated `fastify.payments` gateway that backs real
// money movement.
//
// `PayoutService` is wired AS-SHIPPED (no rewrite — Req 9.1); its persistence is
// the engine's own in-memory ledger (no new schema — Req 9.5). It is decorated
// once at boot into a singleton (`fastify.payouts`, never per-request).
//
// AUTH (Req 7.4): payouts move money and are therefore sensitive — every
// mutating route declares `payments:write` via `requireAuth({ scopes })`; reads
// sit behind the global `onRequest` auth hook (401 unauthenticated). The
// `/payouts` prefix does NOT collide with any server-core PUBLIC_PATHS entry.

// Layer 2 type augmentation: expose the decorated payout engine on the instance.
declare module 'fastify' {
  interface FastifyInstance {
    payouts: PayoutService;
  }
}

/**
 * Construct the creator-economy PayoutService once at boot (decorated
 * singleton). Called from quantube's `buildApp()` via `app.decorate('payouts', …)`.
 */
export function createPayoutService(): PayoutService {
  return new PayoutService();
}

const requestPayoutSchema = z.object({
  amount: z.number().positive(),
  method: PayoutMethodSchema,
});

const payoutIdSchema = z.object({ id: z.string().min(1) });

/** Map PayoutService domain errors to clean envelopes (not bare 500s). */
function asPayoutError(err: unknown): never {
  const message = err instanceof Error ? err.message : 'Payout error';
  if (/not found/i.test(message)) {
    throw createAppError(message, 404, 'PAYOUT_NOT_FOUND');
  }
  if (/insufficient balance/i.test(message)) {
    throw createAppError(message, 400, 'INSUFFICIENT_BALANCE');
  }
  throw createAppError(message, 400, 'PAYOUT_ERROR');
}

export default async function payoutRoutes(fastify: FastifyInstance) {
  // GET /payouts — the caller's payout history. Read; global auth.
  fastify.get('/', async (request, reply) => {
    const history = fastify.payouts.getPayoutHistory(request.auth.userId);
    return reply.send({ success: true, data: { payouts: history } });
  });

  // GET /payouts/balance — the caller's available (withdrawable) balance. Read.
  // Static path beats the `/:id` param route in Fastify, so no collision.
  fastify.get('/balance', async (request, reply) => {
    const available = fastify.payouts.calculateAvailableBalance(request.auth.userId);
    return reply.send({ success: true, data: { available } });
  });

  // POST /payouts/request — request a payout (money movement). → payments:write.
  fastify.post(
    '/request',
    { preHandler: fastify.requireAuth({ scopes: ['payments:write'] }) },
    async (request, reply) => {
      const parsed = requestPayoutSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        throw parsed.error;
      }
      try {
        const payout = fastify.payouts.requestPayout(
          request.auth.userId,
          parsed.data.amount,
          parsed.data.method as PayoutMethod,
        );
        return reply.status(201).send({ success: true, data: { payout } });
      } catch (err) {
        return asPayoutError(err);
      }
    },
  );

  // POST /payouts/:id/process — move a payout into processing. → payments:write.
  fastify.post(
    '/:id/process',
    { preHandler: fastify.requireAuth({ scopes: ['payments:write'] }) },
    async (request, reply) => {
      const parsed = payoutIdSchema.safeParse(request.params);
      if (!parsed.success) {
        throw parsed.error;
      }
      try {
        const payout = fastify.payouts.processPayout(parsed.data.id);
        return reply.send({ success: true, data: { payout } });
      } catch (err) {
        return asPayoutError(err);
      }
    },
  );

  // POST /payouts/:id/complete — settle a payout as completed. → payments:write.
  fastify.post(
    '/:id/complete',
    { preHandler: fastify.requireAuth({ scopes: ['payments:write'] }) },
    async (request, reply) => {
      const parsed = payoutIdSchema.safeParse(request.params);
      if (!parsed.success) {
        throw parsed.error;
      }
      try {
        const payout = fastify.payouts.completePayout(parsed.data.id);
        return reply.send({ success: true, data: { payout } });
      } catch (err) {
        return asPayoutError(err);
      }
    },
  );

  // GET /payouts/:id — a single payout's status. Read; global auth.
  fastify.get('/:id', async (request, reply) => {
    const parsed = payoutIdSchema.safeParse(request.params);
    if (!parsed.success) {
      throw parsed.error;
    }
    try {
      const status = fastify.payouts.getPayoutStatus(parsed.data.id);
      return reply.send({ success: true, data: { id: parsed.data.id, status } });
    } catch (err) {
      return asPayoutError(err);
    }
  });
}
