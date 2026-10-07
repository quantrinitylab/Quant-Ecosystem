// ============================================================================
// QuantEdits - Collaboration Service
// ============================================================================
//
// Backs the (previously dead) /collaboration surface: project members (invite +
// list) and comments (add + list). Self-contained — it does NOT depend on a
// project table: the FIRST person to act on a project becomes its OWNER, and
// owners/editors can then invite others. Roles gate who can invite.
//
// DI'd narrow prisma surface for unit-testability.

import { createAppError } from '@quant/server-core';

export type CollaboratorRoleDb = 'OWNER' | 'EDITOR' | 'VIEWER' | 'COMMENTER';
export type CollaboratorRole = 'owner' | 'editor' | 'viewer' | 'commenter';

export const ROLES: CollaboratorRole[] = ['owner', 'editor', 'viewer', 'commenter'];

export interface CollaboratorView {
  userId: string;
  username: string;
  role: CollaboratorRole;
  joinedAt: string;
  isOnline: boolean;
}

export interface CommentView {
  id: string;
  projectId: string;
  userId: string;
  username: string;
  content: string;
  timestamp: number;
  layerId?: string;
  position?: { x: number; y: number };
  resolved: boolean;
  replies: CommentView[];
  createdAt: string;
}

export interface CollaborationPrisma {
  editCollaborator: {
    findMany: (args: Record<string, unknown>) => Promise<any[]>;
    findFirst: (args: Record<string, unknown>) => Promise<any>;
    count: (args: Record<string, unknown>) => Promise<number>;
    create: (args: { data: Record<string, unknown> }) => Promise<any>;
    upsert: (args: {
      where: Record<string, unknown>;
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }) => Promise<any>;
    delete: (args: { where: Record<string, unknown> }) => Promise<any>;
  };
  editComment: {
    findMany: (args: Record<string, unknown>) => Promise<any[]>;
    findFirst: (args: Record<string, unknown>) => Promise<any>;
    create: (args: { data: Record<string, unknown> }) => Promise<any>;
    update: (args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => Promise<any>;
  };
}

function toDbRole(role: string): CollaboratorRoleDb {
  const r = role.toLowerCase();
  if (!ROLES.includes(r as CollaboratorRole)) {
    throw createAppError(`Invalid role: ${role}`, 400, 'INVALID_ROLE');
  }
  return r.toUpperCase() as CollaboratorRoleDb;
}

export class CollaborationService {
  constructor(private readonly prisma: CollaborationPrisma) {}

  /**
   * Resolve the caller's role on a project. If the project has NO members yet,
   * the caller is its implicit OWNER (not persisted here). If members exist but
   * the caller is not one, access is denied.
   */
  private async resolveRole(projectId: string, userId: string): Promise<CollaboratorRoleDb> {
    const mine = await this.prisma.editCollaborator.findFirst({
      where: { projectId, userId },
    });
    if (mine) return mine.role as CollaboratorRoleDb;

    const total = await this.prisma.editCollaborator.count({ where: { projectId } });
    if (total === 0) return 'OWNER'; // implicit owner of an unclaimed project
    throw createAppError('Not a collaborator on this project', 403, 'NOT_A_COLLABORATOR');
  }

  async inviteCollaborator(
    projectId: string,
    requesterId: string,
    input: { userId: string; role: string },
  ): Promise<CollaboratorView> {
    const inviteeRole = toDbRole(input.role);
    if (!input.userId?.trim()) {
      throw createAppError('userId is required', 400, 'INVALID_USER');
    }

    const requesterRole = await this.resolveRole(projectId, requesterId);
    if (requesterRole !== 'OWNER' && requesterRole !== 'EDITOR') {
      throw createAppError('Only owners or editors can invite', 403, 'FORBIDDEN');
    }

    // Persist the requester as OWNER if they were only the implicit owner, so
    // the project has a durable owner once collaboration actually begins.
    const requesterRow = await this.prisma.editCollaborator.findFirst({
      where: { projectId, userId: requesterId },
    });
    if (!requesterRow) {
      await this.prisma.editCollaborator.create({
        data: { projectId, userId: requesterId, role: 'OWNER' },
      });
    }

    const row = await this.prisma.editCollaborator.upsert({
      where: { projectId_userId: { projectId, userId: input.userId } },
      create: { projectId, userId: input.userId, role: inviteeRole },
      update: { role: inviteeRole },
    });
    return this.toCollaborator(row);
  }

