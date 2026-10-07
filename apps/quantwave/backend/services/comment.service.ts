// ============================================================================
// QuantSync - Comment Service (threaded comments with consistent counts)
// ============================================================================
//
// Backs /posts/:id/comments. Previously this service:
//   - never maintained Post.commentCount or Comment.replyCount,
//   - hard-deleted rows (ignoring the soft-delete `deletedAt` column),
//   - surfaced soft-deleted comments in reads.
//
// Now every create increments the post's commentCount (and, for a reply, the
// parent's replyCount); deletes are idempotent soft-deletes that decrement the
// same counters (clamped at 0 so a drifted counter can never go negative);
// reads exclude soft-deleted comments. Parent validation prevents cross-post
// reply grafting.
//
// DI'd narrow prisma surface so it is fully unit-testable with a mock.

import { createAppError } from '@quant/server-core';

const USER_SELECT = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
} as const;

export interface PostRow {
  id: string;
  commentCount: number;
  deletedAt: Date | null;
}

export interface CommentRow {
  id: string;
  postId: string;
  userId: string;
  parentId: string | null;
  replyCount: number;
  deletedAt: Date | null;
}

export interface CommentPrisma {
  post: {
    findUnique: (args: { where: Record<string, unknown> }) => Promise<PostRow | null>;
    update: (args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => Promise<unknown>;
  };
  comment: {
    findUnique: (args: { where: Record<string, unknown> }) => Promise<CommentRow | null>;
    create: (args: Record<string, unknown>) => Promise<unknown>;
    findMany: (args: Record<string, unknown>) => Promise<unknown[]>;
    update: (args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => Promise<unknown>;
  };
}

export class CommentService {
  constructor(private readonly prisma: CommentPrisma) {}

  private async requireVisiblePost(postId: string): Promise<PostRow> {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post || post.deletedAt) {
      throw createAppError('Post not found', 404, 'POST_NOT_FOUND');
    }
    return post;
  }

  async createComment(userId: string, postId: string, content: string, parentId?: string) {
    await this.requireVisiblePost(postId);

    if (parentId) {
      const parent = await this.prisma.comment.findUnique({ where: { id: parentId } });
      if (!parent || parent.deletedAt) {
        throw createAppError('Parent comment not found', 404, 'COMMENT_NOT_FOUND');
      }
      if (parent.postId !== postId) {
        throw createAppError(
          'Parent comment belongs to a different post',
          400,
          'PARENT_POST_MISMATCH',
        );
      }
    }

    const comment = await this.prisma.comment.create({
      data: {
        userId,
        postId,
        content,
        parentId: parentId ?? null,
      },
      include: { user: { select: USER_SELECT } },
    });

    await this.prisma.post.update({
      where: { id: postId },
      data: { commentCount: { increment: 1 } },
    });
    if (parentId) {
      await this.prisma.comment.update({
        where: { id: parentId },
        data: { replyCount: { increment: 1 } },
      });
    }

    return comment;
  }

  async getComments(postId: string, page: number = 1, pageSize: number = 20) {
    return this.prisma.comment.findMany({
      where: {
        postId,
        parentId: null,
        deletedAt: null,
      },
      include: {
        user: { select: USER_SELECT },
        replies: {
          where: { deletedAt: null },
          include: { user: { select: USER_SELECT } },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
  }

  /**
   * Soft-delete a comment. Owner-only. Idempotent: deleting an already-deleted
   * comment returns success without decrementing counters a second time.
   */
  async deleteComment(userId: string, commentId: string) {
    const comment = await this.prisma.comment.findUnique({ where: { id: commentId } });
    if (!comment || comment.userId !== userId) {
      return { success: false };
    }
    if (comment.deletedAt) {
      return { success: true };
    }

    await this.prisma.comment.update({
      where: { id: commentId },
      data: { deletedAt: new Date() },
    });

    const post = await this.prisma.post.findUnique({ where: { id: comment.postId } });
    if (post) {
      await this.prisma.post.update({
        where: { id: comment.postId },
        data: { commentCount: Math.max(0, post.commentCount - 1) },
      });
    }

    if (comment.parentId) {
      const parent = await this.prisma.comment.findUnique({ where: { id: comment.parentId } });
      if (parent) {
        await this.prisma.comment.update({
          where: { id: comment.parentId },
          data: { replyCount: Math.max(0, parent.replyCount - 1) },
        });
      }
    }

    return { success: true };
  }
}
