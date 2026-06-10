import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';

const createEventSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  startTime: z.string(),
  endTime: z.string(),
  location: z.string().optional(),
  attendees: z.array(z.string()).optional(),
});

export default async function eventsRoutes(fastify: FastifyInstance) {
  const prisma = (fastify as any).prisma;

  fastify.post('/', async (request, reply) => {
    const parseResult = createEventSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const event = await prisma.event.create({
      data: {
        ...parseResult.data,
        createdBy: userId,
      },
    });

    return reply.send(event);
  });

  fastify.get('/', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const events = await prisma.event.findMany({
      where: { createdBy: userId },
    });

    return reply.send(events);
  });
}