  async listMembers(projectId: string, requesterId: string): Promise<CollaboratorView[]> {
    await this.resolveRole(projectId, requesterId); // access check
    const rows = await this.prisma.editCollaborator.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => this.toCollaborator(r));
  }

  async addComment(
    projectId: string,
    userId: string,
    input: { content: string; layerId?: string; position?: { x: number; y: number } },
  ): Promise<CommentView> {
    const role = await this.resolveRole(projectId, userId); // access check
    if (role === 'VIEWER') {
      throw createAppError('Viewers cannot comment', 403, 'FORBIDDEN');
    }
    const content = input.content?.trim();
    if (!content) {
      throw createAppError('Comment content is required', 400, 'INVALID_COMMENT');
    }
    if (content.length > 5000) {
      throw createAppError('Comment is too long', 400, 'COMMENT_TOO_LONG');
    }

    const row = await this.prisma.editComment.create({
      data: {
        projectId,
        userId,
        content,
        layerId: input.layerId ?? null,
        position: input.position ?? null,
        resolved: false,
      },
    });
    return this.toComment(row);
  }

  async listComments(projectId: string, requesterId: string): Promise<CommentView[]> {
    await this.resolveRole(projectId, requesterId); // access check
    const rows = await this.prisma.editComment.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => this.toComment(r));
  }

  /**
   * Remove a collaborator from a project. Only an OWNER may remove members, and
   * an OWNER can never be removed (prevents orphaning / owner-wars — transfer is
   * a separate flow). Removing a non-member is a 404.
   */
  async removeCollaborator(
    projectId: string,
    requesterId: string,
    targetUserId: string,
  ): Promise<{ success: true }> {
    const requesterRole = await this.resolveRole(projectId, requesterId);
    if (requesterRole !== 'OWNER') {
      throw createAppError('Only an owner can remove collaborators', 403, 'FORBIDDEN');
    }
    const target = await this.prisma.editCollaborator.findFirst({
      where: { projectId, userId: targetUserId },
    });
    if (!target) {
      throw createAppError('Collaborator not found', 404, 'NOT_A_COLLABORATOR');
    }
    if ((target.role as CollaboratorRoleDb) === 'OWNER') {
      throw createAppError('An owner cannot be removed', 403, 'FORBIDDEN');
    }
    await this.prisma.editCollaborator.delete({
      where: { projectId_userId: { projectId, userId: targetUserId } },
    });
    return { success: true };
  }

  /**
   * Mark a comment resolved/unresolved. Only OWNER/EDITOR may resolve threads.
   * The comment must belong to the project.
   */
  async resolveComment(
    projectId: string,
    requesterId: string,
    commentId: string,
    resolved: boolean,
  ): Promise<CommentView> {
    const role = await this.resolveRole(projectId, requesterId);
    if (role !== 'OWNER' && role !== 'EDITOR') {
      throw createAppError('Only owners or editors can resolve comments', 403, 'FORBIDDEN');
    }
    const comment = await this.prisma.editComment.findFirst({
      where: { id: commentId, projectId },
    });
    if (!comment) {
      throw createAppError('Comment not found', 404, 'COMMENT_NOT_FOUND');
    }
    const updated = await this.prisma.editComment.update({
      where: { id: commentId },
      data: { resolved },
    });
    return this.toComment(updated);
  }

  private toCollaborator(row: Record<string, unknown>): CollaboratorView {
    const created = row['createdAt'];
    return {
      userId: String(row['userId']),
      username: String(row['userId']), // no user-table join in this slice
      role: String(row['role']).toLowerCase() as CollaboratorRole,
      joinedAt: created instanceof Date ? created.toISOString() : String(created ?? ''),
      isOnline: false, // presence is a realtime concern, not persisted here
    };
  }

  private toComment(row: Record<string, unknown>): CommentView {
    const created = row['createdAt'];
    const createdAt = created instanceof Date ? created.toISOString() : String(created ?? '');
    const pos = row['position'] as { x: number; y: number } | null | undefined;
    return {
      id: String(row['id']),
      projectId: String(row['projectId']),
      userId: String(row['userId']),
      username: String(row['userId']),
      content: String(row['content']),
      timestamp: created instanceof Date ? created.getTime() : Date.now(),
      ...(row['layerId'] ? { layerId: String(row['layerId']) } : {}),
      ...(pos ? { position: pos } : {}),
      resolved: Boolean(row['resolved']),
      replies: [],
      createdAt,
    };
  }
}
