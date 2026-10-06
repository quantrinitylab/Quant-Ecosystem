import { createAppError } from '@quant/server-core';

export const MAX_TOPIC_LENGTH = 100;

/**
 * Normalize a user-supplied topic label: trim whitespace, collapse internal
 * runs, cap length. Returns null for empty/blank input (untagged).
 */
export function normalizeTopic(topic: string | null | undefined): string | null {
  if (topic === null || topic === undefined) return null;
  const cleaned = topic.trim().replace(/\s+/g, ' ');
  if (cleaned.length === 0) return null;
  return cleaned.slice(0, MAX_TOPIC_LENGTH);
}

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
  topic?: string | null;
}

export interface UpdateSessionInput {
  title?: string;
  model?: string;
  systemPrompt?: string;
  topic?: string | null;
}

export interface SessionListOptions extends PaginationOptions {
  /** Filter to sessions with this exact topic. `null` = untagged (main chats) only. */
  topic?: string | null;
  /** When true, only return sessions that have any topic (side chats). */
  sideChatsOnly?: boolean;
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
  /** Side chats: nullable topic label. null = main chat (untagged). */
  topic: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface TopicSummary {
  topic: string;
  count: number;
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
    groupBy: (args: Record<string, unknown>) => Promise<TopicSummary[]>;
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
        topic: normalizeTopic(input.topic),
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
    options: SessionListOptions = {},
  ): Promise<PaginatedResult<AISession>> {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = { userId, deletedAt: null };
    if (options.topic !== undefined) {
      // Exact topic match; null selects untagged (main) chats.
      where.topic = options.topic === null ? null : normalizeTopic(options.topic) ?? null;
    } else if (options.sideChatsOnly) {
      where.topic = { not: null };
    }

    const [data, total] = await Promise.all([
      this.prisma.aISession.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { updatedAt: 'desc' },
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

  /**
   * Distinct topic labels for a user with conversation counts, for the
   * "Side chats" section. Untagged sessions are NOT included here (they are
   * the main chats). Ordered by most-recently-used topic first.
   */
  async listTopics(userId: string): Promise<TopicSummary[]> {
    const rows = await this.prisma.aISession.groupBy({
      by: ['topic'],
      where: { userId, deletedAt: null, topic: { not: null } },
      _count: { topic: true },
    });
    return rows
      .filter((r) => typeof r.topic === 'string' && r.topic.length > 0)
      .map((r) => ({
        topic: r.topic as string,
        // Prisma groupBy returns `_count: { topic: n }` for the requested field.
        count: (r as unknown as { _count: { topic: number } })._count.topic,
      }))
      .sort((a, b) => b.count - a.count);
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
        ...(input.topic !== undefined && { topic: normalizeTopic(input.topic) }),
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Move a conversation into (or out of) a topic — the "move to side chat"
   * action. Passing null/blank removes it from its topic (back to main chats).
   */
  async setSessionTopic(
    sessionId: string,
    userId: string,
    topic: string | null | undefined,
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
      data: { topic: normalizeTopic(topic), updatedAt: new Date() },
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
