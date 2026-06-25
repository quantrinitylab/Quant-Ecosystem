// ============================================================================
// QuantSync - Follow Service (social graph)
// ============================================================================
//
// Backs the (previously missing) follow graph that the frontend already expects
// (`POST/DELETE /users/:id/follow`, the "Following" feed). Real, idempotent,
// per-user follow edges persisted in the `UserRelationship` table (FOLLOW type).
//
// DI'd narrow prisma for unit-testability.

import { createAppError } from '@quant/server-core';

export interface FollowPrisma {
  userRelationship: {
    findUnique: (args: { where: Record<string, unknown> }) => Promise<unknown>;
    create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
    deleteMany: (args: { where: Record<string, unknown> }) => Promise<{ count: number }>;
    findMany: (args: Record<string, unknown>) => Promise<Array<Record<string, unknown>>>;
    count: (args: Record<string, unknown>) => Promise<number>;
  };
  user: {
    findUnique: (args: { where: Record<string, unknown> }) => Promise<unknown>;
  };
}

export interface FollowState {
  following: boolean;
}

export interface FollowCounts {
  followers: number;
  following: number;
}

export class FollowService {
  constructor(private readonly prisma: FollowPrisma) {}

  /** Follow another user. Idempotent: following twice is a no-op success. */
  async follow(followerId: string, followingId: string): Promise<FollowState> {
    if (followerId === followingId) {
      throw createAppError('You cannot follow yourself', 400, 'SELF_FOLLOW');
    }

    const target = await this.prisma.user.findUnique({ where: { id: followingId } });
    if (!target) {
      throw createAppError('User not found', 404, 'USER_NOT_FOUND');
    }

    const existing = await this.prisma.userRelationship.findUnique({
      where: { followerId_followingId: { followerId, followingId } },
    });
    if (!existing) {
      await this.prisma.userRelationship.create({
        data: { followerId, followingId, type: 'FOLLOW' },
      });
    }
    return { following: true };
  }

  /** Unfollow a user. Idempotent: unfollowing a non-followed user is a no-op. */
  async unfollow(followerId: string, followingId: string): Promise<FollowState> {
    await this.prisma.userRelationship.deleteMany({
      where: { followerId, followingId },
    });
    return { following: false };
  }

  /** Whether `followerId` currently follows `followingId`. */
  async isFollowing(followerId: string, followingId: string): Promise<boolean> {
    const existing = await this.prisma.userRelationship.findUnique({
      where: { followerId_followingId: { followerId, followingId } },
    });
    return Boolean(existing);
  }

  /** The ids of everyone `userId` follows. */
  async listFollowingIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.userRelationship.findMany({
      where: { followerId: userId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => String(r['followingId']));
  }

  /** The ids of everyone who follows `userId`. */
  async listFollowerIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.userRelationship.findMany({
      where: { followingId: userId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => String(r['followerId']));
  }

  /** Follower / following counts for a user. */
  async counts(userId: string): Promise<FollowCounts> {
    const [followers, following] = await Promise.all([
      this.prisma.userRelationship.count({ where: { followingId: userId } }),
      this.prisma.userRelationship.count({ where: { followerId: userId } }),
    ]);
    return { followers, following };
  }
}
