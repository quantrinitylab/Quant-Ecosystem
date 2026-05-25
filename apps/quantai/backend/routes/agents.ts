import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { AgentMarketplace } from '../services/agent-marketplace.service';

const installAgentSchema = z.object({
  agentId: z.string().min(1),
});

const createAgentSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().min(1).max(1000),
  version: z.string().min(1),
  capabilities: z.array(z.string()),
  systemPrompt: z.string().min(1).max(10000),
  tools: z.array(z.string()),
  modelPreference: z.string().optional(),
  icon: z.string().optional(),
});

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

export default async function agentsRoutes(fastify: FastifyInstance) {
  const marketplace = new AgentMarketplace();

  // GET /agents/marketplace - List marketplace agents
  fastify.get('/marketplace', async (request, reply) => {
    const queryResult = paginationSchema.safeParse(request.query);
    if (!queryResult.success) {
      throw queryResult.error;
    }

    const result = marketplace.listAgents(queryResult.data);
    return reply.send({ success: true, data: result });
  });

  // GET /agents/:id - Get a specific agent
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const agent = marketplace.getAgent(request.params.id);
    return reply.send({ success: true, data: agent });
  });

  // POST /agents/install - Install an agent
  fastify.post('/install', async (request, reply) => {
    const parseResult = installAgentSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const agent = marketplace.installAgent(userId, parseResult.data.agentId);
    return reply.status(201).send({ success: true, data: agent });
  });

  // DELETE /agents/:id/uninstall - Uninstall an agent
  fastify.delete<{ Params: { id: string } }>('/:id/uninstall', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    marketplace.uninstallAgent(userId, request.params.id);
    return reply.send({ success: true, data: { message: 'Agent uninstalled' } });
  });

  // POST /agents - Create a custom agent
  fastify.post('/', async (request, reply) => {
    const parseResult = createAgentSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const agent = marketplace.createAgent(userId, {
      ...parseResult.data,
      author: userId,
    });

    return reply.status(201).send({ success: true, data: agent });
  });
}
