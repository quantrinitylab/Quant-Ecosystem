import { Prisma, Email } from '@prisma/client';
import { BaseRepository, PaginatedResult, PaginationOptions } from './base.repository';

export class EmailRepository extends BaseRepository {
  async findByFolder(
    userId: string,
    folderId: string,
    options: PaginationOptions = {},
  ): Promise<PaginatedResult<Email>> {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const [data, total] = await Promise.all([
      this.prisma.email.findMany({
        where: { userId, folderId, deletedAt: null },
        skip,
        take: pageSize,
        orderBy: { receivedAt: 'desc' },
      }),
      this.prisma.email.count({ where: { userId, folderId, deletedAt: null } }),
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

  async findByThread(userId: string, threadId: string): Promise<Email[]> {
    return this.prisma.email.findMany({
      where: { userId, threadId, deletedAt: null },
      orderBy: { receivedAt: 'asc' },
    });
  }

  async create(data: Prisma.EmailCreateInput): Promise<Email> {
    return this.prisma.email.create({ data });
  }

  async markAsRead(id: string): Promise<Email> {
    return this.prisma.email.update({
      where: { id },
      data: { isRead: true },
    });
  }

  async moveToFolder(id: string, folderId: string): Promise<Email> {
    return this.prisma.email.update({
      where: { id },
      data: { folderId },
    });
  }
}
