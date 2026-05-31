import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { SubscriptionManager, EntitlementService } from '@quant/quant-economy';

const subscribeSchema = z.object({
  userId: z.string().min(1),
  tier: z.enum(['Free', 'Pro', 'ProPlus', 'Family']),
});

const upgradeSchema = z.object({
  userId: z.string().min(1),
  newTier: z.enum(['Free', 'Pro', 'ProPlus', 'Family']),
});

export default async function subscriptionsRoutes(fastify: FastifyInstance) {
  const subscriptionManager = new SubscriptionManager();
  const entitlementService = new EntitlementService(subscriptionManager);

  fastify.post('/subscribe', async (request, reply) => {
    const parseResult = subscribeSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    try {
      const subscription = subscriptionManager.subscribe(
        parseResult.data.userId,
        parseResult.data.tier,
      );
      return reply.status(201).send({ success: true, data: subscription });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Subscribe failed';
      throw createAppError(message, 400, 'SUBSCRIBE_FAILED');
    }
  });

  fastify.post('/upgrade', async (request, reply) => {
    const parseResult = upgradeSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    try {
      const result = subscriptionManager.upgrade(parseResult.data.userId, parseResult.data.newTier);
      if (!result.success) {
        throw createAppError(result.message ?? 'Upgrade failed', 400, 'UPGRADE_FAILED');
      }
      return reply.send({ success: true, data: result.subscription });
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'statusCode' in e) throw e;
      const message = e instanceof Error ? e.message : 'Upgrade failed';
      throw createAppError(message, 400, 'UPGRADE_FAILED');
    }
  });

  fastify.get<{ Params: { userId: string } }>('/current/:userId', async (request, reply) => {
    try {
      const subscription = subscriptionManager.getSubscription(request.params.userId);
      if (!subscription) {
        return reply.send({
          success: true,
          data: { userId: request.params.userId, tier: 'Free', active: false },
        });
      }
      return reply.send({ success: true, data: subscription });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to get subscription';
      throw createAppError(message, 400, 'SUBSCRIPTION_FETCH_FAILED');
    }
  });

  fastify.get<{ Params: { userId: string } }>('/entitlements/:userId', async (request, reply) => {
    try {
      const entitlements = entitlementService.getEntitlements(request.params.userId);
      return reply.send({
        success: true,
        data: { userId: request.params.userId, entitlements },
      });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to get entitlements';
      throw createAppError(message, 400, 'ENTITLEMENTS_FETCH_FAILED');
    }
  });
}
