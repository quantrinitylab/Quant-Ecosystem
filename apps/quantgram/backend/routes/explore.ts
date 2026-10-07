import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ExploreService } from '../services/explore.service';

const searchSchema = z.object({
  q: z.string().optional().default(''),
});

function getService(fastify: FastifyInstance): ExploreService {
  const prisma = (fastify as unknown as { prisma: unknown }).prisma;
  return new ExploreService(prisma as never);
}

export default async function exploreRoutes(fastify: FastifyInstance) {
  fastify.get('/', async (request, reply) => {
    const viewerId = (request as { auth?: { userId?: string } }).auth?.userId ?? '';
    const posts = await getService(fastify).getDiscovery(viewerId);
    return reply.send({ success: true, data: { posts } });
  });

  fastify.get('/search', async (request, reply) => {
    const viewerId = (request as { auth?: { userId?: string } }).auth?.userId ?? '';
    const parsed = searchSchema.safeParse(request.query);
    if (!parsed.success) throw parsed.error;

    const result = await getService(fastify).search(parsed.data.q, viewerId);
    return reply.send({ success: true, data: result });
  });
}
