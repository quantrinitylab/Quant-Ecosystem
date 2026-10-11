// ============================================================================
// QuantAI - Admin AI provider settings routes
// ============================================================================
//
// Admin-scoped provider priority/failover configuration (the backend
// counterpart of the standing "Meta default + admin-panel switching"
// architecture directive).
//
//   GET /admin/ai/providers — current order + per-provider availability
//   PUT /admin/ai/providers — set a new priority order (strict allow-list)
//
// Both routes require authentication AND the admin role (from the JWT `role`
// claim, the same AuthContext the auth plugin builds — no new auth scheme).
// API key values are never read, logged, or returned — only key presence.

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { AiProviderSettingsService } from '../services/ai-provider-settings.service';

const setOrderSchema = z.object({
  order: z.array(z.string().min(1)).min(1),
});

interface AuthShape {
  auth?: { userId?: string; role?: string };
}

/**
 * Reuses the existing auth plugin (`fastify.requireAuth`) and then enforces
 * the admin role from the verified JWT — the established RBAC mechanism,
 * not a new auth scheme.
 */
function requireAdmin(fastify: FastifyInstance) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    await fastify.requireAuth()(request, reply);
    if (reply.sent) return;
    const role = (request as unknown as AuthShape).auth?.role;
    if (role !== 'admin') {
      throw createAppError('Admin access required', 403, 'FORBIDDEN');
    }
  };
}

export default async function adminAiProvidersRoutes(fastify: FastifyInstance) {
  function settingsService(): AiProviderSettingsService {
    const prisma = (fastify as unknown as { prisma?: unknown }).prisma;
    if (!prisma) {
      throw createAppError('Provider settings are not available', 503, 'SERVICE_UNAVAILABLE');
    }
    return new AiProviderSettingsService(prisma as never);
  }

  function requireUserId(request: FastifyRequest): string {
    const userId = (request as unknown as AuthShape).auth?.userId;
    if (!userId) throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    return userId;
  }

  const adminOnly = requireAdmin(fastify);

  // GET /admin/ai/providers — current order + availability (no secrets).
  fastify.get(
    '/admin/ai/providers',
    { preHandler: adminOnly },
    async (_request, reply) => {
      const status = await settingsService().getStatus();
      return reply.send({ success: true, data: status });
    },
  );

  // PUT /admin/ai/providers — set a new priority order (strict allow-list).
  fastify.put(
    '/admin/ai/providers',
    { preHandler: adminOnly },
    async (request, reply) => {
      const parsed = setOrderSchema.safeParse(request.body);
      if (!parsed.success) throw parsed.error;
      const userId = requireUserId(request);
      const updated = await settingsService().setProviderOrder(parsed.data.order, userId);
      return reply.send({ success: true, data: updated });
    },
  );
}
