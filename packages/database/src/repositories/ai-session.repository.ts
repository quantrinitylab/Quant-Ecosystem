import { Prisma, AISession, AIMessage } from '@prisma/client';
import { BaseRepository, PaginatedResult, PaginationOptions } from './base.repository';

export class AISessionRepository extends BaseRepository {
  async findByUser(
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

  async create(data: Prisma.AISessionCreateInput): Promise<AISession> {
    return this.prisma.aISession.create({ data });
  }

  async addMessage(data: Prisma.AIMessageCreateInput): Promise<AIMessage> {
    return this.prisma.aIMessage.create({ data });
  }

  async getSessionWithMessages(
    sessionId: string,
  ): Promise<(AISession & { messages: AIMessage[] }) | null> {
    return this.prisma.aISession.findUnique({
      where: { id: sessionId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
  }
}
