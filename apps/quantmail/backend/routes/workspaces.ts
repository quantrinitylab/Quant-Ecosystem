// ============================================================================
// QuantMail — Workspace collaboration API
//   /workspaces                      list + create
//   /workspaces/:id                  detail + rename + delete
//   /workspaces/:id/members          list, change role, remove, leave
//   /workspaces/:id/invites          list, invite by email, resend, revoke
//   /public/invites/:token           public preview (accept screen)
//   /invites/:token/accept           join with the signed-in account
// ============================================================================

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { WorkspaceService, type WorkspaceRole } from '../services/workspace.service';

const roleSchema = z.enum(['ADMIN', 'MEMBER', 'VIEWER']);

const createWorkspaceSchema = z.object({
  name: z.string().min(2).max(80),
  description: z.string().max(280).optional(),
});

const updateWorkspaceSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  description: z.string().max(280).nullable().optional(),
});

const inviteSchema = z.object({
  emails: z.array(z.string().email()).min(1).max(25),
  role: roleSchema.default('MEMBER'),
  message: z.string().max(500).optional(),
});

const roleUpdateSchema = z.object({
  role: z.enum(['OWNER', 'ADMIN', 'MEMBER', 'VIEWER']),
});

function requireUserId(request: unknown): string {
  const userId = (request as { auth?: { userId?: string } }).auth?.userId;
  if (!userId) throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  return userId;
}

function service(fastify: FastifyInstance): WorkspaceService {
  return new WorkspaceService((fastify as unknown as { prisma: unknown }).prisma);
}

export default async function workspaceRoutes(fastify: FastifyInstance) {
  // ------------------------------------------------------------- workspaces
  fastify.get('/workspaces', async (request, reply) => {
    const userId = requireUserId(request);
    const data = await service(fastify).listWorkspaces(userId);
    return reply.send({ success: true, data });
  });

  fastify.post('/workspaces', async (request, reply) => {
    const userId = requireUserId(request);
    const parsed = createWorkspaceSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    const data = await service(fastify).createWorkspace(userId, parsed.data);
    return reply.status(201).send({ success: true, data });
  });

  fastify.get<{ Params: { id: string } }>('/workspaces/:id', async (request, reply) => {
    const userId = requireUserId(request);
    const data = await service(fastify).getWorkspace(request.params.id, userId);
    return reply.send({ success: true, data });
  });

  fastify.patch<{ Params: { id: string } }>('/workspaces/:id', async (request, reply) => {
    const userId = requireUserId(request);
    const parsed = updateWorkspaceSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    const data = await service(fastify).updateWorkspace(request.params.id, userId, parsed.data);
    return reply.send({ success: true, data });
  });

  fastify.delete<{ Params: { id: string } }>('/workspaces/:id', async (request, reply) => {
    const userId = requireUserId(request);
    const data = await service(fastify).deleteWorkspace(request.params.id, userId);
    return reply.send({ success: true, data });
  });

  // ---------------------------------------------------------------- members
  fastify.get<{ Params: { id: string } }>('/workspaces/:id/members', async (request, reply) => {
    const userId = requireUserId(request);
    const data = await service(fastify).listMembers(request.params.id, userId);
    return reply.send({ success: true, data });
  });

  fastify.patch<{ Params: { id: string; memberId: string } }>(
    '/workspaces/:id/members/:memberId',
    async (request, reply) => {
      const userId = requireUserId(request);
      const parsed = roleUpdateSchema.safeParse(request.body);
      if (!parsed.success) throw parsed.error;
      const data = await service(fastify).updateMemberRole(
        request.params.id,
        userId,
        request.params.memberId,
        parsed.data.role as WorkspaceRole,
      );
      return reply.send({ success: true, data });
    },
  );

  fastify.delete<{ Params: { id: string; memberId: string } }>(
    '/workspaces/:id/members/:memberId',
    async (request, reply) => {
      const userId = requireUserId(request);
      const data = await service(fastify).removeMember(
        request.params.id,
        userId,
        request.params.memberId,
      );
      return reply.send({ success: true, data });
    },
  );

  fastify.post<{ Params: { id: string } }>('/workspaces/:id/leave', async (request, reply) => {
    const userId = requireUserId(request);
    const data = await service(fastify).leaveWorkspace(request.params.id, userId);
    return reply.send({ success: true, data });
  });

  // ---------------------------------------------------------------- invites
  fastify.get<{ Params: { id: string } }>('/workspaces/:id/invites', async (request, reply) => {
    const userId = requireUserId(request);
    const data = await service(fastify).listInvites(request.params.id, userId);
    return reply.send({ success: true, data });
  });

  fastify.post<{ Params: { id: string } }>('/workspaces/:id/invites', async (request, reply) => {
    const userId = requireUserId(request);
    const parsed = inviteSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    const data = await service(fastify).createInvites(request.params.id, userId, {
      emails: parsed.data.emails,
      role: parsed.data.role as WorkspaceRole,
      ...(parsed.data.message !== undefined ? { message: parsed.data.message } : {}),
    });
    return reply.status(201).send({ success: true, data });
  });

  fastify.post<{ Params: { id: string; inviteId: string } }>(
    '/workspaces/:id/invites/:inviteId/resend',
    async (request, reply) => {
      const userId = requireUserId(request);
      const data = await service(fastify).resendInvite(
        request.params.id,
        userId,
        request.params.inviteId,
      );
      return reply.send({ success: true, data });
    },
  );

  fastify.delete<{ Params: { id: string; inviteId: string } }>(
    '/workspaces/:id/invites/:inviteId',
    async (request, reply) => {
      const userId = requireUserId(request);
      const data = await service(fastify).revokeInvite(
        request.params.id,
        userId,
        request.params.inviteId,
      );
      return reply.send({ success: true, data });
    },
  );

  // ------------------------------------------------------- invite acceptance
  // Public: the invitee may not have an account yet, so the accept screen can
  // show who invited them before they sign in. Returns no member data.
  fastify.get<{ Params: { token: string } }>('/public/invites/:token', async (request, reply) => {
    const data = await service(fastify).previewInvite(request.params.token);
    return reply.send({ success: true, data });
  });

  fastify.post<{ Params: { token: string } }>('/invites/:token/accept', async (request, reply) => {
    const userId = requireUserId(request);
    const data = await service(fastify).acceptInvite(request.params.token, userId);
    return reply.send({ success: true, data });
  });
}
