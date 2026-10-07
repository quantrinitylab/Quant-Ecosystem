import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { SquadService } from '../services/squad.service';

const createSchema = z.object({ name: z.string().min(1).max(120) });

function userId(request: unknown): string {
  const id = (request as { auth?: { userId?: string } }).auth?.userId;
  if (!id) throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  return id;
}

/**
 * QuantMax squad routes (mounted at /squads). Durable squad groups + group
 * video rooms (own-token-only LiveKit; fail-closed without config).
 */
export default async function squadRoutes(fastify: FastifyInstance) {
  function service(): SquadService {
    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    return new SquadService(prisma as never);
  }

  fastify.post('/', async (request, reply) => {
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    const data = await service().createSquad(userId(request), parsed.data);
    return reply.status(201).send({ success: true, data });
  });

  fastify.post<{ Params: { id: string } }>('/:id/join', async (request, reply) => {
    const data = await service().join(request.params.id, userId(request));
    return reply.send({ success: true, data });
  });

  fastify.post<{ Params: { id: string } }>('/:id/leave', async (request, reply) => {
    const data = await service().leave(request.params.id, userId(request));
    return reply.send({ success: true, data });
  });

  fastify.post<{ Params: { id: string } }>('/:id/room-token', async (request, reply) => {
    const data = await service().createRoomToken(request.params.id, userId(request));
    return reply.send({ success: true, data });
  });

  fastify.get<{ Params: { id: string } }>('/:id/members/count', async (request, reply) => {
    userId(request);
    const count = await service().memberCount(request.params.id);
    return reply.send({ success: true, data: { count } });
  });
}
