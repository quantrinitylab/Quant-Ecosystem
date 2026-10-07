import { Prisma, Message, Conversation } from '@prisma/client';
import { BaseRepository, PaginatedResult, PaginationOptions } from './base.repository';

export class MessageRepository extends BaseRepository {
  async findByConversation(
    conversationId: string,
    options: PaginationOptions = {},
  ): Promise<PaginatedResult<Message>> {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 50;
    const skip = (page - 1) * pageSize;

    const [data, total] = await Promise.all([
      this.prisma.message.findMany({
        where: { conversationId, isDeleted: false },
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.message.count({ where: { conversationId, isDeleted: false } }),
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

  async create(data: Prisma.MessageCreateInput): Promise<Message> {
    return this.prisma.message.create({ data });
  }

  async markAsRead(conversationId: string, userId: string): Promise<void> {
    await this.prisma.conversationMember.updateMany({
      where: { conversationId, userId },
      data: { lastReadAt: new Date() },
    });
  }

  async getConversationsForUser(userId: string): Promise<Conversation[]> {
    const members = await this.prisma.conversationMember.findMany({
      where: { userId, leftAt: null },
      include: { conversation: true },
      orderBy: { conversation: { lastMessageAt: 'desc' } },
    });
    return members.map((m) => m.conversation);
  }
}
