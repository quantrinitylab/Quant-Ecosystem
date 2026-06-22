import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import {
  AnonymousPostService,
  AnonymousModerationError,
  DefaultAnonymousModerator,
} from '../services/anonymous-post.service';

// ============================================================================
// QuantSync Anonymous section routes (mounted at /anonymous).
//
//   POST /anonymous/posts  { content, replyToId? }  -> public anon post (no userId)
//   GET  /anonymous/feed   ?page&pageSize           -> anon feed (aliases only)
//
// Authenticated (the server knows who posted, for abuse handling) but the
// response NEVER leaks the author. Identity hiding + fail-closed moderation +
// pseudonymous aliasing live in AnonymousPostService.
// ============================================================================

const createSchema = z.object({
  content: z.string().min(1).max(50000),
  replyToId: z.string().optional(),
});

const feedQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

function aliasSecret(): string {
  return process.env['ANON_ALIAS_SECRET'] ?? process.env['JWT_SECRET'] ?? 'dev-anon-alias-secret';
}

export default async function anonymousRoutes(fastify: FastifyInstance) {
  const buildService = () => {
    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    return new AnonymousPostService(prisma as never, {
      aliasSecret: aliasSecret(),
      moderator: new DefaultAnonymousModerator(),
    });
  };

  fastify.post('/posts', async (request, reply) => {
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) {
      throw parsed.error;
    }
    const userId = (request as unknown as { auth?: { userId?: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    try {
      const post = await buildService().createAnonymousPost({ userId, ...parsed.data });
      return reply.status(201).send({ success: true, data: post });
    } catch (err) {
      if (err instanceof AnonymousModerationError) {
        throw createAppError(err.message, 422, 'MODERATION_REJECTED');
      }
      throw err;
    }
  });

  fastify.get('/feed', async (request, reply) => {
    const parsed = feedQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw parsed.error;
    }
    const result = await buildService().listAnonymousFeed(parsed.data);
    return reply.send({ success: true, data: result });
  });
}
