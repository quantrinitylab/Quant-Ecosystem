import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { orchestrator } from '@quant/agentic';

const sendMessageSchema = z.object({
  content: z.string().min(1).max(100000),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  useAgent: z.boolean().optional(),
  agentId: z.string().optional(),
});

export default async function chatRoutes(fastify: FastifyInstance) {
  fastify.post<{ Params: { id: string } }>('/:id/messages', async (request, reply) => {
    const parseResult = sendMessageSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const { content, model, temperature, useAgent, agentId } = parseResult.data;

    // If agent mode is enabled, use the orchestrator
    if (useAgent) {
      const targetAgent = agentId || 'quantai-agent';

      try {
        const result = await orchestrator.runAgent(targetAgent, content, {
          userId,
          model,
          temperature,
        });

        return reply.send({
          message: result,
          agent: targetAgent,
          model: model || 'gpt-4o',
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

    const response = await aiEngine.chat([{ role: 'user', content }], {
      model: model || 'gpt-4o',
      temperature: temperature || 0.7,
    });

    return reply.send({
      message: response.content,
      model: response.model,
      usage: response.usage,
    });
  });
}
