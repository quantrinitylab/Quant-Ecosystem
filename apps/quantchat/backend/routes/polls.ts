import type { FastifyPluginAsync } from 'fastify';
import { createAppError } from '@quant/server-core';
import { z } from 'zod';
import { PollService } from '../services/poll.service';

// QC-F-018 — identity forgery fix.
// Creator/voter identity comes ONLY from the authenticated request context
// (`request.auth`, populated by the server-core auth plugin from the verified
// JWT). Body fields `creatorId` / `userId` are NEVER trusted: previously the
// body won over `(request as any).user?.id` — a field no auth code ever sets —
// so any caller could create polls and cast votes as any other user, and
// calls without auth were attributed to the fabricated identity 'unknown'.
// Missing auth now fails closed with 401, matching games/memories routes.
//
// QC-F-268 — membership/authorization fix + input validation.
// Identity alone was not enough: any logged-in user could create polls in
// conversations they do not belong to (or that do not exist), stuff votes
// on other groups' polls, and read every poll's question + per-option
// voter userIds. PollService now gates create/vote/results on active
// conversation membership (403 NOT_A_MEMBER; a nonexistent conversation
// answers exactly like a non-member — no existence oracle). The schemas
// below bound the bodies before that (pinned order, QC-F-095 style:
// zod 400 → auth 401 → membership 403); unknown body keys are stripped,
// never trusted. Bounds follow house precedents (ids min(1); question
// max 500 like conversation descriptions; option max 100 like names;
// options max 10 as the array cap).
//
// QC-F-335 — poll modes (quiz + anonymous).
// Polls previously had only the plainest form: no quiz (correct answer
// + explanation) and no anonymous voting — and anonymous was
// structurally impossible because every response carried the voter
// roster. Two orthogonal axes now exist (`mode: 'standard' | 'quiz'`,
// `isAnonymous: boolean`). Anonymous is an EXPOSURE contract: identity
// stays in the stored record (vote replace/toggle needs it) but no
// response — results, create or vote — ever exposes another user's id
// on an anonymous poll; quiz answers are revealed only to the creator
// or after voting. All shaping lives in PollService.serializePoll /
// getPollResults; these routes only bound the body and pass through.
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

const createPollSchema = z.object({
  chatId: z.string().min(1),
  question: z.string().trim().min(1).max(500),
  options: z.array(z.string().trim().min(1).max(100)).min(2).max(10),
  allowMultiple: z.boolean().optional(),
  // QC-F-335: poll modes. The schema bounds SHAPE only (enum, index
  // floor, explanation length — 500 follows the question bound); the
  // semantic rules (quiz requires an in-range correctOptionIndex, quiz
  // is single-choice, standard polls reject quiz fields) are enforced
  // by PollService with 400 INVALID_POLL, because direct service
  // consumers never pass through this schema.
  mode: z.enum(['standard', 'quiz']).optional(),
  isAnonymous: z.boolean().optional(),
  correctOptionIndex: z.number().int().min(0).optional(),
  explanation: z.string().trim().max(500).optional(),
});

const voteSchema = z.object({
  // No upper bound here: the valid range depends on the poll's options,
  // which the service already guards with 400 INVALID_OPTION.
  optionIndex: z.number().int().min(0),
});

const pollsRoutes: FastifyPluginAsync = async (fastify) => {
  const pollService = new PollService(fastify.prisma);

  fastify.post('/', async (request, reply) => {
    const parsed = createPollSchema.safeParse(request.body);
    if (!parsed.success) {
      throw createAppError('Invalid request body', 400, 'VALIDATION_ERROR');
    }
    const creatorId = requireUserId(request);
    const poll = await pollService.createPoll(parsed.data.chatId, creatorId, {
      question: parsed.data.question,
      options: parsed.data.options,
      allowMultiple: parsed.data.allowMultiple,
      mode: parsed.data.mode,
      isAnonymous: parsed.data.isAnonymous,
      correctOptionIndex: parsed.data.correctOptionIndex,
      explanation: parsed.data.explanation,
    });
    // QC-F-335: never return the raw record — it carries the full
    // voter roster. serializePoll is the single exposure point.
    return reply
      .status(201)
      .send({ success: true, data: pollService.serializePoll(poll, creatorId) });
  });

  fastify.post('/:pollId/vote', async (request, reply) => {
    const { pollId } = request.params as { pollId: string };
    const parsed = voteSchema.safeParse(request.body);
    if (!parsed.success) {
      throw createAppError('Invalid request body', 400, 'VALIDATION_ERROR');
    }
    const userId = requireUserId(request);
    const poll = await pollService.votePoll(pollId, userId, parsed.data.optionIndex);
    // QC-F-335: same serializer as create — an anonymous poll's vote
    // response must not hand the voter the roster either, and a quiz
    // vote response is where the voter gets their correct/incorrect
    // feedback (the reveal predicate is satisfied by having voted).
    return reply.send({ success: true, data: pollService.serializePoll(poll, userId) });
  });

  fastify.get('/:pollId/results', async (request, reply) => {
    // QC-F-268: the caller's id now reaches the service — results are
    // members-only (they carry every option's voter userIds).
    const userId = requireUserId(request);
    const { pollId } = request.params as { pollId: string };
    const results = await pollService.getPollResults(pollId, userId);
    return reply.send({ success: true, data: results });
  });
};

export default pollsRoutes;
