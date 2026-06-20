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

export interface CreateSessionInput {
  title?: string;
  model?: string;
  systemPrompt?: string;
}

export interface UpdateSessionInput {
  title?: string;
  model?: string;
  systemPrompt?: string;
}

export interface AISession {
  id: string;
  userId: string;
  title: string;
  model: string;
  systemPrompt: string | null;
  totalTokensUsed: number;
  totalCost: number;
  tags: unknown;
  isArchived: boolean;
  isPinned: boolean;
  sourceApp: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface SessionPrismaClient {
  aISession: {
    create: (args: { data: Record<string, unknown> }) => Promise<AISession>;
    findUnique: (args: {
      where: Record<string, unknown>;
      include?: Record<string, unknown>;
    }) => Promise<AISession | null>;
    findMany: (args: Record<string, unknown>) => Promise<AISession[]>;
    count: (args: Record<string, unknown>) => Promise<number>;
    update: (args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => Promise<AISession>;
  };
}

export class SessionService {
  constructor(private readonly prisma: SessionPrismaClient) {}

  async createSession(userId: string, input: CreateSessionInput): Promise<AISession> {
    return this.prisma.aISession.create({
      data: {
        userId,
        title: input.title ?? 'New Session',
        model: input.model ?? 'gpt-4',
        systemPrompt: input.systemPrompt ?? null,
      },
    });
  }

  async getSession(sessionId: string, userId: string): Promise<AISession> {
    const session = await this.prisma.aISession.findUnique({
      where: { id: sessionId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });

    if (!session) {
      throw createAppError('Session not found', 404, 'SESSION_NOT_FOUND');
    }

    if (session.userId !== userId) {
      throw createAppError('Access denied', 403, 'ACCESS_DENIED');
    }

    return session;
  }

  async listSessions(
    userId: string,
    options: PaginationOptions = {},
  ): Promise<PaginatedResult<AISession>> {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const [data, total] = await Promise.all([
      this.prisma.aISession.findMany({
        where: { userId, deletedAt: null },
        skip,
        take: pageSize,
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.aISession.count({ where: { userId, deletedAt: null } }),
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

  async updateSession(
    sessionId: string,
    userId: string,
    input: UpdateSessionInput,
  ): Promise<AISession> {
    const session = await this.prisma.aISession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw createAppError('Session not found', 404, 'SESSION_NOT_FOUND');
    }

    if (session.userId !== userId) {
      throw createAppError('Access denied', 403, 'ACCESS_DENIED');
    }

    return this.prisma.aISession.update({
      where: { id: sessionId },
      data: {
        ...(input.title !== undefined && { title: input.title }),
        ...(input.model !== undefined && { model: input.model }),
        ...(input.systemPrompt !== undefined && { systemPrompt: input.systemPrompt }),
        updatedAt: new Date(),
      },
    });
  }

  async archiveSession(sessionId: string, userId: string): Promise<AISession> {
    const session = await this.prisma.aISession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw createAppError('Session not found', 404, 'SESSION_NOT_FOUND');
    }

    if (session.userId !== userId) {
      throw createAppError('Access denied', 403, 'ACCESS_DENIED');
    }

    return this.prisma.aISession.update({
      where: { id: sessionId },
      data: { isArchived: true, updatedAt: new Date() },
    });
  }

  async deleteSession(sessionId: string, userId: string): Promise<AISession> {
    const session = await this.prisma.aISession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw createAppError('Session not found', 404, 'SESSION_NOT_FOUND');
    }

    if (session.userId !== userId) {
      throw createAppError('Access denied', 403, 'ACCESS_DENIED');
    }

    return this.prisma.aISession.update({
      where: { id: sessionId },
      data: { deletedAt: new Date(), updatedAt: new Date() },
    });
  }

  async pinSession(sessionId: string, userId: string): Promise<AISession> {
    const session = await this.prisma.aISession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw createAppError('Session not found', 404, 'SESSION_NOT_FOUND');
    }

    if (session.userId !== userId) {
      throw createAppError('Access denied', 403, 'ACCESS_DENIED');
    }

    return this.prisma.aISession.update({
      where: { id: sessionId },
      data: { isPinned: !session.isPinned, updatedAt: new Date() },
    });
  }

  /**
   * Full-text-ish search across a user's conversations. Matches on the session
   * title OR the content of any message in the session (case-insensitive).
   * Archived/deleted sessions are excluded. Pinned conversations rank first.
   */
  async searchSessions(
    userId: string,
    query: string,
    options: PaginationOptions = {},
  ): Promise<PaginatedResult<AISession>> {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      throw createAppError('Search query must not be empty', 400, 'INVALID_QUERY');
    }

    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const where = {
      userId,
      deletedAt: null,
      isArchived: false,
      OR: [
        { title: { contains: trimmed, mode: 'insensitive' } },
        { messages: { some: { content: { contains: trimmed, mode: 'insensitive' } } } },
      ],
    };

    const [data, total] = await Promise.all([
      this.prisma.aISession.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: [{ isPinned: 'desc' }, { updatedAt: 'desc' }],
      }),
      this.prisma.aISession.count({ where }),
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
}
