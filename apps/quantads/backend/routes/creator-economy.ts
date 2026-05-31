import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import {
  CreatorListingService,
  RevenueSplitEngine,
  CreatorPayoutService,
} from '@quant/quant-economy';

const createListingSchema = z.object({
  creatorId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  price: z.number().positive(),
  itemType: z.enum(['virtual_good', 'game_pass']),
});

const payoutSchema = z.object({
  creatorId: z.string().min(1),
  amount: z.number().positive(),
  method: z.string().min(1),
});

export default async function creatorEconomyRoutes(fastify: FastifyInstance) {
  const listingService = new CreatorListingService();
  const revenueSplitEngine = new RevenueSplitEngine();
  const payoutService = new CreatorPayoutService(revenueSplitEngine);

  fastify.post('/listing', async (request, reply) => {
    const parseResult = createListingSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const { creatorId, name, description, price, itemType } = parseResult.data;

    try {
      const listing = listingService.createListing(creatorId, name, description, itemType, price);
      return reply.status(201).send({ success: true, data: listing });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to create listing';
      throw createAppError(message, 400, 'LISTING_CREATE_FAILED');
    }
  });

  fastify.get<{ Params: { creatorId: string } }>('/listings/:creatorId', async (request, reply) => {
    try {
      const listings = listingService.getCreatorListings(request.params.creatorId);
      return reply.send({ success: true, data: listings });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to get listings';
      throw createAppError(message, 400, 'LISTINGS_FETCH_FAILED');
    }
  });

  fastify.get('/marketplace', async (_request, reply) => {
    try {
      const listings = listingService.getMarketplaceListings();
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
