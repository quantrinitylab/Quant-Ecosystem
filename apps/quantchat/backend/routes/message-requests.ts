import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { MessageRequestService } from '../services/message-request.service';

// ============================================================================
// QuantChat — Message Requests routes (QC-F-321)
// ============================================================================
// First-contact consent surface: POST creates a PENDING request only when
// the target's whoCanMessage gate denies the sender as a stranger
// ('friends' + not a friend); GET inbox/sent expose the true state to
// each side; accept/decline are the RECIPIENT's responses. Identity comes
// ONLY from request.auth — no body/query user id is ever trusted, and
// accept/decline read no body at all.

const createRequestSchema = z.object({
  targetId: z.string().min(1),
  // The route ceiling is deliberately looser than the service cap
  // (MAX_REQUEST_MESSAGE_CHARS = 1000): the service is the single owner
  // of the real limit, and its 400 is what clients see past 1000 chars.
  message: z.string().min(1).max(2000),
});

function requireUserId(request: { auth?: { userId?: string } }): string {
  const userId = request.auth?.userId;
  if (!userId) {
    throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return userId;
}

function serviceFor(fastify: FastifyInstance): MessageRequestService {
  const prisma = (fastify as unknown as { prisma: unknown }).prisma;
  return new MessageRequestService(prisma as never);
}

export default async function messageRequestsRoutes(fastify: FastifyInstance) {
  // POST /message-requests — send a first-contact request
  fastify.post('/', async (request, reply) => {
    const userId = requireUserId(request as { auth?: { userId?: string } });
    const parseResult = createRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }
    const service = serviceFor(fastify);
    const { request: dto, created } = await service.createRequest(
      userId,
      parseResult.data.targetId,
      parseResult.data.message,
    );
    return reply.status(created ? 201 : 200).send({ success: true, data: dto });
  });

  // GET /message-requests/inbox — pending requests addressed to me
  fastify.get('/inbox', async (request, reply) => {
    const userId = requireUserId(request as { auth?: { userId?: string } });
    const service = serviceFor(fastify);
    const inbox = await service.listInbox(userId);
    return reply.send({ success: true, data: inbox });
  });

  // GET /message-requests/sent — requests I have sent, with true state
  fastify.get('/sent', async (request, reply) => {
    const userId = requireUserId(request as { auth?: { userId?: string } });
    const service = serviceFor(fastify);
    const sent = await service.listSent(userId);
    return reply.send({ success: true, data: sent });
  });

  // POST /message-requests/:id/accept — recipient accepts: a real DIRECT
  // conversation is created and the first message delivered into it.
  fastify.post<{ Params: { id: string } }>('/:id/accept', async (request, reply) => {
    const userId = requireUserId(request as { auth?: { userId?: string } });
    const service = serviceFor(fastify);
    const result = await service.accept(request.params.id, userId);
    return reply.send({ success: true, data: result });
  });

  // POST /message-requests/:id/decline — recipient declines (terminal).
  fastify.post<{ Params: { id: string } }>('/:id/decline', async (request, reply) => {
    const userId = requireUserId(request as { auth?: { userId?: string } });
    const service = serviceFor(fastify);
    const result = await service.decline(request.params.id, userId);
    return reply.send({ success: true, data: result });
  });
}
