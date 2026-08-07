// ============================================================================
// Social Graph Service - Prisma + Redis backed social graph
// ============================================================================

import type { PrismaClient } from '@quant/database';
import type { Redis } from 'ioredis';
import { z } from 'zod';

export interface PaginationOptions {
  page?: number;
  pageSize?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface UserRelation {
  id: string;
  userId: string;
  type: string;
  createdAt: Date;
}

const FollowInputSchema = z.object({
  followerId: z.string().min(1),
  followingId: z.string().min(1),
});

const PaginationSchema = z.object({
  page: z.number().int().positive().optional().default(1),
  pageSize: z.number().int().positive().max(100).optional().default(20),
});

/**
 * SocialGraphService - Prisma + Redis backed social graph
 *
 * Uses Prisma for persistent storage of user relationships
 * and Redis for caching follower counts and frequently accessed data.
 */
export class SocialGraphService {
  private static readonly FOLLOWER_COUNT_KEY = 'social:followers:count:';
  private static readonly FOLLOWING_COUNT_KEY = 'social:following:count:';
  private static readonly CACHE_TTL = 3600; // 1 hour

  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis,
  ) {}

  async follow(followerId: string, followingId: string): Promise<void> {
    const input = FollowInputSchema.parse({ followerId, followingId });

    if (input.followerId === input.followingId) {
      throw new Error('Cannot follow yourself');
    }

    await (this.prisma as unknown as PrismaWithRelationship).userRelationship.upsert({
      where: {
        followerId_followingId: {
          followerId: input.followerId,
          followingId: input.followingId,
        },
      },
      update: { type: 'FOLLOW' },
      create: {
        followerId: input.followerId,
        followingId: input.followingId,
        type: 'FOLLOW',
      },
    });

    await this.invalidateCountCache(input.followerId, input.followingId);
  }

  async unfollow(followerId: string, followingId: string): Promise<void> {
    const input = FollowInputSchema.parse({ followerId, followingId });

    await (this.prisma as unknown as PrismaWithRelationship).userRelationship.deleteMany({
      where: {
        followerId: input.followerId,
        followingId: input.followingId,
        type: 'FOLLOW',
      },
    });

    await this.invalidateCountCache(input.followerId, input.followingId);
  }

