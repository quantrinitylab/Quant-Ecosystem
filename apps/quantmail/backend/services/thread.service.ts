import type { PrismaClient, Email, EmailThread } from '@prisma/client';
import { createAppError } from '@quant/server-core';

export interface PaginationOptions {
  page?: number;
  pageSize?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface ThreadWithEmails extends EmailThread {
  emails: Email[];
  unreadCount: number;
}

export class ThreadService {
  constructor(private readonly prisma: PrismaClient) {}

  async getThread(threadId: string, userId: string): Promise<ThreadWithEmails> {
    const thread = await this.prisma.emailThread.findUnique({
      where: { id: threadId },
    });

    if (!thread) {
      throw createAppError('Thread not found', 404, 'THREAD_NOT_FOUND');
    }

    if (thread.userId !== userId) {
      throw createAppError('Not authorized to access this thread', 403, 'FORBIDDEN');
    }

    const emails = await this.prisma.email.findMany({
      where: { threadId, userId, deletedAt: null },
      orderBy: { receivedAt: 'asc' },
    });

    const unreadCount = emails.filter((e) => !e.isRead).length;

    return {
      ...thread,
      emails,
      unreadCount,
    };
  }

  async listThreads(
    userId: string,
    folderId?: string,
    options: PaginationOptions = {},
  ): Promise<PaginatedResult<EmailThread>> {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = { userId };
    if (folderId) {
      where['id'] = {
        in: await this.getThreadIdsForFolder(userId, folderId),
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.emailThread.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { lastEmailAt: 'desc' },
      }),
      this.prisma.emailThread.count({ where }),
    ]);

    const totalPages = Math.ceil(total / pageSize);
    return {
      data,
      total,
      page,
      pageSize,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
  }

  async getThreadParticipants(threadId: string, userId: string): Promise<string[]> {
    const thread = await this.prisma.emailThread.findUnique({
      where: { id: threadId },
    });

    if (!thread) {
      throw createAppError('Thread not found', 404, 'THREAD_NOT_FOUND');
    }

    if (thread.userId !== userId) {
      throw createAppError('Not authorized', 403, 'FORBIDDEN');
    }

    return (thread.participantAddresses as string[]) ?? [];
  }

  private async getThreadIdsForFolder(userId: string, folderId: string): Promise<string[]> {
    const emails = await this.prisma.email.findMany({
      where: { userId, folderId, deletedAt: null, threadId: { not: null } },
      select: { threadId: true },
      distinct: ['threadId'],
    });

    return emails.map((e) => e.threadId).filter((id): id is string => id !== null);
  }
}
