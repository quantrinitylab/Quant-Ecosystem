import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import {
  CoinWallet,
  VirtualGoodsCatalog,
  CrossAppInventory,
  GiftingService,
  TippingService,
} from '@quant/quant-economy';

const giftSchema = z.object({
  fromUserId: z.string().min(1),
  toUserId: z.string().min(1),
  itemId: z.string().min(1),
});

const tipSchema = z.object({
  fromUserId: z.string().min(1),
  toUserId: z.string().min(1),
  amount: z.number().positive(),
});

export default async function giftingRoutes(fastify: FastifyInstance) {
  const wallet = new CoinWallet();
  const catalog = new VirtualGoodsCatalog();
  const inventory = new CrossAppInventory();
  const giftingService = new GiftingService(wallet, catalog, inventory);
  const tippingService = new TippingService(wallet);

  fastify.post('/gift', async (request, reply) => {
    const parseResult = giftSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const { fromUserId, toUserId, itemId } = parseResult.data;

    try {
      const result = giftingService.sendGift(fromUserId, toUserId, itemId);
      if (!result.success) {
        throw createAppError(result.message ?? 'Gift failed', 400, 'GIFT_FAILED');
      }
      return reply.status(201).send({ success: true, data: result.gift });
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'statusCode' in e) throw e;
      const message = e instanceof Error ? e.message : 'Gift sending failed';
      throw createAppError(message, 400, 'GIFT_FAILED');
    }
  });

  fastify.post('/tip', async (request, reply) => {
    const parseResult = tipSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const { fromUserId, toUserId, amount } = parseResult.data;

    try {
      const result = tippingService.sendTip(fromUserId, toUserId, amount);
      if (!result.success) {
        throw createAppError(result.message ?? 'Tip failed', 400, 'TIP_FAILED');
      }
      return reply.status(201).send({ success: true, data: result.tip });
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'statusCode' in e) throw e;
      const message = e instanceof Error ? e.message : 'Tip sending failed';
      throw createAppError(message, 400, 'TIP_FAILED');
    }
  });

  fastify.get<{ Params: { userId: string } }>('/received/:userId', async (request, reply) => {
    try {
      const gifts = giftingService.getReceivedGifts(request.params.userId);
      return reply.send({ success: true, data: gifts });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to get received gifts';
      throw createAppError(message, 400, 'GIFTS_FETCH_FAILED');
    }
  });

  fastify.get<{ Params: { userId: string } }>('/tips/:userId', async (request, reply) => {
    try {
      const tips = tippingService.getTipsReceived(request.params.userId);
      return reply.send({ success: true, data: tips });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to get tips';
      throw createAppError(message, 400, 'TIPS_FETCH_FAILED');
    }
  });
}
