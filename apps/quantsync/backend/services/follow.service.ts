// ============================================================================
// QuantSync - Follow Service (X / Threads-style social graph)
// ============================================================================
//
// QuantSync had no follow graph at all. This adds the durable, Prisma-backed
// follow relationship that an X/Threads-style product is built on, using the
// shared `UserRelationship` model (type FOLLOW):
//
//   - follow / unfollow are idempotent (a unique (followerId, followingId)
//     edge; re-following or re-unfollowing never duplicates or errors)
//   - no self-follow
//   - followers / following listings, each annotated with the viewer's own
//     follow state (single batched query) so the client can render Follow
//     buttons without N+1 lookups
//   - a "Following" home feed: public, non-deleted posts authored by the
//     accounts the caller follows, newest first
//
// DI'd narrow prisma surface so it is fully unit-testable with a mock.

import { createAppError } from '@quant/server-core';

export interface FollowUserEntry {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  isVerified: boolean;
  /** Whether the viewer (caller) follows this user — drives the Follow button. */
  isFollowing: boolean;
}

/** A "Who to follow" suggestion: a not-yet-followed account ranked by how many
 *  of the people you already follow also follow them (friends-of-friends). */
export interface SuggestedUser extends FollowUserEntry {
  /** How many of the caller's followees also follow this account. */
  mutualCount: number;
}

export interface FollowPrisma {
  user: {
    findUnique: (args: { where: Record<string, unknown> }) => Promise<{
      id: string;
      deletedAt: Date | null;
    } | null>;
    findMany: (args: Record<string, unknown>) => Promise<any[]>;
  };
  userRelationship: {
    upsert: (args: {
      where: Record<string, unknown>;
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }) => Promise<unknown>;
    deleteMany: (args: { where: Record<string, unknown> }) => Promise<{ count: number }>;
    findUnique: (args: { where: Record<string, unknown> }) => Promise<unknown | null>;
    findMany: (args: Record<string, unknown>) => Promise<any[]>;
  };
  post: {
    findMany: (args: Record<string, unknown>) => Promise<any[]>;
  };
}

const USER_SELECT = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
} as const;

export class FollowService {
  constructor(private readonly prisma: FollowPrisma) {}

  /** Follow a user. Idempotent; rejects self-follow and unknown/deleted targets. */
  async follow(followerId: string, followingId: string): Promise<{ following: boolean }> {
    if (followerId === followingId) {
      throw createAppError('You cannot follow yourself', 400, 'SELF_FOLLOW');
    }
    const target = await this.prisma.user.findUnique({ where: { id: followingId } });
    if (!target || target.deletedAt) {
      throw createAppError('User not found', 404, 'USER_NOT_FOUND');
    }

    await this.prisma.userRelationship.upsert({
      where: { followerId_followingId: { followerId, followingId } },
      create: { followerId, followingId, type: 'FOLLOW' },
      update: { type: 'FOLLOW' },
    });
    return { following: true };
  }

  /** Unfollow a user. Idempotent no-op when not following. */
  async unfollow(followerId: string, followingId: string): Promise<{ following: boolean }> {
    if (followerId === followingId) {
      throw createAppError('You cannot unfollow yourself', 400, 'SELF_FOLLOW');
    }
    await this.prisma.userRelationship.deleteMany({
      where: { followerId, followingId, type: 'FOLLOW' },
    });
    return { following: false };
  }

  async isFollowing(followerId: string, followingId: string): Promise<boolean> {
    const edge = await this.prisma.userRelationship.findUnique({
      where: { followerId_followingId: { followerId, followingId } },
    });
    return Boolean(edge);
  }

  /** Which of `userIds` the viewer follows, as a Set, in one query. */
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

  /** Accounts that follow `targetId` (newest first), with the viewer's follow state. */
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

  /** Accounts `targetId` follows (newest first), with the viewer's follow state. */
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

  /**
   * The "Following" home feed: public, non-deleted posts authored by the
   * accounts the caller follows, newest first. Empty when the caller follows
   * no one.
   */
  async getFollowingFeed(userId: string, page = 1, pageSize = 20): Promise<any[]> {
    const edges = await this.prisma.userRelationship.findMany({
      where: { followerId: userId, type: 'FOLLOW' },
    });
    const authorIds = edges.map((e: any) => e.followingId as string);
    if (authorIds.length === 0) return [];

    return this.prisma.post.findMany({
      where: {
        userId: { in: authorIds },
        visibility: 'PUBLIC',
        deletedAt: null,
      },
      include: {
        user: { select: USER_SELECT },
        _count: { select: { likes: true, comments: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
  }

  /**
   * "Who to follow": accounts the caller does NOT already follow, ranked by how
   * many of the caller's own followees also follow them (a friends-of-friends
   * signal — "followed by N people you follow"). Excludes the caller and anyone
   * they already follow. Empty when the caller follows no one yet (cold start —
   * a popularity fallback is a future enhancement).
   */
  async getSuggestions(userId: string, limit = 20): Promise<SuggestedUser[]> {
    const myEdges = await this.prisma.userRelationship.findMany({
      where: { followerId: userId, type: 'FOLLOW' },
    });
    const following = myEdges.map((e: any) => e.followingId as string);
    if (following.length === 0) return [];

    const exclude = new Set<string>([userId, ...following]);

    // Who the people I follow also follow (the candidate pool).
    const fofEdges = await this.prisma.userRelationship.findMany({
      where: { followerId: { in: following }, type: 'FOLLOW' },
    });

    const mutualCount = new Map<string, number>();
    for (const e of fofEdges) {
      const candidate = e.followingId as string;
      if (exclude.has(candidate)) continue;
      mutualCount.set(candidate, (mutualCount.get(candidate) ?? 0) + 1);
    }
    if (mutualCount.size === 0) return [];

    const ranked = [...mutualCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, Math.max(1, limit));
    const ids = ranked.map(([id]) => id);

    const users = await this.prisma.user.findMany({ where: { id: { in: ids } } });
    const byId = new Map(users.map((u: any) => [u.id, u]));

    return ranked
      .map(([id, count]) => {
        const u = byId.get(id);
        if (!u || u.deletedAt) return null;
        const entry: SuggestedUser = {
          id: u.id,
          username: u.username,
          displayName: u.displayName ?? u.username,
          avatarUrl: u.avatarUrl ?? null,
          isVerified: u.emailVerified ?? false,
          isFollowing: false, // candidates are, by construction, not yet followed
          mutualCount: count,
        };
        return entry;
      })
      .filter((e): e is SuggestedUser => e !== null);
  }
}
