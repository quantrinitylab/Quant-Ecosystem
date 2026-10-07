import { Prisma, Video, Photo, Story } from '@prisma/client';
import { BaseRepository, PaginatedResult, PaginationOptions } from './base.repository';

export class MediaRepository extends BaseRepository {
  // Video CRUD
  async findVideoById(id: string): Promise<Video | null> {
    return this.prisma.video.findUnique({ where: { id } });
  }

  async findVideosByUser(
    userId: string,
    options: PaginationOptions = {},
  ): Promise<PaginatedResult<Video>> {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const [data, total] = await Promise.all([
      this.prisma.video.findMany({
        where: { userId, deletedAt: null },
        skip,
        take: pageSize,
        orderBy: { publishedAt: 'desc' },
      }),
      this.prisma.video.count({ where: { userId, deletedAt: null } }),
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

  async createVideo(data: Prisma.VideoCreateInput): Promise<Video> {
    return this.prisma.video.create({ data });
  }

  // Photo CRUD
  async findPhotoById(id: string): Promise<Photo | null> {
    return this.prisma.photo.findUnique({ where: { id } });
  }

  async findPhotosByUser(
    userId: string,
    options: PaginationOptions = {},
  ): Promise<PaginatedResult<Photo>> {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const [data, total] = await Promise.all([
      this.prisma.photo.findMany({
        where: { userId, deletedAt: null },
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.photo.count({ where: { userId, deletedAt: null } }),
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

  async createPhoto(data: Prisma.PhotoCreateInput): Promise<Photo> {
    return this.prisma.photo.create({ data });
  }

  // Story CRUD with expiration
  async findActiveStories(userId: string): Promise<Story[]> {
    return this.prisma.story.findMany({
      where: { userId, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createStory(data: Prisma.StoryCreateInput): Promise<Story> {
    return this.prisma.story.create({ data });
  }
}
