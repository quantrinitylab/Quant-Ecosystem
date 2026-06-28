import type { PrismaClient } from '../types';
import { createAppError } from '@quant/server-core';

export interface Story {
  id: string;
  userId: string;
  type: string;
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  duration: number;
  viewCount: number;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateStoryInput {
  userId: string;
  type: 'IMAGE' | 'VIDEO' | 'TEXT';
  mediaUrl?: string;
  thumbnailUrl?: string;
  duration?: number;
}

export class StoryService {
  constructor(private readonly prisma: PrismaClient) {}

  async createStory(input: CreateStoryInput): Promise<Story> {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    return this.prisma.story.create({
      data: {
        userId: input.userId,
        type: input.type,
        mediaUrl: input.mediaUrl ?? null,
        thumbnailUrl: input.thumbnailUrl ?? null,
        duration: input.duration ?? 5,
        viewCount: 0,
        expiresAt,
      },
    });
  }

  /**
   * Story rings for the viewer's feed: active (non-expired) stories grouped by
   * the users the viewer follows (plus the viewer's own).
   */
  async getStoriesFeed(viewerId: string): Promise<
    Array<{
      id: string;
      username: string;
      avatar: string | null;
      hasUnseenStory: boolean;
      isCloseFriend: boolean;
    }>
  > {
    const now = new Date();

    const following = await this.prisma.userRelationship.findMany({
      where: { followerId: viewerId, type: 'FOLLOW' },
    });
    const candidateIds = [...new Set([viewerId, ...following.map((r: any) => r.followingId)])];

    const stories = await this.prisma.story.findMany({
      where: { userId: { in: candidateIds }, expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
    });

    const usersWithStories = [...new Set(stories.map((s: any) => s.userId))];
    if (usersWithStories.length === 0) return [];

    const [users, closeFriends] = await Promise.all([
      this.prisma.user.findMany({ where: { id: { in: usersWithStories } } }),
      this.prisma.closeFriend.findMany({
        where: { userId: viewerId, friendId: { in: usersWithStories } },
      }),
    ]);

    const byId = new Map(users.map((u: any) => [u.id, u]));
    const closeSet = new Set(closeFriends.map((c: any) => c.friendId));

    return usersWithStories
      .map((id) => {
        const u = byId.get(id);
        if (!u) return null;
        return {
          id,
          username: u.username,
          avatar: u.avatarUrl ?? null,
          hasUnseenStory: true,
          isCloseFriend: closeSet.has(id),
        };
      })
      .filter((r): r is NonNullable<typeof r> => Boolean(r));
  }

  async getActiveStories(userId: string): Promise<Story[]> {
    const now = new Date();

    const stories = await this.prisma.story.findMany({
      where: {
        userId,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: 'desc' },
    });

    return stories;
  }

  async viewStory(storyId: string, viewerId: string): Promise<Story> {
    const story = await this.prisma.story.findUnique({
      where: { id: storyId },
    });

    if (!story) {
      throw createAppError('Story not found', 404, 'STORY_NOT_FOUND');
    }

    const now = new Date();
    if (story.expiresAt <= now) {
      throw createAppError('Story has expired', 410, 'STORY_EXPIRED');
    }

    // The owner viewing their own story does not count (Instagram parity) — just
    // return it unchanged.
    if (story.userId === viewerId) {
      return story;
    }

    // Record ONE distinct view per (story, viewer). A re-view is idempotent (the
    // @@unique(storyId, viewerId) constraint makes upsert a no-op on replay), so
    // refreshing never inflates the count.
    await this.prisma.storyView.upsert({
      where: { storyId_viewerId: { storyId, viewerId } },
      create: { storyId, viewerId },
      update: {},
    });

    // viewCount is the number of DISTINCT viewers (excludes the owner).
    const viewCount = await this.prisma.storyView.count({ where: { storyId } });
    return this.prisma.story.update({
      where: { id: storyId },
      data: { viewCount },
    });
  }

  async getUserStories(userId: string): Promise<Story[]> {
    return this.prisma.story.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * The list of distinct viewers of a story (owner-only). Returns each viewer's
   * id and when they first viewed, newest first, plus the aggregate count.
   */
  async getViewers(
    storyId: string,
    userId: string,
  ): Promise<{
    storyId: string;
    viewCount: number;
    viewers: Array<{ viewerId: string; viewedAt: Date }>;
  }> {
    const story = await this.prisma.story.findUnique({
      where: { id: storyId },
    });

    if (!story) {
      throw createAppError('Story not found', 404, 'STORY_NOT_FOUND');
    }

    if (story.userId !== userId) {
      throw createAppError('Only the owner can view story viewers', 403, 'NOT_STORY_OWNER');
    }

    const rows = await this.prisma.storyView.findMany({
      where: { storyId },
      orderBy: { viewedAt: 'desc' },
    });
    const viewers = rows.map((r: any) => ({
      viewerId: String(r.viewerId),
      viewedAt: (r.viewedAt as Date) ?? new Date(),
    }));

    return { storyId, viewCount: viewers.length, viewers };
  }

  async expireStories(): Promise<number> {
    const now = new Date();

    const result = await this.prisma.story.deleteMany({
      where: { expiresAt: { lte: now } },
    });

    return result.count;
  }
}
