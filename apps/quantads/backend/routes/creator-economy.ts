import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { CreditWallet, PayoutService } from '@quant/credits';
import { DurableCreatorListingService } from '../services/creator-listing.service.js';
import {
  CreatorMarketplaceService,
  NullPayoutRail,
} from '../services/creator-marketplace.service.js';

const createListingSchema = z.object({
  creatorId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  price: z.number().int().positive(),
  itemType: z.enum(['virtual_good', 'game_pass']),
});

const purchaseSchema = z.object({
  buyerId: z.string().min(1),
  listingId: z.string().min(1),
  // A stable idempotency key from the client; one is generated if omitted.
  purchaseRef: z.string().min(1).max(200).optional(),
});

const payoutSchema = z.object({
  creatorId: z.string().min(1),
  amount: z.number().int().positive(),
  method: z.enum(['upi', 'crypto', 'bank']),
  destination: z.string().min(1).max(200).optional(),
});

/**
 * QuantAds creator-economy routes (mounted at /creator-economy).
 *
 * Creator listings are durable (Prisma), and a PURCHASE settles atomically on
 * the @quant/credits MarketplaceLedger: buyer debit + seller withdrawable
 * `marketplace_sale` earn + platform commission. Creator earnings are therefore
 * REAL, ledger-visible EARNED credits (getEarnedTotal), and withdrawals go
 * through the durable PayoutService (no-overdraw, daily limit, compliance hold).
 * The actual payout RAIL (UPI/crypto/bank disbursement) is a needs-staging port
 * — until one is configured, withdrawals fail closed (503) rather than fake a
 * completed payout.
 */
export default async function creatorEconomyRoutes(fastify: FastifyInstance) {
  const prisma = (fastify as unknown as { prisma: unknown }).prisma;
  const listingService = new DurableCreatorListingService(prisma as never);
  const marketplace = new CreatorMarketplaceService(prisma);
  const payouts = new PayoutService(
    prisma as never,
    new CreditWallet(prisma as never),
    new NullPayoutRail(),
  );

  fastify.post('/listing', async (request, reply) => {
    const parseResult = createListingSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const { creatorId, name, description, price, itemType } = parseResult.data;

    try {
      const listing = await listingService.createListing(
        creatorId,
        name,
        description,
        itemType,
        price,
      );
      return reply.status(201).send({ success: true, data: listing });
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'statusCode' in e) throw e;
      const message = e instanceof Error ? e.message : 'Failed to create listing';
      throw createAppError(message, 400, 'LISTING_CREATE_FAILED');
    }
  });

  fastify.get<{ Params: { creatorId: string } }>('/listings/:creatorId', async (request, reply) => {
    try {
      const listings = await listingService.getCreatorListings(request.params.creatorId);
      return reply.send({ success: true, data: listings });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to get listings';
      throw createAppError(message, 400, 'LISTINGS_FETCH_FAILED');
    }
  });

  fastify.get('/marketplace', async (_request, reply) => {
    try {
      const listings = await listingService.getMarketplaceListings();
      return reply.send({ success: true, data: listings });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to get marketplace';
      throw createAppError(message, 400, 'MARKETPLACE_FETCH_FAILED');
    }
  });

  // Buy a creator listing — atomic ledger settlement (buyer -> seller + commission).
  fastify.post('/purchase', async (request, reply) => {
    const parseResult = purchaseSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }
    const { buyerId, listingId, purchaseRef } = parseResult.data;
    try {
      const result = await marketplace.purchase(buyerId, listingId, purchaseRef ?? randomUUID());
      return reply.status(201).send({ success: true, data: result });
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'statusCode' in e) throw e;
      const message = e instanceof Error ? e.message : 'Purchase failed';
      throw createAppError(message, 400, 'PURCHASE_FAILED');
    }
  });

  fastify.post('/payout', async (request, reply) => {
    const parseResult = payoutSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const { creatorId, amount, method, destination } = parseResult.data;

    try {
      const payout = await payouts.requestWithdrawal(
        { principalId: creatorId },
        { ownerId: creatorId, ownerType: 'user' },
        { amountCredits: amount, method, ...(destination ? { destination } : {}) },
      );
      return reply.status(201).send({ success: true, data: payout });
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'statusCode' in e) throw e;
      const message = e instanceof Error ? e.message : 'Payout request failed';
      throw createAppError(message, 400, 'PAYOUT_FAILED');
    }
  });

  fastify.get<{ Params: { creatorId: string } }>('/earnings/:creatorId', async (request, reply) => {
    try {
      const earnings = await marketplace.getCreatorEarnings(request.params.creatorId);
      const withdrawable = await payouts.getWithdrawable(
        { principalId: request.params.creatorId },
        { ownerId: request.params.creatorId, ownerType: 'user' },
      );
      return reply.send({
        success: true,
        data: { creatorId: request.params.creatorId, earnings, withdrawable },
      });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to get earnings';
      throw createAppError(message, 400, 'EARNINGS_FETCH_FAILED');
    }
  });

  // "My purchases" — the buyer's durable ownership records, newest first.
  fastify.get<{ Params: { buyerId: string } }>('/purchases/:buyerId', async (request, reply) => {
    try {
      const purchases = await marketplace.getPurchases(request.params.buyerId);
      return reply.send({ success: true, data: purchases });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to get purchases';
      throw createAppError(message, 400, 'PURCHASES_FETCH_FAILED');
    }
  });

  // Access gate — has this buyer purchased this listing? (delivery/access check)
  fastify.get<{ Params: { buyerId: string; listingId: string } }>(
    '/purchases/:buyerId/:listingId',
    async (request, reply) => {
      try {
        const owned = await marketplace.hasPurchased(
          request.params.buyerId,
          request.params.listingId,
        );
        return reply.send({
          success: true,
          data: { buyerId: request.params.buyerId, listingId: request.params.listingId, owned },
        });
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Failed to check access';
        throw createAppError(message, 400, 'ACCESS_CHECK_FAILED');
      }
    },
  );
}
