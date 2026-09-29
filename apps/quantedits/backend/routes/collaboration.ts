import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { CollaborationService, ROLES } from '../services/collaboration.service';

// ============================================================================
// QuantEdit collaboration routes (mounted at /collaboration).
//
//   GET  /collaboration/:id/members   -> project collaborators
//   POST /collaboration/:id/invite    { userId, role }
//   GET  /collaboration/:id/comments  -> project comments
//   POST /collaboration/:id/comments  { content, layerId?, position? }
//
// All authenticated; access is gated by project membership (the first actor on
// a project is its implicit owner).
// ============================================================================

const inviteSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(ROLES as [string, ...string[]]),
});

const commentSchema = z.object({
  content: z.string().min(1).max(5000),
  layerId: z.string().optional(),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
});

function requireUserId(request: unknown): string {
  const userId = (request as { auth?: { userId?: string } }).auth?.userId;
  if (!userId) {
    throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return userId;
}

export default async function collaborationRoutes(fastify: FastifyInstance) {
  const service = new CollaborationService((fastify as unknown as { prisma: never }).prisma);

  fastify.get<{ Params: { id: string } }>('/:id/members', async (request, reply) => {
    const userId = requireUserId(request);
    const members = await service.listMembers(request.params.id, userId);
    return reply.send({ success: true, data: members });
  });

  fastify.post<{ Params: { id: string } }>('/:id/invite', async (request, reply) => {
    const userId = requireUserId(request);
    const parsed = inviteSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    const member = await service.inviteCollaborator(request.params.id, userId, parsed.data);
    return reply.status(201).send({ success: true, data: member });
  });

  fastify.get<{ Params: { id: string } }>('/:id/comments', async (request, reply) => {
    const userId = requireUserId(request);
    const comments = await service.listComments(request.params.id, userId);
    return reply.send({ success: true, data: comments });
  });

  fastify.post<{ Params: { id: string } }>('/:id/comments', async (request, reply) => {
    const userId = requireUserId(request);
    const parsed = commentSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    const comment = await service.addComment(request.params.id, userId, parsed.data);
    return reply.status(201).send({ success: true, data: comment });
  });

  // Remove (revoke) a collaborator — owner only.
  fastify.delete<{ Params: { id: string; userId: string } }>(
    '/:id/members/:userId',
    async (request, reply) => {
      const requesterId = requireUserId(request);
      const result = await service.removeCollaborator(
        request.params.id,
        requesterId,
        request.params.userId,
      );
      return reply.send({ success: true, data: result });
    },
  );

  // Resolve / unresolve a comment thread — owner/editor only.
  const resolveSchema = z.object({ resolved: z.boolean() });
  fastify.patch<{ Params: { id: string; commentId: string } }>(
    '/:id/comments/:commentId/resolve',
    async (request, reply) => {
      const userId = requireUserId(request);
      const parsed = resolveSchema.safeParse(request.body);
      if (!parsed.success) throw parsed.error;
      const comment = await service.resolveComment(
        request.params.id,
        userId,
        request.params.commentId,
        parsed.data.resolved,
      );
      return reply.send({ success: true, data: comment });
    },
  );
}
