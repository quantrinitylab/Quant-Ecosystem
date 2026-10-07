import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { VacationResponderService } from '../services/vacation-responder.service';

const upsertResponderSchema = z.object({
  enabled: z.boolean().optional(),
  subject: z.string().min(1).max(500),
  message: z.string().min(1).max(20000),
  startAt: z.coerce.date().nullable().optional(),
  endAt: z.coerce.date().nullable().optional(),
  onlyContacts: z.boolean().optional(),
  intervalDays: z.coerce.number().int().min(0).optional(),
});

export default async function vacationResponderRoutes(fastify: FastifyInstance) {
  // GET /vacation-responder
  fastify.get('/', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new VacationResponderService(prisma as never);
    const responder = await service.getResponder(userId);

    return reply.send({ success: true, data: responder });
  });

  // PUT /vacation-responder
  fastify.put('/', async (request, reply) => {
    const parseResult = upsertResponderSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new VacationResponderService(prisma as never);
    const responder = await service.upsertResponder(userId, parseResult.data);

    return reply.send({ success: true, data: responder });
  });

  // POST /vacation-responder/enable
  fastify.post('/enable', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new VacationResponderService(prisma as never);
    const responder = await service.setEnabled(userId, true);

    return reply.send({ success: true, data: responder });
  });

  // POST /vacation-responder/disable
  fastify.post('/disable', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new VacationResponderService(prisma as never);
    const responder = await service.setEnabled(userId, false);

    return reply.send({ success: true, data: responder });
  });
}
