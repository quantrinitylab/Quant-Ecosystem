import { createAppError } from '@quant/server-core';

/** Minimal PrismaClient interface for dependency injection */
export interface PrismaClient {
  comment: {
    create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
    findUnique: (args: { where: Record<string, unknown> }) => Promise<unknown>;
    findMany: (args: Record<string, unknown>) => Promise<unknown[]>;
    update: (args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => Promise<unknown>;
  };
  suggestion: {
    create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
  };
}

export interface TextSelection {
  startOffset: number;
  endOffset: number;
  selectedText: string;
}

export interface CreateCommentInput {
  docId: string;
  userId: string;
  content: string;
  selection?: TextSelection;
}

export interface CreateSuggestionInput {
  docId: string;
  userId: string;
  originalText: string;
  suggestedText: string;
  selection: TextSelection;
}

export interface Comment {
  id: string;
  docId: string;
  userId: string;
  content: string;
  selection?: TextSelection;
  parentId?: string;
  resolved: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Suggestion {
  id: string;
  docId: string;
  userId: string;
  originalText: string;
  suggestedText: string;
  selection: TextSelection;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: Date;
}

export class CommentService {
  constructor(private readonly prisma: PrismaClient) {}

  async createComment(input: CreateCommentInput): Promise<Comment> {
    const comment = await this.prisma.comment.create({
      data: {
        docId: input.docId,
        userId: input.userId,
        content: input.content,
        selection: input.selection ?? null,
        resolved: false,
      },
    });

    return comment as unknown as Comment;
  }

  async replyToComment(commentId: string, userId: string, content: string): Promise<Comment> {
    const parent = await this.prisma.comment.findUnique({
      where: { id: commentId },
    });

    if (!parent) {
      throw createAppError('Comment not found', 404, 'COMMENT_NOT_FOUND');
    }

    const reply = await this.prisma.comment.create({
      data: {
        docId: (parent as unknown as Comment).docId,
        userId,
        content,
        parentId: commentId,
        resolved: false,
      },
    });

    return reply as unknown as Comment;
  }

  async resolveComment(commentId: string, userId: string): Promise<Comment> {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
    });

    if (!comment) {
      throw createAppError('Comment not found', 404, 'COMMENT_NOT_FOUND');
    }

    if ((comment as unknown as Comment).userId !== userId) {
      throw createAppError('Not authorized to resolve this comment', 403, 'UNAUTHORIZED');
    }

    const resolved = await this.prisma.comment.update({
      where: { id: commentId },
      data: { resolved: true, updatedAt: new Date() },
    });

    return resolved as unknown as Comment;
  }

  async getComments(docId: string): Promise<Comment[]> {
    const comments = await this.prisma.comment.findMany({
      where: { docId },
      orderBy: { createdAt: 'asc' },
    });

    return comments as unknown as Comment[];
  }

  async createSuggestion(input: CreateSuggestionInput): Promise<Suggestion> {
    const suggestion = await this.prisma.suggestion.create({
      data: {
        docId: input.docId,
        userId: input.userId,
        originalText: input.originalText,
        suggestedText: input.suggestedText,
        selection: input.selection,
        status: 'pending',
      },
    });

    return suggestion as unknown as Suggestion;
  }
}
