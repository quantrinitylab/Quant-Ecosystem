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

  async viewStory(storyId: string, _viewerId: string): Promise<Story> {
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

    return this.prisma.story.update({
      where: { id: storyId },
      data: { viewCount: story.viewCount + 1 },
    });
  }

  async getUserStories(userId: string): Promise<Story[]> {
    return this.prisma.story.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async expireStories(): Promise<number> {
    const now = new Date();

    const result = await this.prisma.story.deleteMany({
      where: { expiresAt: { lte: now } },
    });

    return result.count;
  }
}
