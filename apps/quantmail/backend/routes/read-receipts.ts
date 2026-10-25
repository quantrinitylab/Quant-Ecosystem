import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import {
  readUserReadReceiptsEnabled,
  writeUserReadReceiptsEnabled,
} from '../services/read-receipts-preference.service';

// ---------------------------------------------------------------------------
// Read receipts preference (fix/qm-read-receipts).
//
// GET /read-receipts — the caller's default for open tracking: true means
// new mail is composed with the invisible open beacon (the pre-existing
// behaviour), false means new mail sends without it. This is the DEFAULT
// only: a per-message compose toggle still overrides it for that message,
// and a compose request that omits `trackOpens` falls back to this value
// (routes/emails.ts) instead of a hardcoded true.
//
// PUT /read-receipts — change the caller's default. The value merges into
// User.preferences JSON, so unrelated stored keys survive.
// ---------------------------------------------------------------------------

const readReceiptsBodySchema = z.object({ enabled: z.boolean() });

function userIdFrom(request: unknown): string {
  const userId = (request as { auth?: { userId?: string } }).auth?.userId;
  if (!userId) throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  return userId;
}

export default async function readReceiptsRoutes(fastify: FastifyInstance) {
  fastify.get('/', async (request, reply) => {
    const userId = userIdFrom(request);
    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const enabled = await readUserReadReceiptsEnabled(prisma as never, userId, {
      warn: (obj, msg) => fastify.log.warn(obj as object, msg),
    });
    return reply.send({ success: true, data: { enabled } });
  });

  fastify.put('/', async (request, reply) => {
    const userId = userIdFrom(request);
    const parsed = readReceiptsBodySchema.safeParse(request.body);
    if (!parsed.success) {
      throw createAppError('Invalid read receipts preference', 400, 'VALIDATION_ERROR');
    }
    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const enabled = await writeUserReadReceiptsEnabled(prisma as never, userId, parsed.data.enabled);
    return reply.send({ success: true, data: { enabled } });
  });
}
