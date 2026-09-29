import { PrismaClient } from '@prisma/client';

export class FeedService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async getFeed(
    userId: string,
    page: number = 1,
    pageSize: number = 20,
    space?: 'main' | 'verified' | 'anonymous',
  ) {
    const posts = await this.prisma.post.findMany({
      where: {
        visibility: 'PUBLIC',
        deletedAt: null,
        ...(space ? { space } : {}),
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        _count: {
          select: {
            likes: true,
            comments: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    return posts;
  }

  async getPostsByHashtag(tag: string, page: number = 1, pageSize: number = 20) {
    // Normalize the tag to match the stored convention: trim, strip a leading
    // '#', and lowercase (posts store hashtags as lowercase strings without '#').
    const normalizedTag = tag.trim().replace(/^#+/, '').toLowerCase();

    const posts = await this.prisma.post.findMany({
      where: {
        visibility: 'PUBLIC',
        deletedAt: null,
        hashtags: {
          array_contains: normalizedTag,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        _count: {
          select: {
            likes: true,
            comments: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    return posts;
  }

  async getTrendingPosts(limit: number = 20) {
    // Simple trending based on likes + comments in last 24 hours
    const posts = await this.prisma.post.findMany({
      where: {
        visibility: 'PUBLIC',
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        _count: {
          select: {
            likes: true,
            comments: true,
          },
        },
      },
      orderBy: [
        {
          likes: {
            _count: 'desc',
          },
        },
        {
          comments: {
            _count: 'desc',
          },
        },
      ],
      take: limit,
    });

    return posts;
  }
}
