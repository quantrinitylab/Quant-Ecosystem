import type { PrismaClient } from '../types';
import { createAppError } from '@quant/server-core';

export interface Video {
  id: string;
  userId: string;
  channelId: string;
  title: string;
  description: string | null;
  videoUrl: string;
  thumbnailUrl: string | null;
  duration: number;
  width: number;
  height: number;
  fileSize: bigint;
  category: string | null;
  tags: unknown;
  visibility: string;
  ageRestricted: boolean;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  processingStatus: string;
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

export interface UploadVideoInput {
  userId: string;
  channelId: string;
  title: string;
  description?: string;
  videoUrl: string;
  thumbnailUrl?: string;
  duration: number;
  width: number;
  height: number;
  fileSize: bigint;
  category?: string;
  tags?: string[];
  visibility?: string;
}

export interface UpdateVideoInput {
  title?: string;
  description?: string;
  thumbnailUrl?: string;
  category?: string;
  tags?: string[];
  visibility?: string;
}

export class VideoService {
  constructor(private readonly prisma: PrismaClient) {}

  async uploadVideo(input: UploadVideoInput): Promise<Video> {
    return this.prisma.video.create({
      data: {
        userId: input.userId,
        channelId: input.channelId,
        title: input.title,
        description: input.description ?? null,
        videoUrl: input.videoUrl,
        thumbnailUrl: input.thumbnailUrl ?? null,
        duration: input.duration,
        width: input.width,
        height: input.height,
        fileSize: input.fileSize,
        category: input.category ?? null,
        tags: input.tags ?? [],
        visibility: input.visibility ?? 'PUBLIC',
        ageRestricted: false,
        viewCount: 0,
        likeCount: 0,
        commentCount: 0,
        processingStatus: 'PENDING',
        publishedAt: null,
      },
    });
  }

  async getVideo(videoId: string): Promise<Video> {
    const video = await this.prisma.video.findUnique({
      where: { id: videoId },
    });

    if (!video || video.deletedAt) {
      throw createAppError('Video not found', 404, 'VIDEO_NOT_FOUND');
    }

    return video;
  }

  async listByChannel(
    channelId: string,
    options: PaginationOptions = {},
  ): Promise<PaginatedResult<Video>> {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const [data, total] = await Promise.all([
      this.prisma.video.findMany({
        where: { channelId, deletedAt: null, visibility: 'PUBLIC' },
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.video.count({
        where: { channelId, deletedAt: null, visibility: 'PUBLIC' },
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

  async listByUser(
    userId: string,
    options: PaginationOptions = {},
  ): Promise<PaginatedResult<Video>> {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const [data, total] = await Promise.all([
      this.prisma.video.findMany({
        where: { userId, deletedAt: null },
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.video.count({ where: { userId, deletedAt: null } }),
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

  async updateVideo(videoId: string, userId: string, input: UpdateVideoInput): Promise<Video> {
    const video = await this.prisma.video.findUnique({
      where: { id: videoId },
    });

    if (!video || video.deletedAt) {
      throw createAppError('Video not found', 404, 'VIDEO_NOT_FOUND');
    }

    if (video.userId !== userId) {
      throw createAppError('Only the owner can update this video', 403, 'NOT_VIDEO_OWNER');
    }

    return this.prisma.video.update({
      where: { id: videoId },
      data: { ...input, updatedAt: new Date() },
    });
  }

  async deleteVideo(videoId: string, userId: string): Promise<Video> {
    const video = await this.prisma.video.findUnique({
      where: { id: videoId },
    });

    if (!video || video.deletedAt) {
      throw createAppError('Video not found', 404, 'VIDEO_NOT_FOUND');
    }

    if (video.userId !== userId) {
      throw createAppError('Only the owner can delete this video', 403, 'NOT_VIDEO_OWNER');
    }

    return this.prisma.video.update({
      where: { id: videoId },
      data: { deletedAt: new Date() },
    });
  }

  async incrementView(videoId: string): Promise<Video> {
    const video = await this.prisma.video.findUnique({
      where: { id: videoId },
    });

    if (!video || video.deletedAt) {
      throw createAppError('Video not found', 404, 'VIDEO_NOT_FOUND');
    }

    return this.prisma.video.update({
      where: { id: videoId },
      data: { viewCount: { increment: 1 } },
    });
  }

  async search(query: string, options: PaginationOptions = {}): Promise<PaginatedResult<Video>> {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const [data, total] = await Promise.all([
      this.prisma.video.findMany({
        where: {
          deletedAt: null,
          visibility: 'PUBLIC',
          title: { contains: query },
        },
        skip,
        take: pageSize,
        orderBy: { viewCount: 'desc' },
      }),
      this.prisma.video.count({
        where: {
          deletedAt: null,
          visibility: 'PUBLIC',
          title: { contains: query },
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