  async getFollowers(
    userId: string,
    pagination?: PaginationOptions,
  ): Promise<PaginatedResult<UserRelation>> {
    const { page, pageSize } = PaginationSchema.parse(pagination ?? {});
    const skip = (page - 1) * pageSize;

    const prismaClient = this.prisma as unknown as PrismaWithRelationship;

    const [data, total] = await Promise.all([
      prismaClient.userRelationship.findMany({
        where: { followingId: userId, type: 'FOLLOW' },
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      prismaClient.userRelationship.count({
        where: { followingId: userId, type: 'FOLLOW' },
      }),
    ]);

    return {
      data: (data as RelationshipRecord[]).map((r) => ({
        id: r.id,
        userId: r.followerId,
        type: r.type,
        createdAt: r.createdAt,
      })),
      total,
      page,
      pageSize,
      hasMore: skip + pageSize < total,
    };
  }

  async getFollowing(
    userId: string,
    pagination?: PaginationOptions,
  ): Promise<PaginatedResult<UserRelation>> {
    const { page, pageSize } = PaginationSchema.parse(pagination ?? {});
    const skip = (page - 1) * pageSize;

    const prismaClient = this.prisma as unknown as PrismaWithRelationship;

    const [data, total] = await Promise.all([
      prismaClient.userRelationship.findMany({
        where: { followerId: userId, type: 'FOLLOW' },
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      prismaClient.userRelationship.count({
        where: { followerId: userId, type: 'FOLLOW' },
      }),
    ]);

    return {
      data: (data as RelationshipRecord[]).map((r) => ({
        id: r.id,
        userId: r.followingId,
        type: r.type,
        createdAt: r.createdAt,
      })),
      total,
      page,
      pageSize,
      hasMore: skip + pageSize < total,
    };
  }

  async getMutualFollowers(userId1: string, userId2: string): Promise<string[]> {
    const prismaClient = this.prisma as unknown as PrismaWithRelationship;

    // Find users who follow both userId1 and userId2
    const followersOfUser1 = await prismaClient.userRelationship.findMany({
      where: { followingId: userId1, type: 'FOLLOW' },
      select: { followerId: true },
    });

    const followersOfUser2 = await prismaClient.userRelationship.findMany({
      where: { followingId: userId2, type: 'FOLLOW' },
      select: { followerId: true },
    });

    const set1 = new Set(
      (followersOfUser1 as Array<{ followerId: string }>).map((r) => r.followerId),
    );
    const mutuals: string[] = [];

    for (const r of followersOfUser2 as Array<{ followerId: string }>) {
      if (set1.has(r.followerId)) {
        mutuals.push(r.followerId);
      }
    }

    return mutuals;
  }

  async suggestFriendsOfFriends(userId: string, limit = 10): Promise<string[]> {
    const prismaClient = this.prisma as unknown as PrismaWithRelationship;

    // Get who the user follows
    const following = await prismaClient.userRelationship.findMany({
      where: { followerId: userId, type: 'FOLLOW' },
      select: { followingId: true },
    });

    const followingIds = (following as Array<{ followingId: string }>).map((r) => r.followingId);

    if (followingIds.length === 0) {
      return [];
    }

    // Get who those users follow (friends of friends)
    const friendsOfFriends = await prismaClient.userRelationship.findMany({
      where: {
        followerId: { in: followingIds },
        type: 'FOLLOW',
        followingId: { notIn: [...followingIds, userId] },
      },
      select: { followingId: true },
    });

    // Count occurrences to rank suggestions
    const countMap: Record<string, number> = {};
    for (const r of friendsOfFriends as Array<{ followingId: string }>) {
      countMap[r.followingId] = (countMap[r.followingId] ?? 0) + 1;
    }

    // Sort by frequency and take top N
    const sorted = Object.entries(countMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([id]) => id);

    return sorted;
  }

  async block(blockerId: string, blockedId: string): Promise<void> {
    const input = FollowInputSchema.parse({ followerId: blockerId, followingId: blockedId });

    const prismaClient = this.prisma as unknown as PrismaWithRelationship;

    // Remove any FOLLOW relationships in both directions
    await prismaClient.userRelationship.deleteMany({
      where: {
        OR: [
          { followerId: input.followerId, followingId: input.followingId, type: 'FOLLOW' },
          { followerId: input.followingId, followingId: input.followerId, type: 'FOLLOW' },
        ],
      },
    });

    // Create the BLOCK relationship
    await prismaClient.userRelationship.upsert({
      where: {
        followerId_followingId: {
          followerId: input.followerId,
          followingId: input.followingId,
        },
      },
      update: { type: 'BLOCK' },
      create: {
        followerId: input.followerId,
        followingId: input.followingId,
        type: 'BLOCK',
      },
    });

    await this.invalidateCountCache(input.followerId, input.followingId);
  }

  async mute(muterId: string, mutedId: string): Promise<void> {
    const input = FollowInputSchema.parse({ followerId: muterId, followingId: mutedId });

    await (this.prisma as unknown as PrismaWithRelationship).userRelationship.upsert({
      where: {
        followerId_followingId: {
          followerId: input.followerId,
          followingId: input.followingId,
        },
      },
      update: { type: 'MUTE' },
      create: {
        followerId: input.followerId,
        followingId: input.followingId,
        type: 'MUTE',
      },
    });
  }

  async getFollowerCount(userId: string): Promise<number> {
    const cacheKey = SocialGraphService.FOLLOWER_COUNT_KEY + userId;
    const cached = await this.redis.get(cacheKey);

    if (cached !== null) {
      return parseInt(cached, 10);
    }

    const count = await (this.prisma as unknown as PrismaWithRelationship).userRelationship.count({
      where: { followingId: userId, type: 'FOLLOW' },
    });

    await this.redis.set(cacheKey, count.toString(), 'EX', SocialGraphService.CACHE_TTL);
    return count;
  }

  async getFollowingCount(userId: string): Promise<number> {
    const cacheKey = SocialGraphService.FOLLOWING_COUNT_KEY + userId;
    const cached = await this.redis.get(cacheKey);

    if (cached !== null) {
      return parseInt(cached, 10);
    }

    const count = await (this.prisma as unknown as PrismaWithRelationship).userRelationship.count({
      where: { followerId: userId, type: 'FOLLOW' },
    });

    await this.redis.set(cacheKey, count.toString(), 'EX', SocialGraphService.CACHE_TTL);
    return count;
  }

  private async invalidateCountCache(userId1: string, userId2: string): Promise<void> {
    await Promise.all([
      this.redis.del(SocialGraphService.FOLLOWER_COUNT_KEY + userId1),
      this.redis.del(SocialGraphService.FOLLOWER_COUNT_KEY + userId2),
      this.redis.del(SocialGraphService.FOLLOWING_COUNT_KEY + userId1),
      this.redis.del(SocialGraphService.FOLLOWING_COUNT_KEY + userId2),
    ]);
  }
}

// Internal type helpers for Prisma client shape
interface RelationshipRecord {
  id: string;
  followerId: string;
  followingId: string;
  type: string;
  createdAt: Date;
}

interface PrismaWithRelationship {
  userRelationship: {
    upsert: (args: unknown) => Promise<RelationshipRecord>;
    deleteMany: (args: unknown) => Promise<{ count: number }>;
    findMany: (args: unknown) => Promise<RelationshipRecord[]>;
    count: (args: unknown) => Promise<number>;
  };
}
