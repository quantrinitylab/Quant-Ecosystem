import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { orchestrator } from '@quant/agentic';
import {
  createUserModelPreferenceService,
  DEFAULT_USER_MODEL,
} from '../services/user-model-preference.service';

const sendMessageSchema = z.object({
  content: z.string().min(1).max(100000),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  useAgent: z.boolean().optional(),
  agentId: z.string().optional(),
});

function requireUserId(request: unknown): string {
  const userId = (request as { auth?: { userId?: string } }).auth?.userId;
  if (!userId) {
    throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return userId;
}

interface SessionLookupClient {
  aISession: {
    findUnique(args: { where: { id: string } }): Promise<{
      id: string;
      userId: string;
    } | null>;
  };
}

/**
 * The `:id` param used to be ignored entirely, so any authenticated user
 * could run inference "inside" an arbitrary session id. Verify the session
 * exists and belongs to the caller before any inference runs (F-107).
 */
async function requireOwnedSession(
  prisma: unknown,
  sessionId: string,
  userId: string,
): Promise<void> {
  const client = prisma as SessionLookupClient | undefined;
  if (!client?.aISession) {
    throw createAppError('Chat sessions are not available', 503, 'SERVICE_UNAVAILABLE');
  }
  const session = await client.aISession.findUnique({ where: { id: sessionId } });
  if (!session) {
    throw createAppError(`Chat session '${sessionId}' was not found`, 404, 'SESSION_NOT_FOUND');
  }
  if (session.userId !== userId) {
    // Honest, actionable copy (not a bare "Access denied"): the caller can
    // only fix this by opening their own chat, so say that.
    throw createAppError(
      'This chat belongs to a different account — open or start your own chat to continue.',
      403,
      'SESSION_ACCESS_DENIED',
    );
  }
}

/**
 * Resolve the request model through the same policy as the rest of QuantAI:
 * a pinned model is honored only when the operator allow-list permits it,
 * otherwise the caller's stored preference — or the platform default — is
 * used. A free-form `model` can therefore never bypass the model allow-list.
 */
async function resolveChatModel(
  fastify: FastifyInstance,
  userId: string,
  requested?: string,
): Promise<string> {
  const prisma = (fastify as unknown as { prisma?: unknown }).prisma;
  if (!prisma) return (requested ?? '').trim() || DEFAULT_USER_MODEL;
  return (await createUserModelPreferenceService(prisma as never).resolve(userId, requested)).model;
}

export default async function chatRoutes(fastify: FastifyInstance) {
  fastify.post<{ Params: { id: string } }>('/:id/messages', async (request, reply) => {
    const parseResult = sendMessageSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw createAppError(
        parseResult.error.errors.map((e) => e.message).join(', '),
        400,
        'VALIDATION_ERROR',
      );
    }

    const userId = requireUserId(request);
    const { content, model, temperature, useAgent, agentId } = parseResult.data;

    // The :id conversation must exist and belong to the caller.
    await requireOwnedSession((fastify as unknown as { prisma?: unknown }).prisma, request.params.id, userId);

    // Validate the request model against the platform allow-list.
    const resolvedModel = await resolveChatModel(fastify, userId, model);

    // If agent mode is enabled, use the orchestrator
    if (useAgent) {
      const targetAgent = agentId || 'quantai-agent';

      try {
        const result = await orchestrator.runAgent(targetAgent, content, {
          userId,
          model: resolvedModel,
          temperature,
        });

        return reply.send({
          message: result,
          agent: targetAgent,
          model: resolvedModel,
        });
      } catch (error: any) {
        throw createAppError(error.message, 500, 'AGENT_ERROR');
      }
    }

    // Regular AI chat (existing behavior)
    const aiEngine = (fastify as any).aiEngine;
    if (!aiEngine) {
      throw createAppError('AI Engine not initialized', 500, 'INTERNAL_ERROR');
    }

    // userId flows into the engine so per-user budget / rate-limit gates are
    // enforced for THIS caller (no shared 'anonymous' bucket).
    const response = await aiEngine.chat([{ role: 'user', content }], {
      model: resolvedModel,
      temperature: temperature || 0.7,
      userId,
    });

    return reply.send({
      message: response.content,
      model: response.model,
      usage: response.usage,
    });
  });
}
