import type { PrismaClient } from '../types';
import { createAppError } from '@quant/server-core';

export interface ShortVideo {
  id: string;
  userId: string;
  videoUrl: string;
  thumbnailUrl: string | null;
  caption: string | null;
  hashtags: unknown;
  duration: number;
  likeCount: number;
  shareCount: number;
  viewCount: number;
  createdAt: Date;
  updatedAt: Date;
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

export interface UploadShortVideoInput {
  userId: string;
  videoUrl: string;
  thumbnailUrl?: string;
  caption?: string;
  hashtags?: string[];
  duration: number;
}

export class ShortVideoService {
  constructor(private readonly prisma: PrismaClient) {}

  async uploadShortVideo(input: UploadShortVideoInput): Promise<ShortVideo> {
    return this.prisma.shortVideo.create({
      data: {
        userId: input.userId,
        videoUrl: input.videoUrl,
        thumbnailUrl: input.thumbnailUrl ?? null,
        caption: input.caption ?? null,
        hashtags: input.hashtags ?? [],
        duration: input.duration,
        likeCount: 0,
        shareCount: 0,
        viewCount: 0,
      },
    });
  }

  async getFeed(
    _userId: string,
    options: PaginationOptions = {},
  ): Promise<PaginatedResult<ShortVideo>> {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const [data, total] = await Promise.all([
      this.prisma.shortVideo.findMany({
        where: {},
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.shortVideo.count({ where: {} }),
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

  async likeVideo(videoId: string, _userId: string): Promise<ShortVideo> {
    const video = await this.prisma.shortVideo.findUnique({
      where: { id: videoId },
    });

    if (!video) {
      throw createAppError('Short video not found', 404, 'SHORT_VIDEO_NOT_FOUND');
    }

    return this.prisma.shortVideo.update({
      where: { id: videoId },
      data: { likeCount: { increment: 1 } },
    });
  }

  async shareVideo(videoId: string, _userId: string): Promise<ShortVideo> {
    const video = await this.prisma.shortVideo.findUnique({
      where: { id: videoId },
    });

    if (!video) {
      throw createAppError('Short video not found', 404, 'SHORT_VIDEO_NOT_FOUND');
    }

    return this.prisma.shortVideo.update({
      where: { id: videoId },
      data: { shareCount: { increment: 1 } },
    });
  }

  async getHashtagFeed(
    hashtag: string,
    options: PaginationOptions = {},
  ): Promise<PaginatedResult<ShortVideo>> {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const [data, total] = await Promise.all([
      this.prisma.shortVideo.findMany({
        where: { hashtags: { has: hashtag } },
        skip,
        take: pageSize,
        orderBy: { likeCount: 'desc' },
      }),
      this.prisma.shortVideo.count({ where: { hashtags: { has: hashtag } } }),
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
