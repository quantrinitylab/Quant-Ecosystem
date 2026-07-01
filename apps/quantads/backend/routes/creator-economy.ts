import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { DurableCreatorListingService } from '../services/creator-listing.service.js';

const createListingSchema = z.object({
  creatorId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  price: z.number().int().positive(),
  itemType: z.enum(['virtual_good', 'game_pass']),
});

const payoutSchema = z.object({
  creatorId: z.string().min(1),
  amount: z.number().positive(),
  method: z.string().min(1),
});

/**
 * QuantAds creator-economy routes (mounted at /creator-economy).
 *
 * NON-MONEY BY DESIGN: these endpoints manage listing metadata and read-only
 * earnings/payout requests. No coins are charged or paid here — none of the
 * backing services (CreatorListingService, RevenueSplitEngine,
 * CreatorPayoutService) touch a coin wallet — so there is no residual coin-wallet
 * money-path to move onto the @quant/credits ledger. NOTE: earnings are sourced
 * from RevenueSplitEngine.recordSale, which is not currently wired anywhere, so
 * getCreatorEarnings reads 0 and requestCashOut is a gated record, not a money
 * movement. Real creator payouts would flow through the credits ledger (as the
 * publisher-payout scheduler now does) once sales recording is wired.
 */
export default async function creatorEconomyRoutes(fastify: FastifyInstance) {
  const { revenueSplitEngine, payoutService } = fastify.economy;
  const listingService = new DurableCreatorListingService(
    (fastify as unknown as { prisma: never }).prisma,
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

  fastify.post('/payout', async (request, reply) => {
    const parseResult = payoutSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const { creatorId, amount, method } = parseResult.data;

    try {
      const result = payoutService.requestCashOut(creatorId, amount, method);
      if (!result.success) {
        throw createAppError(result.message ?? 'Payout failed', 400, 'PAYOUT_FAILED');
      }
      return reply.status(201).send({ success: true, data: result.payout });
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'statusCode' in e) throw e;
      const message = e instanceof Error ? e.message : 'Payout request failed';
      throw createAppError(message, 400, 'PAYOUT_FAILED');
    }
  });

  fastify.get<{ Params: { creatorId: string } }>('/earnings/:creatorId', async (request, reply) => {
    try {
      const earnings = revenueSplitEngine.getCreatorEarnings(request.params.creatorId);
      return reply.send({
        success: true,
        data: { creatorId: request.params.creatorId, earnings },
      });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to get earnings';
      throw createAppError(message, 400, 'EARNINGS_FETCH_FAILED');
    }
  });
}
