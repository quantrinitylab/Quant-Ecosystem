import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { ToolService } from '../services/tool.service';

const executeToolSchema = z.object({
  args: z.record(z.unknown()),
});

export default async function toolsRoutes(fastify: FastifyInstance) {
  const toolService = new ToolService();

  // GET /tools - List available tools
  fastify.get('/', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const tools = toolService.listTools(userId);
    return reply.send({ success: true, data: tools });
  });

  // POST /tools/:name/execute - Execute a tool
  fastify.post<{ Params: { name: string } }>('/:name/execute', async (request, reply) => {
    const parseResult = executeToolSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const result = await toolService.executeTool(
      request.params.name,
      parseResult.data.args,
      userId,
    );

    return reply.send({ success: true, data: { result } });
  });
}
