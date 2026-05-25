import type { PrismaClient } from '../types';

export interface Post {
  id: string;
  userId: string;
  type: string;
  content: string;
  mediaUrls: unknown;
  hashtags: unknown;
  mentions: unknown;
  replyToId: string | null;
  communityId: string | null;
  visibility: string;
  likeCount: number;
  commentCount: number;
  repostCount: number;
  viewCount: number;
  isEdited: boolean;
  isPinned: boolean;
  moderationStatus: string;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
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

export class FeedService {
  constructor(private readonly prisma: PrismaClient) {}

  async getFeed(userId: string, options: PaginationOptions = {}): Promise<PaginatedResult<Post>> {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    // Get list of users this user follows
    const relationships = await this.prisma.userRelationship.findMany({
      where: { followerId: userId, type: 'FOLLOW' },
      select: { followingId: true },
    });

    const followingIds = relationships.map((r: { followingId: string }) => r.followingId);

    // Include the user's own posts in their feed
    const feedUserIds = [userId, ...followingIds];

    // Get posts from followed users sorted by recency and engagement
    const [data, total] = await Promise.all([
      this.prisma.post.findMany({
        where: {
          userId: { in: feedUserIds },
          deletedAt: null,
          visibility: 'PUBLIC',
        },
        skip,
        take: pageSize,
        orderBy: [{ publishedAt: 'desc' }, { likeCount: 'desc' }],
      }),
      this.prisma.post.count({
        where: {
          userId: { in: feedUserIds },
          deletedAt: null,
          visibility: 'PUBLIC',
        },
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

  async getExploreFeed(options: PaginationOptions = {}): Promise<PaginatedResult<Post>> {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    // Explore feed shows trending/popular content
    const [data, total] = await Promise.all([
      this.prisma.post.findMany({
        where: {
          deletedAt: null,
          visibility: 'PUBLIC',
        },
        skip,
        take: pageSize,
        orderBy: [{ viewCount: 'desc' }, { likeCount: 'desc' }],
      }),
      this.prisma.post.count({
        where: {
          deletedAt: null,
          visibility: 'PUBLIC',
        },
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

  async getTrending(
    timeframe: '1h' | '24h' | '7d' = '24h',
    options: PaginationOptions = {},
  ): Promise<PaginatedResult<Post>> {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const now = new Date();
    const since = new Date(now);
    if (timeframe === '1h') {
      since.setHours(since.getHours() - 1);
    } else if (timeframe === '24h') {
      since.setDate(since.getDate() - 1);
    } else {
      since.setDate(since.getDate() - 7);
    }

    const [data, total] = await Promise.all([
      this.prisma.post.findMany({
        where: {
          deletedAt: null,
          visibility: 'PUBLIC',
          publishedAt: { gte: since },
        },
        skip,
        take: pageSize,
        orderBy: [{ likeCount: 'desc' }, { repostCount: 'desc' }],
      }),
      this.prisma.post.count({
        where: {
          deletedAt: null,
          visibility: 'PUBLIC',
          publishedAt: { gte: since },
        },
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
}
