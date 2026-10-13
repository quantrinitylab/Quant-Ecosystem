import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PrekeyService } from '../services/prekey.service';
import { createAppError } from '@quant/server-core';

const publishSchema = z.object({
  identityKey: z.string().min(1),
  signedPrekey: z.object({
    key: z.string().min(1),
    signature: z.string().min(1),
  }),
  // Cap matches the durable store's batch limit (MAX_ONE_TIME_PREKEY_BATCH);
  // without it the schema promised batches the store would reject wholesale.
  oneTimePrekeys: z.array(z.string().min(1)).min(1).max(100),
});

const userParamsSchema = z.object({
  userId: z.string().min(1),
});

export default async function prekeysRoutes(fastify: FastifyInstance) {
  // QC-F-081 claim signals: structured logs only — ids/counts, never key
  // material. Before this, the claim path logged nothing at all, so a pool
  // drain was invisible to operators as well as to the victim.
  const service = new PrekeyService(fastify.prisma, undefined, {
    onClaimThrottled: ({ targetUserId, requesterId, reason }) =>
      fastify.log.warn(
        { event: 'prekey_claim_throttled', targetUserId, requesterId, reason },
        'one-time prekey claim refused by QC-F-081 quota gate; no key consumed',
      ),
    onPoolLow: ({ targetUserId, remaining }) =>
      fastify.log.warn(
        { event: 'prekey_pool_low', targetUserId, remaining },
        'one-time prekey pool low; owner client should replenish',
      ),
  });

  // POST /prekeys - Registers caller's public prekey bundle
  fastify.post('/prekeys', async (request, reply) => {
    const userId = request.auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const parseResult = publishSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    await service.publishPrekeyBundle(userId, parseResult.data);

    return reply.status(201).send({
      success: true,
      data: { message: 'Prekey bundle published successfully' },
    });
  });

  // GET /prekeys/:userId - Retrieves bundle for initiating encrypted conversation
  fastify.get<{ Params: { userId: string } }>('/prekeys/:userId', async (request, reply) => {
    const userId = request.auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const parseResult = userParamsSchema.safeParse(request.params);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    // QC-F-081: the requester id is the claim's identity — the quota gate and
    // the claim ledger both key off it. It was previously discarded here,
    // which is what made claims anonymous and unlimited.
    const bundle = await service.fetchPrekeyBundle(parseResult.data.userId, userId);

    return reply.send({
      success: true,
      data: bundle,
    });
  });
}
