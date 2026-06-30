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

export interface VideoComment {
  id: string;
  videoId: string;
  userId: string;
  content: string;
  createdAt: Date;
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

/** Small success envelope returned by {@link VideoService.deleteVideo}. */
export interface DeleteVideoResult {
  success: true;
  videoId: string;
  deletedAt: Date;
}

export type VideoProcessingStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

/** All valid VideoProcessingStatus values (mirrors the Prisma enum). */
export const VIDEO_PROCESSING_STATUSES: readonly VideoProcessingStatus[] = [
  'PENDING',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
];

/**
 * Monotonic processing lifecycle. A video may only move forward:
 *   PENDING -> PROCESSING -> COMPLETED
 * and may fail from any non-terminal state:
 *   PENDING -> FAILED, PROCESSING -> FAILED
 * COMPLETED and FAILED are terminal — no transitions out of them.
 */
const PROCESSING_TRANSITIONS: Record<VideoProcessingStatus, readonly VideoProcessingStatus[]> = {
  PENDING: ['PROCESSING', 'FAILED'],
  PROCESSING: ['COMPLETED', 'FAILED'],
  COMPLETED: [],
  FAILED: [],
};

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

  /**
   * Advance a video through its processing lifecycle. Owner-only.
   *
   * The lifecycle is monotonic (PENDING -> PROCESSING -> COMPLETED) with a
   * failure escape hatch from any non-terminal state. Illegal transitions
   * (e.g. out of a terminal COMPLETED/FAILED state, or skipping straight from
   * PENDING to COMPLETED) are rejected. When a video reaches COMPLETED it is
   * published: `publishedAt` is stamped once and never overwritten on later
   * (re-)completions.
   */
  async setProcessingStatus(videoId: string, userId: string, status: string): Promise<Video> {
    const video = await this.prisma.video.findUnique({
      where: { id: videoId },
    });

    if (!video || video.deletedAt) {
      throw createAppError('Video not found', 404, 'VIDEO_NOT_FOUND');
    }

    if (video.userId !== userId) {
      throw createAppError('Only the owner can change processing status', 403, 'NOT_VIDEO_OWNER');
    }

    if (!VIDEO_PROCESSING_STATUSES.includes(status as VideoProcessingStatus)) {
      throw createAppError('Invalid processing status', 400, 'INVALID_PROCESSING_STATUS');
    }

    const next = status as VideoProcessingStatus;
    const current = video.processingStatus as VideoProcessingStatus;
    const allowed = PROCESSING_TRANSITIONS[current] ?? [];
    if (!allowed.includes(next)) {
      throw createAppError(
        `Cannot transition processing status from ${current} to ${next}`,
        409,
        'INVALID_PROCESSING_TRANSITION',
      );
    }

    const data: Record<string, unknown> = {
      processingStatus: next,
      updatedAt: new Date(),
    };
    // Publish on completion, but only stamp publishedAt the first time.
    if (next === 'COMPLETED' && !video.publishedAt) {
      data.publishedAt = new Date();
    }

    return this.prisma.video.update({
      where: { id: videoId },
      data,
    });
  }

