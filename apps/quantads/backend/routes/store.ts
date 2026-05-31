import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import {
  CoinWallet,
  VirtualGoodsCatalog,
  CrossAppInventory,
  StorePurchaseService,
} from '@quant/quant-economy';

const purchaseSchema = z.object({
  userId: z.string().min(1),
  itemId: z.string().min(1),
});

const catalogQuerySchema = z.object({
  category: z
    .enum(['avatar_item', 'outfit', 'skin', 'chat_theme', 'sticker_pack', 'gift_item'])
    .optional(),
});

export default async function storeRoutes(fastify: FastifyInstance) {
  const wallet = new CoinWallet();
  const catalog = new VirtualGoodsCatalog();
  const inventory = new CrossAppInventory();
  const purchaseService = new StorePurchaseService(wallet, catalog, inventory);

  fastify.get('/catalog', async (request, reply) => {
    const queryResult = catalogQuerySchema.safeParse(request.query);
    if (!queryResult.success) {
      throw queryResult.error;
    }

    const { category } = queryResult.data;
    const items = category ? catalog.listByCategory(category) : catalog.getAllItems();
    return reply.send({ success: true, data: items });
  });

  fastify.post('/purchase', async (request, reply) => {
    const parseResult = purchaseSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    try {
      const result = purchaseService.purchaseItem(parseResult.data.userId, parseResult.data.itemId);
      if (!result.success) {
        throw createAppError(result.message, 400, 'PURCHASE_FAILED');
      }
      return reply.status(201).send({ success: true, data: result });
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'statusCode' in e) throw e;
      const message = e instanceof Error ? e.message : 'Purchase failed';
      throw createAppError(message, 400, 'PURCHASE_FAILED');
    }
  });

  fastify.get<{ Params: { userId: string } }>('/inventory/:userId', async (request, reply) => {
    try {
      const items = inventory.getUserItems(request.params.userId);
      return reply.send({ success: true, data: { userId: request.params.userId, items } });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to get inventory';
      throw createAppError(message, 400, 'INVENTORY_FETCH_FAILED');
    }
  });
}
