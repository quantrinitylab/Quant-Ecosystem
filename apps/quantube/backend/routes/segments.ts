import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { SegmentService, SEGMENT_KINDS, type SegmentKind } from '../services/segment.service';

const kindEnum = z.enum(SEGMENT_KINDS as unknown as [SegmentKind, ...SegmentKind[]]);

const setSegmentsSchema = z.object({
  segments: z
    .array(
      z.object({
        kind: kindEnum,
        startSec: z.number().min(0),
        endSec: z.number().positive(),
        label: z.string().max(120).optional(),
        source: z.enum(['ai', 'creator', 'community']).optional(),
      }),
    )
    .max(500),
});

function service(fastify: FastifyInstance): SegmentService {
  const prisma = (fastify as unknown as { prisma: unknown }).prisma;
  return new SegmentService(prisma as never);
}

export default async function segmentsRoutes(fastify: FastifyInstance) {
  // List a video's segments.
  fastify.get<{ Params: { id: string } }>('/videos/:id/segments', async (request, reply) => {
    const segments = await service(fastify).listSegments(request.params.id);
    return reply.send({ success: true, data: segments });
  });

  // Replace a video's segments (AI pipeline / creator).
  fastify.put<{ Params: { id: string } }>('/videos/:id/segments', async (request, reply) => {
    const parsed = setSegmentsSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    const segments = await service(fastify).setSegments(request.params.id, parsed.data.segments);
    return reply.send({ success: true, data: segments });
  });

  // Compute the skip-plan (play only the useful parts).
  fastify.get<{ Params: { id: string } }>('/videos/:id/skip-plan', async (request, reply) => {
    const q = request.query as { duration?: string; skip?: string };
    const durationSec = Number(q.duration);
    if (!Number.isFinite(durationSec) || durationSec <= 0) {
      throw createAppError('duration query param (seconds) is required', 400, 'INVALID_DURATION');
    }
    const skipKinds = q.skip
      ? (q.skip
          .split(',')
          .map((s) => s.trim())
          .filter((s) => (SEGMENT_KINDS as readonly string[]).includes(s)) as SegmentKind[])
      : undefined;

    const plan = await service(fastify).getSkipPlan(request.params.id, {
      durationSec,
      ...(skipKinds ? { skipKinds } : {}),
    });
    return reply.send({ success: true, data: plan });
  });

  // "Teach me X" — resolve topic-matching segments as jump targets.
  fastify.get<{ Params: { id: string } }>('/videos/:id/teach', async (request, reply) => {
    const q = request.query as { q?: string; limit?: string };
    const query = (q.q ?? '').trim();
    if (!query) {
      throw createAppError('q (topic query) is required', 400, 'EMPTY_QUERY');
    }
    const limit = q.limit ? Number(q.limit) : undefined;
    const jumps = await service(fastify).findTopicJumps(request.params.id, query, {
      ...(limit && Number.isFinite(limit) ? { limit } : {}),
    });
    return reply.send({ success: true, data: jumps });
  });
}
