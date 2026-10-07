import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { QuantAdsCreditsWallet } from '../services/credits-wallet.js';
import { createPublisherWalletPort } from '../services/coin-services.js';
import { PublisherPayoutSchedulerService } from '../services/publisher-payout-scheduler.service.js';

const runSchema = z.object({
  utcDay: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

function requireUserId(request: unknown): string {
  const id = (request as { auth?: { userId?: string } }).auth?.userId;
  if (!id) {
    throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return id;
}

/**
 * QuantAds publisher-payout routes (mounted at /publisher-payout).
 *
 * Closes the ad-revenue loop: the daily payout scheduler (previously never
 * wired at boot) now runs against the durable @quant/credits ledger, crediting
 * each publisher's non-fraud billable ad clicks as a WITHDRAWABLE earn-kind so
 * real ad revenue lands durably and is cash-out eligible. Idempotent per UTC
 * day (PublisherPayoutRun) + per click (paidOut), so a duplicate cron fire
 * never double-pays. Live payout rail (the withdrawal itself) is a separate,
 * needs-staging concern — this endpoint only accrues earnings to the ledger.
 */
export default async function publisherPayoutRoutes(fastify: FastifyInstance) {
  const prisma = (fastify as unknown as { prisma: unknown }).prisma;
  const wallet = new QuantAdsCreditsWallet(prisma);
  const walletPort = createPublisherWalletPort(wallet);

  // POST /publisher-payout/run — run (or resume) the daily payout batch.
  // Intended for an authenticated cron/ops caller.
  fastify.post('/run', async (request, reply) => {
    requireUserId(request);
    const parsed = runSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      throw parsed.error;
    }

    const scheduler = new PublisherPayoutSchedulerService(prisma as never, walletPort);
    const data = await scheduler.runDaily(parsed.data.utcDay);
    return reply.status(201).send({ success: true, data });
  });
}
