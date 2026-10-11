import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import {
  CrossAppOrchestrator,
  type AppConnectors,
} from '../services/cross-app-orchestrator.service';
import { HttpAppConnectors } from '../services/http-connectors.service';

const draftReplySchema = z.object({
  emailId: z.string().min(1),
});

const scheduleMeetingSchema = z.object({
  title: z.string().min(1),
  attendees: z.array(z.string().min(1)),
  preferredTime: z.string().min(1),
});

const searchAndSummarizeSchema = z.object({
  query: z.string().min(1),
});

const chatFollowupSchema = z.object({
  conversationId: z.string().min(1),
});

const ORCHESTRATION_APPS = ['mail', 'chat', 'docs', 'calendar', 'drive'];

export default async function orchestrationRoutes(fastify: FastifyInstance) {
  function getUserId(request: FastifyRequest): string {
    const req = request as unknown as { auth?: { userId?: string } };
    if (req.auth?.userId) {
      return req.auth.userId;
    }
    // F-002 fix: fail closed, always. The hardcoded DemoModeConnector dataset
    // (alice/bob/charlie fixtures served as if real) and its unauthenticated
    // 'demo-user' identity have been removed entirely — fake data behind these
    // routes was a trust violation. An unauthenticated request must never get
    // an identity here.
    throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  }

  function bearerToken(request: FastifyRequest): string {
    const header = request.headers['authorization'];
    if (typeof header === 'string' && header.startsWith('Bearer ')) {
      return header.slice('Bearer '.length);
    }
    return '';
  }

  /**
   * Build a per-request orchestrator. It always uses real HTTP connectors that
   * call the sibling app backends with the user's bearer token. When a backend
   * is not configured the connector fails closed (503) — it never fabricates
   * data. (F-002: the hardcoded DemoModeConnector fixtures were deleted; demo
   * fixtures served through this envelope as if real were a trust violation.)
   */
  function buildOrchestrator(request: FastifyRequest, userId: string): CrossAppOrchestrator {
    const connectors: AppConnectors = new HttpAppConnectors({ token: bearerToken(request) });

    // The forwarded bearer token is the real authorization boundary (each app
    // authorizes independently). quantai grants the authenticated user
    // orchestration access to their own cross-app data — never a wildcard grant.
    const permissions: Record<string, string[]> = { [userId]: ORCHESTRATION_APPS };

    return new CrossAppOrchestrator(connectors, permissions);
  }

  function requireUser(request: FastifyRequest): string {
    const userId = getUserId(request);
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }
    return userId;
  }

  // POST /api/v1/orchestrate/summarize-day
  fastify.post('/summarize-day', async (request, reply) => {
    const userId = requireUser(request);
    const orchestrator = buildOrchestrator(request, userId);

    const result = await orchestrator.summarizeDay(userId);
    return reply.send(result);
  });

  // POST /api/v1/orchestrate/draft-reply
  fastify.post('/draft-reply', async (request, reply) => {
    const parseResult = draftReplySchema.safeParse(request.body);
    if (!parseResult.success) {
      throw createAppError('Invalid request body', 400, 'VALIDATION_ERROR');
    }

    const userId = requireUser(request);
    const orchestrator = buildOrchestrator(request, userId);

    const result = await orchestrator.draftReply(userId, parseResult.data.emailId);
    return reply.send(result);
  });

  // POST /api/v1/orchestrate/schedule-meeting
  fastify.post('/schedule-meeting', async (request, reply) => {
    const parseResult = scheduleMeetingSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw createAppError('Invalid request body', 400, 'VALIDATION_ERROR');
    }

    const userId = requireUser(request);
    const orchestrator = buildOrchestrator(request, userId);

    const result = await orchestrator.scheduleMeeting(userId, parseResult.data);
    return reply.send(result);
  });

  // POST /api/v1/orchestrate/search-and-summarize
  fastify.post('/search-and-summarize', async (request, reply) => {
    const parseResult = searchAndSummarizeSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw createAppError('Invalid request body', 400, 'VALIDATION_ERROR');
    }

    const userId = requireUser(request);
    const orchestrator = buildOrchestrator(request, userId);

    const result = await orchestrator.searchAndSummarize(userId, parseResult.data.query);
    return reply.send(result);
  });

  // POST /api/v1/orchestrate/chat-followup
  fastify.post('/chat-followup', async (request, reply) => {
    const parseResult = chatFollowupSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw createAppError('Invalid request body', 400, 'VALIDATION_ERROR');
    }

    const userId = requireUser(request);
    const orchestrator = buildOrchestrator(request, userId);

    const result = await orchestrator.chatFollowup(userId, parseResult.data.conversationId);
    return reply.send(result);
  });
}
