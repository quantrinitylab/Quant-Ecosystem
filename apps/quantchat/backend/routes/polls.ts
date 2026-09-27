import type { FastifyPluginAsync } from 'fastify';
import { PollService } from '../services/poll.service';

const pollsRoutes: FastifyPluginAsync = async (fastify) => {
  const pollService = new PollService(fastify.prisma);

  fastify.post('/', async (request, reply) => {
    const body = request.body as {
      chatId: string;
      creatorId?: string;
      question: string;
      options: string[];
      allowMultiple?: boolean;
    };
    const creatorId = body.creatorId || (request as any).user?.id || 'unknown';
    const poll = await pollService.createPoll(body.chatId, creatorId, {
      question: body.question,
      options: body.options,
      allowMultiple: body.allowMultiple,
    });
    return reply.status(201).send({ success: true, data: poll });
  });

  fastify.post('/:pollId/vote', async (request, reply) => {
    const { pollId } = request.params as { pollId: string };
    const body = request.body as { userId?: string; optionIndex: number };
    const userId = body.userId || (request as any).user?.id || 'unknown';
    const poll = await pollService.votePoll(pollId, userId, body.optionIndex);
    return reply.send({ success: true, data: poll });
  });

  fastify.get('/:pollId/results', async (request, reply) => {
    const { pollId } = request.params as { pollId: string };
    const results = await pollService.getPollResults(pollId);
    return reply.send({ success: true, data: results });
  });
};

export default pollsRoutes;
