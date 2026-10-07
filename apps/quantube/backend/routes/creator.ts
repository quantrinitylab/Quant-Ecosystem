import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import {
  MonetizationEngine,
  CreatorDashboardService,
  TierService,
  QuantCreditsService,
  RemixRoyaltyTracker,
  BrandPartnershipService,
} from '@quant/creator-economy';
import type { CreatorTier } from '@quant/creator-economy';

// ============================================================================
// creator-economy seam — decorator service + routes (quantube, Stage 5, 13.1)
// ============================================================================
//
// Req 3.1, 3.2. Wires `@quant/creator-economy` into quantube AS-SHIPPED (no
// rewrite — Req 9.1). Composed once at boot into a decorated singleton
// (`fastify.creatorEconomy`, never per-request).
//
// DEFERRAL NOTE (dependsOn `@quant/payments`): the creator-economy package's
// services construct WITHOUT payments (all in-memory), so this task wires its
// NON-PAYMENT surfaces now — the creator dashboard/overview + earnings analytics
// (`CreatorDashboardService`), monetization-event RECORDING + earnings rollups
// (`MonetizationEngine`, `RemixRoyaltyTracker`), creator tiers/benefits
// (`TierService`), brand partnerships (`BrandPartnershipService`) and the
// platform credits ledger (`QuantCreditsService`). The PAYMENT-dependent surface
// — actual money movement via `PayoutService` (payout request/process/complete,
// which needs the Stripe-backed `@quant/payments` engine) — is intentionally NOT
// surfaced here; those routes come in Task 13.2 alongside the payments wiring.
//
// Persistence is the engines' own in-memory state (no new schema — Req 9.5).
// Routes sit behind the global `onRequest` auth hook (401 unauthenticated);
// mutating routes additionally declare a `creator:write` scope (Req 7.4). The
// `/creator` prefix does NOT collide with any PUBLIC_PATHS entry. Inputs are
// Zod-validated; responses use the `{ success, data }` envelope.

/**
 * The composite creator-economy service decorated onto the instance — the
 * non-payment subset of the engine's as-shipped exports.
 */
export interface CreatorEconomyService {
  monetization: MonetizationEngine;
  dashboard: CreatorDashboardService;
  tiers: TierService;
  credits: QuantCreditsService;
  royalties: RemixRoyaltyTracker;
  partnerships: BrandPartnershipService;
}

// Layer 2 type augmentation.
declare module 'fastify' {
  interface FastifyInstance {
    creatorEconomy: CreatorEconomyService;
  }
}

/**
 * Construct the creator-economy (non-payment) service bundle once at boot.
 * Called from quantube `buildApp()` via `app.decorate('creatorEconomy', ...)`.
 */
export function createCreatorEconomyService(): CreatorEconomyService {
  return {
    monetization: new MonetizationEngine(),
    dashboard: new CreatorDashboardService(),
    tiers: new TierService(),
    credits: new QuantCreditsService(),
    royalties: new RemixRoyaltyTracker(),
    partnerships: new BrandPartnershipService(),
  };
}

const TIER_VALUES = ['free', 'starter', 'pro', 'enterprise'] as const;

const upgradeTierSchema = z.object({
  tier: z.enum(TIER_VALUES),
});

const tipSchema = z.object({
  toCreator: z.string().min(1),
  amount: z.number().positive(),
});

const earnCreditsSchema = z.object({
  amount: z.number().positive(),
  source: z.string().min(1),
});

export default async function creatorRoutes(fastify: FastifyInstance) {
  // --- dashboard / earnings analytics (CreatorDashboardService) -------------

  // GET /creator/dashboard — the caller's creator dashboard overview. Read.
  fastify.get('/dashboard', async (request, reply) => {
    const overview = fastify.creatorEconomy.dashboard.getOverview(request.auth.userId);
    return reply.send({ success: true, data: { overview } });
  });

  // GET /creator/earnings — the caller's earnings breakdown. Read.
  fastify.get('/earnings', async (request, reply) => {
    const breakdown = fastify.creatorEconomy.monetization.getEarnings(request.auth.userId);
    return reply.send({ success: true, data: { breakdown } });
  });

  // --- tiers (TierService) --------------------------------------------------

  // GET /creator/tier — the caller's current tier + benefits. Read.
  fastify.get('/tier', async (request, reply) => {
    const tier = fastify.creatorEconomy.tiers.getTier(request.auth.userId);
    const benefits = fastify.creatorEconomy.tiers.getTierBenefits(tier);
    return reply.send({ success: true, data: { tier, benefits } });
  });

  // POST /creator/tier/upgrade — upgrade the caller's creator tier. Mutating → scoped.
  fastify.post(
    '/tier/upgrade',
    { preHandler: fastify.requireAuth({ scopes: ['creator:write'] }) },
    async (request, reply) => {
      const parsed = upgradeTierSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        throw parsed.error;
      }
      const { tiers } = fastify.creatorEconomy;
      const newTier = parsed.data.tier as CreatorTier;
      try {
        const tier = tiers.upgradeTier(request.auth.userId, newTier);
        return reply.send({ success: true, data: { tier } });
      } catch (err) {
        // upgradeTier rejected the transition. Classify with the engine's
        // as-shipped read predicates so the right client-facing status is
        // returned without modifying TierService or matching on message text.
        const current = tiers.getTier(request.auth.userId);
        const nonUpward = TIER_VALUES.indexOf(newTier) <= TIER_VALUES.indexOf(current);
        const ineligible = !tiers.checkEligibility(request.auth.userId, newTier);
        if (nonUpward || ineligible) {
          throw createAppError((err as Error).message, 403, 'FORBIDDEN');
        }
        throw err; // genuine, unexpected fault → handler maps to 500
      }
    },
  );

  // --- monetization recording (MonetizationEngine) --------------------------

  // POST /creator/monetization/tip — record a tip TO a creator FROM the caller.
  // Non-payment event recording (no money movement). Mutating → scoped.
  fastify.post(
    '/monetization/tip',
    { preHandler: fastify.requireAuth({ scopes: ['creator:write'] }) },
    async (request, reply) => {
      const parsed = tipSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        throw parsed.error;
      }
      const event = fastify.creatorEconomy.monetization.recordTip(
        request.auth.userId,
        parsed.data.toCreator,
        parsed.data.amount,
      );
      return reply.status(201).send({ success: true, data: { event } });
    },
  );

  // --- platform credits ledger (QuantCreditsService) ------------------------

  // GET /creator/credits — the caller's credit balance + history. Read.
  fastify.get('/credits', async (request, reply) => {
    const balance = fastify.creatorEconomy.credits.getBalance(request.auth.userId);
    const transactions = fastify.creatorEconomy.credits.getTransactionHistory(request.auth.userId);
    return reply.send({ success: true, data: { balance, transactions } });
  });

  // POST /creator/credits/earn — credit the caller's ledger. Mutating → scoped.
  fastify.post(
    '/credits/earn',
    { preHandler: fastify.requireAuth({ scopes: ['creator:write'] }) },
    async (request, reply) => {
      const parsed = earnCreditsSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        throw parsed.error;
      }
      const transaction = fastify.creatorEconomy.credits.earnCredits(
        request.auth.userId,
        parsed.data.amount,
        parsed.data.source,
      );
      return reply.status(201).send({ success: true, data: { transaction } });
    },
  );
}
