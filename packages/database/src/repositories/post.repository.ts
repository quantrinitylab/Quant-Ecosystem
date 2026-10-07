import { Prisma, Post } from '@prisma/client';
import { BaseRepository, PaginatedResult, PaginationOptions } from './base.repository';

export class PostRepository extends BaseRepository {
  async findByUser(
    userId: string,
    options: PaginationOptions = {},
  ): Promise<PaginatedResult<Post>> {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const [data, total] = await Promise.all([
      this.prisma.post.findMany({
        where: { userId, deletedAt: null },
        skip,
        take: pageSize,
        orderBy: { publishedAt: 'desc' },
      }),
      this.prisma.post.count({ where: { userId, deletedAt: null } }),
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

  async findForFeed(options: PaginationOptions = {}): Promise<PaginatedResult<Post>> {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const [data, total] = await Promise.all([
      this.prisma.post.findMany({
        where: { deletedAt: null, visibility: 'PUBLIC', moderationStatus: 'APPROVED' },
        skip,
        take: pageSize,
        orderBy: { publishedAt: 'desc' },
      }),
      this.prisma.post.count({
        where: { deletedAt: null, visibility: 'PUBLIC', moderationStatus: 'APPROVED' },
      }),
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

  async create(data: Prisma.PostCreateInput): Promise<Post> {
    return this.prisma.post.create({ data });
  }

  async incrementLikeCount(id: string): Promise<Post> {
    return this.prisma.post.update({
      where: { id },
      data: { likeCount: { increment: 1 } },
    });
  }
}