  /**
   * Soft-delete a video. Owner-only.
   *
   * A missing video — or one that is already soft-deleted (`deletedAt` set) —
   * is reported as not found, so deletes are idempotent and never resurrect or
   * double-count. Only the owner may delete (mirrors `updateVideo` /
   * `setProcessingStatus`). On success the video's `deletedAt` is stamped and,
   * if it belongs to a channel, that channel's `videoCount` is decremented and
   * clamped at 0 so a drifted counter can never go negative.
   */
  async deleteVideo(videoId: string, userId: string): Promise<DeleteVideoResult> {
    const video = await this.prisma.video.findUnique({
      where: { id: videoId },
    });

    if (!video || video.deletedAt) {
      throw createAppError('Video not found', 404, 'VIDEO_NOT_FOUND');
    }

    if (video.userId !== userId) {
      throw createAppError('Only the owner can delete this video', 403, 'NOT_VIDEO_OWNER');
    }

    const deletedAt = new Date();
    await this.prisma.video.update({
      where: { id: videoId },
      data: { deletedAt },
    });

    // Keep the owning channel's videoCount in sync with the soft-delete.
    // Clamp at 0 so the counter can never go negative even if it has drifted.
    if (video.channelId) {
      const channel = await this.prisma.videoChannel.findUnique({
        where: { id: video.channelId },
      });
      if (channel) {
        await this.prisma.videoChannel.update({
          where: { id: video.channelId },
          data: { videoCount: Math.max(0, (channel.videoCount ?? 0) - 1) },
        });
      }
    }

    return { success: true, videoId, deletedAt };
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

  /**
   * Toggle the user's like on a video. Idempotent + backed by VideoLike
   * (unique per user/video), so a user can never inflate the count by liking
   * repeatedly. `likeCount` is recomputed from the real rows.
   */
  async likeVideo(videoId: string, userId: string): Promise<{ liked: boolean; likeCount: number }> {
    const video = await this.prisma.video.findUnique({
      where: { id: videoId },
    });

    if (!video || video.deletedAt) {
      throw createAppError('Video not found', 404, 'VIDEO_NOT_FOUND');
    }

    const existing = await this.prisma.videoLike.findUnique({
      where: { userId_videoId: { userId, videoId } },
    });

    let liked: boolean;
    if (existing) {
      await this.prisma.videoLike.delete({
        where: { userId_videoId: { userId, videoId } },
      });
      liked = false;
    } else {
      await this.prisma.videoLike.create({ data: { userId, videoId } });
      liked = true;
    }

    const likeCount = await this.prisma.videoLike.count({ where: { videoId } });
    await this.prisma.video.update({
      where: { id: videoId },
      data: { likeCount },
    });

    return { liked, likeCount };
  }

  /**
   * Persist a real comment on a video. Previously the comment text was thrown
   * away and only a counter was bumped — comments never existed. Now the
   * content is stored (validated non-empty) and `commentCount` is kept in sync.
   */
  async addComment(videoId: string, userId: string, content: string): Promise<VideoComment> {
    const trimmed = content.trim();
    if (trimmed.length === 0) {
      throw createAppError('Comment content is required', 400, 'INVALID_COMMENT');
    }
    if (trimmed.length > 10000) {
      throw createAppError('Comment is too long', 400, 'COMMENT_TOO_LONG');
    }

    const video = await this.prisma.video.findUnique({
      where: { id: videoId },
    });

    if (!video || video.deletedAt) {
      throw createAppError('Video not found', 404, 'VIDEO_NOT_FOUND');
    }

    const comment = await this.prisma.videoComment.create({
      data: { videoId, userId, content: trimmed },
    });

    const commentCount = await this.prisma.videoComment.count({ where: { videoId } });
    await this.prisma.video.update({
      where: { id: videoId },
      data: { commentCount },
    });

    return comment;
  }

  /** Paginated comments on a video, newest first. */
  async listComments(
    videoId: string,
    options: PaginationOptions = {},
  ): Promise<PaginatedResult<VideoComment>> {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const [data, total] = await Promise.all([
      this.prisma.videoComment.findMany({
        where: { videoId },
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.videoComment.count({ where: { videoId } }),
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

  async search(query: string, options: PaginationOptions = {}): Promise<PaginatedResult<Video>> {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const trimmed = query.trim();
    if (trimmed.length === 0) {
      return { data: [], total: 0, page, pageSize, totalPages: 0, hasNext: false, hasPrev: false };
    }

    // Match the query against title OR description, case-insensitively, over
    // public, non-deleted videos. Ranked by view count (most-watched first).
    const where = {
      deletedAt: null,
      visibility: 'PUBLIC',
      OR: [
        { title: { contains: trimmed, mode: 'insensitive' } },
        { description: { contains: trimmed, mode: 'insensitive' } },
      ],
    };

    const [data, total] = await Promise.all([
      this.prisma.video.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { viewCount: 'desc' },
      }),
      this.prisma.video.count({ where }),
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
