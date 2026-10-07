// ============================================================================
// QuantChat - Reels Backend Routes (Prisma-backed)
// GET /reels/feed, POST /reels, POST /reels/:id/like,
// POST /reels/:id/comment, POST /reels/:id/share
// ============================================================================
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { ReelService } from '../services/reel.service';

// Reel duration bounds (seconds) - mirrors client-side validation (Req 4.6).
const MIN_REEL_DURATION = 5;
const MAX_REEL_DURATION = 60;

const feedQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(50).default(10),
});

const commentBodySchema = z.object({
  text: z.string().min(1).max(500),
});

const textOverlaySchema = z.object({
  id: z.string(),
  text: z.string().max(200),
  x: z.number(),
  y: z.number(),
  color: z.string(),
});

// POST /reels body - reel creation payload from the uploader.
const createReelBodySchema = z.object({
  videoUrl: z.string().min(1),
  thumbnailUrl: z.string().optional(),
  caption: z.string().max(2000).default(''),
  duration: z.number().min(MIN_REEL_DURATION).max(MAX_REEL_DURATION),
  coverFrameTimestamp: z.number().min(0).default(0),
  textOverlays: z.array(textOverlaySchema).default([]),
});

function getPrisma(fastify: FastifyInstance): PrismaClient {
  return (fastify as unknown as { prisma: PrismaClient }).prisma;
}

function getUserId(request: unknown): string {
  const userId = (request as { auth?: { userId?: string } }).auth?.userId;
  if (!userId) {
    throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return userId;
}

export default async function reelsRoutes(fastify: FastifyInstance) {
  const service = new ReelService(getPrisma(fastify));

  // GET /reels/feed?cursor=&limit= - Returns ranked reels array + nextCursor
  fastify.get('/feed', async (request, reply) => {
    const query = feedQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(400).send({ error: 'Invalid query parameters' });
    }

    const userId = (request as { auth?: { userId?: string } }).auth?.userId;
    const result = await service.getFeed({
      userId,
      cursor: query.data.cursor,
      limit: query.data.limit,
    });

    return reply.send({
      success: true,
      data: {
        reels: result.reels,
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
        totalAvailable: result.totalAvailable,
      },
    });
  });

  // POST /reels/:id/like - Toggle like for the authenticated user
  fastify.post('/:id/like', async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = getUserId(request);
    const result = await service.likeReel(id, userId);
    return reply.send({ success: true, data: result });
  });

  // POST /reels/:id/comment - Adds a comment
  fastify.post('/:id/comment', async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = getUserId(request);
    const body = commentBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: 'Invalid comment body' });
    }
    const comment = await service.commentReel(id, userId, body.data.text);
    return reply.status(201).send({ success: true, data: comment });
  });

  // POST /reels/:id/share - Increments share count
  fastify.post('/:id/share', async (request, reply) => {
    const { id } = request.params as { id: string };
    getUserId(request);
    const result = await service.shareReel(id);
    return reply.send({ success: true, data: result });
  });

  // POST /reels - Create a new reel (Task 4.5). Validates duration (5-60s) and
  // persists the reel owned by the authenticated user.
  fastify.post('/', async (request, reply) => {
    const userId = getUserId(request);
    const body = createReelBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({
        error: 'Invalid reel payload',
        details: body.error.flatten(),
      });
    }

    const { videoUrl, thumbnailUrl, caption, duration } = body.data;
    if (duration < MIN_REEL_DURATION || duration > MAX_REEL_DURATION) {
      return reply.status(400).send({
        error: `Reel duration must be between ${MIN_REEL_DURATION} and ${MAX_REEL_DURATION} seconds`,
      });
    }

    const reel = await service.createReel({
      creatorId: userId,
      videoUrl,
      thumbnailUrl,
      caption,
      duration,
    });

    return reply.status(201).send({ success: true, data: reel });
  });
}
