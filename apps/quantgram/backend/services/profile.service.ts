import type { PrismaClient } from '../types';
import { createAppError } from '@quant/server-core';

export interface ShapedProfile {
  id: string;
  username: string;
  displayName: string;
  bio: string;
  avatarUrl: string;
  website: string;
  isVerified: boolean;
  isPrivate: boolean;
  postCount: number;
  followerCount: number;
  followingCount: number;
  isFollowing: boolean;
}

export interface CloseFriendEntry {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface FollowUserEntry {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  isVerified: boolean;
  /** Whether the viewer (caller) follows this user — drives the Follow button. */
  isFollowing: boolean;
}

export interface UpdateProfileInput {
  bio?: string;
  website?: string;
  displayName?: string;
  avatarUrl?: string;
}

export class ProfileService {
  constructor(private readonly prisma: PrismaClient) {}

  async getProfile(targetId: string, viewerId: string): Promise<ShapedProfile> {
    const user = await this.prisma.user.findUnique({ where: { id: targetId } });
    if (!user || user.deletedAt) {
      throw createAppError('Profile not found', 404, 'PROFILE_NOT_FOUND');
    }

    const [postCount, followerCount, followingCount, followEdge] = await Promise.all([
      this.prisma.post.count({ where: { userId: targetId, deletedAt: null } }),
      this.prisma.userRelationship.count({ where: { followingId: targetId, type: 'FOLLOW' } }),
      this.prisma.userRelationship.count({ where: { followerId: targetId, type: 'FOLLOW' } }),
      viewerId
        ? this.prisma.userRelationship.findFirst({
            where: { followerId: viewerId, followingId: targetId, type: 'FOLLOW' },
          })
        : Promise.resolve(null),
    ]);

    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName ?? user.username,
      bio: user.bio ?? '',
      avatarUrl: user.avatarUrl ?? '',
      website: user.website ?? '',
      isVerified: user.emailVerified ?? false,
      isPrivate: false,
      postCount,
      followerCount,
      followingCount,
      isFollowing: Boolean(followEdge),
    };
  }

  async follow(followerId: string, followingId: string): Promise<{ following: boolean }> {
    if (followerId === followingId) {
      throw createAppError('You cannot follow yourself', 400, 'SELF_FOLLOW');
    }

    await this.prisma.userRelationship.upsert({
      where: { followerId_followingId: { followerId, followingId } },
      create: { followerId, followingId, type: 'FOLLOW' },
      update: { type: 'FOLLOW' },
    });

    try {
      await this.prisma.notification.create({
        data: {
          userId: followingId,
          type: 'follow',
          title: 'New follower',
          body: 'Someone started following you',
          sourceApp: 'quantneon',
          sourceUserId: followerId,
          sourceEntityId: followerId,
        },
      });
    } catch {
      /* notifications are best-effort */
    }

    return { following: true };
  }

  async unfollow(followerId: string, followingId: string): Promise<{ following: boolean }> {
    if (followerId === followingId) {
      throw createAppError('You cannot unfollow yourself', 400, 'SELF_FOLLOW');
    }
    await this.prisma.userRelationship.deleteMany({
      where: { followerId, followingId, type: 'FOLLOW' },
    });
    return { following: false };
  }

  /**
   * Compute which of `userIds` the viewer currently follows, as a Set, in a
   * single query. Empty viewer or empty list short-circuits to an empty Set.
   */
  private async followingSet(viewerId: string, userIds: string[]): Promise<Set<string>> {
    if (!viewerId || userIds.length === 0) return new Set();
    const edges = await this.prisma.userRelationship.findMany({
      where: { followerId: viewerId, followingId: { in: userIds }, type: 'FOLLOW' },
    });
    return new Set(edges.map((e: any) => e.followingId as string));
  }

  private shapeUsers(
    orderedIds: string[],
    users: any[],
    followingIds: Set<string>,
  ): FollowUserEntry[] {
    const byId = new Map(users.map((u: any) => [u.id, u]));
    return orderedIds
      .map((id) => byId.get(id))
      .filter((u): u is any => Boolean(u) && !u.deletedAt)
      .map((u: any) => ({
        id: u.id,
        username: u.username,
        displayName: u.displayName ?? u.username,
        avatarUrl: u.avatarUrl ?? null,
        isVerified: u.emailVerified ?? false,
        isFollowing: followingIds.has(u.id),
      }));
  }

  /** Users who follow `targetId` (newest first), annotated with the viewer's follow state. */
  async listFollowers(targetId: string, viewerId: string, limit = 50): Promise<FollowUserEntry[]> {
    const edges = await this.prisma.userRelationship.findMany({
      where: { followingId: targetId, type: 'FOLLOW' },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    const ids = edges.map((e: any) => e.followerId as string);
    if (ids.length === 0) return [];

    const [users, followingIds] = await Promise.all([
      this.prisma.user.findMany({ where: { id: { in: ids } } }),
      this.followingSet(viewerId, ids),
    ]);
    return this.shapeUsers(ids, users, followingIds);
  }

  /** Users that `targetId` follows (newest first), annotated with the viewer's follow state. */
  async listFollowing(targetId: string, viewerId: string, limit = 50): Promise<FollowUserEntry[]> {
    const edges = await this.prisma.userRelationship.findMany({
      where: { followerId: targetId, type: 'FOLLOW' },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    const ids = edges.map((e: any) => e.followingId as string);
    if (ids.length === 0) return [];

    const [users, followingIds] = await Promise.all([
      this.prisma.user.findMany({ where: { id: { in: ids } } }),
      this.followingSet(viewerId, ids),
    ]);
    return this.shapeUsers(ids, users, followingIds);
  }

  async updateMe(userId: string, input: UpdateProfileInput): Promise<ShapedProfile> {
    const data: Record<string, unknown> = {};
    if (input.bio !== undefined) data.bio = input.bio;
    if (input.website !== undefined) data.website = input.website;
    if (input.displayName !== undefined) data.displayName = input.displayName;
    if (input.avatarUrl !== undefined) data.avatarUrl = input.avatarUrl;

    await this.prisma.user.update({ where: { id: userId }, data });
    return this.getProfile(userId, userId);
  }

  async listCloseFriends(userId: string): Promise<CloseFriendEntry[]> {
    const edges = await this.prisma.closeFriend.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    const friendIds = edges.map((e: any) => e.friendId);
    if (friendIds.length === 0) return [];

    const users = await this.prisma.user.findMany({ where: { id: { in: friendIds } } });
    const byId = new Map(users.map((u: any) => [u.id, u]));

    return friendIds
      .map((id) => byId.get(id))
      .filter((u): u is any => Boolean(u))
      .map((u: any) => ({
        id: u.id,
        username: u.username,
        displayName: u.displayName ?? u.username,
        avatarUrl: u.avatarUrl ?? null,
      }));
  }

  async addCloseFriend(userId: string, friendId: string): Promise<{ isCloseFriend: boolean }> {
    if (userId === friendId) {
      throw createAppError('You cannot add yourself as a close friend', 400, 'SELF_CLOSE_FRIEND');
    }
    await this.prisma.closeFriend.upsert({
      where: { userId_friendId: { userId, friendId } },
      create: { userId, friendId },
      update: {},
    });
    return { isCloseFriend: true };
  }

  async removeCloseFriend(userId: string, friendId: string): Promise<{ isCloseFriend: boolean }> {
    await this.prisma.closeFriend.deleteMany({ where: { userId, friendId } });
    return { isCloseFriend: false };
  }
}
