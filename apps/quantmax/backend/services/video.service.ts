// ============================================================================
// QuantMax - Short Video Service (TikTok-style)
// ============================================================================
//
// Create / fetch / feed / like for QuantMax short videos. Backed by the
// ShortVideo model + an idempotent ShortVideoLike join so likes can be toggled
// and counted without double-counting (likeCount kept in sync).

import { createAppError } from '@quant/server-core';
import type { PrismaClient } from '../types';

export interface CreateVideoInput {
  userId: string;
  videoUrl: string;
  thumbnailUrl?: string;
  caption?: string;
  duration?: number;
  soundId?: string;
  hashtags?: string[];
}

export interface PublicVideo {
  id: string;
  userId: string;
  videoUrl: string;
  thumbnailUrl: string | null;
  caption: string | null;
  duration: number;
  soundId: string | null;
  hashtags: string[];
  viewCount: number;
  likeCount: number;
  shareCount: number;
  commentCount: number;
  createdAt: Date;
}

export interface VideoFeedPage {
  videos: PublicVideo[];
  page: number;
  pageSize: number;
}

export class VideoNotFoundError extends Error {
  constructor() {
    super('Video not found');
    this.name = 'VideoNotFoundError';
  }
}

export class VideoValidationError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'VideoValidationError';
  }
}

const MAX_CAPTION = 2200;
const MAX_DURATION = 600; // 10 min hard cap

export class VideoService {
  constructor(private readonly prisma: PrismaClient) {}

  async createVideo(input: CreateVideoInput): Promise<PublicVideo> {
    const videoUrl = input.videoUrl?.trim();
    if (!videoUrl) throw new VideoValidationError('videoUrl is required');
    if (!/^https?:\/\//.test(videoUrl) && !videoUrl.startsWith('/')) {
      throw new VideoValidationError('videoUrl must be an http(s) or absolute path URL');
    }
    if (input.caption && input.caption.length > MAX_CAPTION) {
      throw new VideoValidationError('caption too long');
    }
    const duration = input.duration ?? 0;
    if (duration < 0 || duration > MAX_DURATION) {
      throw new VideoValidationError('duration out of range');
    }

    const row = await this.prisma.shortVideo.create({
      data: {
        userId: input.userId,
        videoUrl,
        thumbnailUrl: input.thumbnailUrl ?? null,
        caption: input.caption ?? null,
        duration,
        soundId: input.soundId ?? null,
        hashtags: input.hashtags ?? [],
        viewCount: 0,
        likeCount: 0,
        shareCount: 0,
        commentCount: 0,
      },
    });
    return this.toPublic(row);
  }

  /** Fetch a video and count the fetch as a view (TikTok-style). */
  async getVideo(id: string): Promise<PublicVideo> {
    const row = await this.prisma.shortVideo.findUnique({ where: { id } });
    if (!row || row.deletedAt) throw new VideoNotFoundError();
    const updated = await this.prisma.shortVideo.update({
      where: { id },
      data: { viewCount: (row.viewCount ?? 0) + 1 },
    });
    return this.toPublic(updated);
  }

  async listFeed(options: { page?: number; pageSize?: number } = {}): Promise<VideoFeedPage> {
    const page = options.page ?? 1;
    const pageSize = Math.min(options.pageSize ?? 10, 50);
    const rows = await this.prisma.shortVideo.findMany({
      where: { deletedAt: null },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    });
    return { videos: rows.map((r) => this.toPublic(r)), page, pageSize };
  }

  /**
   * List a single creator's videos, newest-first and paginated. Soft-deleted
   * rows are excluded. Returns the same `PublicVideo` shape as getVideo/listFeed.
   */
  async listByUser(
    userId: string,
    options: { page?: number; pageSize?: number } = {},
  ): Promise<VideoFeedPage> {
    const page = Math.max(options.page ?? 1, 1);
    const pageSize = Math.min(Math.max(options.pageSize ?? 10, 1), 50);
    const rows = await this.prisma.shortVideo.findMany({
      where: { userId, deletedAt: null },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    });
    return { videos: rows.map((r) => this.toPublic(r)), page, pageSize };
  }

  /**
   * Soft-delete a video. Only the owner may delete it.
   *   - 404 if the video is missing or already soft-deleted.
   *   - 403 if the caller is not the owner.
   * Idempotent from the caller's perspective: a second delete returns 404.
   */
  async deleteVideo(videoId: string, userId: string): Promise<{ deleted: true }> {
    const row = await this.prisma.shortVideo.findUnique({ where: { id: videoId } });
    if (!row || row.deletedAt) {
      throw createAppError('Video not found', 404, 'NOT_FOUND');
    }
    if (String(row.userId) !== userId) {
      throw createAppError('You can only delete your own videos', 403, 'FORBIDDEN');
    }
    await this.prisma.shortVideo.update({
      where: { id: videoId },
      data: { deletedAt: new Date() },
    });
    return { deleted: true };
  }

  /** Toggle the caller's like; returns the new state + count. */
  async toggleLike(
    userId: string,
    videoId: string,
  ): Promise<{ liked: boolean; likeCount: number }> {
    const video = await this.prisma.shortVideo.findUnique({ where: { id: videoId } });
    if (!video || video.deletedAt) throw new VideoNotFoundError();

    const existing = await this.prisma.shortVideoLike.findUnique({
      where: { userId_shortVideoId: { userId, shortVideoId: videoId } },
    });

    let liked: boolean;
    if (existing) {
      await this.prisma.shortVideoLike.delete({
        where: { userId_shortVideoId: { userId, shortVideoId: videoId } },
      });
      liked = false;
    } else {
      await this.prisma.shortVideoLike.create({ data: { userId, shortVideoId: videoId } });
      liked = true;
    }

    const likeCount = await this.prisma.shortVideoLike.count({ where: { shortVideoId: videoId } });
    await this.prisma.shortVideo.update({ where: { id: videoId }, data: { likeCount } });
    return { liked, likeCount };
  }

  private toPublic(row: Record<string, any>): PublicVideo {
    return {
      id: String(row.id),
      userId: String(row.userId),
      videoUrl: String(row.videoUrl),
      thumbnailUrl: row.thumbnailUrl ?? null,
      caption: row.caption ?? null,
      duration: Number(row.duration ?? 0),
      soundId: row.soundId ?? null,
      hashtags: Array.isArray(row.hashtags) ? (row.hashtags as string[]) : [],
      viewCount: Number(row.viewCount ?? 0),
      likeCount: Number(row.likeCount ?? 0),
      shareCount: Number(row.shareCount ?? 0),
      commentCount: Number(row.commentCount ?? 0),
      createdAt: (row.createdAt as Date) ?? new Date(),
    };
  }
}
