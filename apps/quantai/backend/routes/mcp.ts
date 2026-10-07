import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { McpBridgeService } from '../services/mcp-bridge.service';

const registerSchema = z.object({
  name: z.string().min(1).max(100),
  endpoint: z.string().min(1).max(2048),
  transport: z.enum(['http', 'stdio']).optional(),
});

const invokeSchema = z.object({
  tool: z.string().min(1),
  args: z.record(z.unknown()).optional(),
});

function userId(request: unknown): string {
  const id = (request as { auth?: { userId?: string } }).auth?.userId;
  if (!id) throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  return id;
}

/**
 * QuantAI external MCP bridge routes (mounted at /mcp). Register external MCP
 * servers, discover their tools, and invoke them. Discovery/invoke go through
 * a pluggable transport that fails closed until configured (needs-staging).
 */
export default async function mcpRoutes(fastify: FastifyInstance) {
  function service(): McpBridgeService {
    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    return new McpBridgeService(prisma as never);
  }

  fastify.get('/servers', async (request, reply) => {
    const data = await service().listServers(userId(request));
    return reply.send({ success: true, data });
  });

  fastify.post('/servers', async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    const data = await service().registerServer(userId(request), parsed.data);
    return reply.status(201).send({ success: true, data });
  });

  fastify.delete<{ Params: { name: string } }>('/servers/:name', async (request, reply) => {
    const data = await service().unregisterServer(userId(request), request.params.name);
    return reply.send({ success: true, data });
  });

  fastify.get<{ Params: { name: string } }>('/servers/:name/tools', async (request, reply) => {
    const data = await service().discoverTools(userId(request), request.params.name);
    return reply.send({ success: true, data });
  });

  fastify.post<{ Params: { name: string } }>('/servers/:name/invoke', async (request, reply) => {
    const parsed = invokeSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    const data = await service().invokeTool(
      userId(request),
      request.params.name,
      parsed.data.tool,
      parsed.data.args ?? {},
    );
    return reply.send({ success: true, data });
  });
}
