import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { VideoService } from '../services/video.service';

// ============================================================================
// QuantTube search routes (mounted at /search).
//
//   GET /search?q=<query>&page=&pageSize=  -> public videos matching the query
//
// Matches the query against video title OR description (case-insensitive) over
// PUBLIC, non-deleted videos, ranked by view count. An empty/blank query
// returns an empty page rather than every video.
// ============================================================================

const searchSchema = z.object({
  q: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

export default async function searchRoutes(fastify: FastifyInstance) {
  fastify.get('/', async (request, reply) => {
    const parsed = searchSchema.safeParse(request.query);
    if (!parsed.success) {
      throw parsed.error;
    }

    const { q, page, pageSize } = parsed.data;
    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new VideoService(prisma as never);
    const result = await service.search(q ?? '', { page, pageSize });

    return reply.send({ success: true, data: result });
  });
}
