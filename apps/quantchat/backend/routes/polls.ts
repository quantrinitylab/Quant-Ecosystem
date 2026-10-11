import type { FastifyPluginAsync } from 'fastify';
import { createAppError } from '@quant/server-core';
import { PollService } from '../services/poll.service';

// QC-F-018 — identity forgery fix.
// Creator/voter identity comes ONLY from the authenticated request context
// (`request.auth`, populated by the server-core auth plugin from the verified
// JWT). Body fields `creatorId` / `userId` are NEVER trusted: previously the
// body won over `(request as any).user?.id` — a field no auth code ever sets —
// so any caller could create polls and cast votes as any other user, and
// calls without auth were attributed to the fabricated identity 'unknown'.
// Missing auth now fails closed with 401, matching games/memories routes.
interface AuthedRequest {
  auth?: { userId?: string };
  user?: { id?: string };
}

function requireUserId(request: unknown): string {
  const r = request as AuthedRequest;
  const userId = r.auth?.userId ?? r.user?.id;
  if (!userId) {
    throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return userId;
}

const pollsRoutes: FastifyPluginAsync = async (fastify) => {
  const pollService = new PollService(fastify.prisma);

  fastify.post('/', async (request, reply) => {
    const body = request.body as {
      chatId: string;
      question: string;
      options: string[];
      allowMultiple?: boolean;
    };
    const creatorId = requireUserId(request);
    const poll = await pollService.createPoll(body.chatId, creatorId, {
      question: body.question,
      options: body.options,
      allowMultiple: body.allowMultiple,
    });
    return reply.status(201).send({ success: true, data: poll });
  });

  fastify.post('/:pollId/vote', async (request, reply) => {
    const { pollId } = request.params as { pollId: string };
    const body = request.body as { optionIndex: number };
    const userId = requireUserId(request);
    const poll = await pollService.votePoll(pollId, userId, body.optionIndex);
    return reply.send({ success: true, data: poll });
  });

  fastify.get('/:pollId/results', async (request, reply) => {
    requireUserId(request);
    const { pollId } = request.params as { pollId: string };
    const results = await pollService.getPollResults(pollId);
    return reply.send({ success: true, data: results });
  });
};

export default pollsRoutes;
