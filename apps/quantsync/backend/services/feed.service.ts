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

  /**
   * The "Following" feed: posts authored by the people the caller follows,
   * newest first. Returns an empty list when the caller follows no one.
   */
  async getFollowingFeed(userId: string, page: number = 1, pageSize: number = 20) {
    const rels = await this.prisma.userRelationship.findMany({
      where: { followerId: userId },
      select: { followingId: true },
    });
    const followingIds = rels.map((r) => r.followingId);
    if (followingIds.length === 0) {
      return [];
    }

    const posts = await this.prisma.post.findMany({
      where: {
        userId: { in: followingIds },
        visibility: { in: ['PUBLIC', 'FOLLOWERS_ONLY'] },
        deletedAt: null,
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
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    return posts;
  }
}
