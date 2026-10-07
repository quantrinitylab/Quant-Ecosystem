import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { permissionManager } from '@quant/agentic';

const grantSchema = z.object({
  agentId: z.string(),
  resource: z.string(),
  actions: z.array(z.string()),
});

export default async function permissionsRoutes(fastify: FastifyInstance) {
  fastify.post('/grant', async (request, reply) => {
    const parseResult = grantSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const { agentId, resource, actions } = parseResult.data;
    permissionManager.grantPermission(agentId, userId, resource, actions);

    return reply.send({ success: true });
  });

  fastify.get('/my-permissions', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const perms = permissionManager.getUserPermissions(userId);
    return reply.send(perms);
  });
}
