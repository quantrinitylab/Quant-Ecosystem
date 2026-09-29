import type { PrismaClient } from '../types';
import { createAppError } from '@quant/server-core';

export interface ShapedReel {
  id: string;
  userId: string;
  creator: string;
  creatorAvatar: string | null;
  videoUrl: string;
  thumbnailUrl: string;
  caption: string;
  soundName: string | null;
  soundId: string | null;
  duration: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  plays: number;
  isLiked: boolean;
  isFeatured: boolean;
}

export interface ShapedReelComment {
  id: string;
  reelId: string;
  userId: string;
  username: string;
  userAvatar: string | null;
  content: string;
  createdAt: Date;
}

export interface CreateReelInput {
  creatorId: string;
  videoUrl: string;
  thumbnailUrl?: string;
  caption?: string;
  soundName?: string;
  soundId?: string;
  duration?: number;
}

export interface ReelFeedOptions {
  page?: number;
  pageSize?: number;
}

export class ReelService {
  constructor(private readonly prisma: PrismaClient) {}

  private shapeReel(row: any, isLiked: boolean): ShapedReel {
    return {
      id: row.id,
      userId: row.creatorId,
      creator: row.creator?.username ?? 'unknown',
      creatorAvatar: row.creator?.avatarUrl ?? null,
      videoUrl: row.videoUrl,
      thumbnailUrl: row.thumbnailUrl ?? '',
      caption: row.caption ?? '',
      soundName: row.soundName ?? null,
      soundId: row.soundId ?? null,
      duration: row.duration ?? 0,
      likeCount: row.likeCount ?? 0,
      commentCount: row.commentCount ?? 0,
      shareCount: row.shareCount ?? 0,
      plays: row.plays ?? 0,
      isLiked,
      isFeatured: row.isFeatured ?? false,
    };
  }

  async createReel(input: CreateReelInput): Promise<ShapedReel> {
    if (!input.videoUrl) {
      throw createAppError('videoUrl is required', 400, 'VALIDATION_ERROR');
    }
    const row = await this.prisma.reel.create({
      data: {
        creatorId: input.creatorId,
        videoUrl: input.videoUrl,
        thumbnailUrl: input.thumbnailUrl ?? '',
        caption: input.caption ?? '',
        duration: input.duration ?? 15,
      },
      include: { creator: true },
    });
    return this.shapeReel(row, false);
  }

  async getReel(reelId: string, viewerId?: string): Promise<ShapedReel> {
    const row = await this.prisma.reel.findUnique({
      where: { id: reelId },
      include: { creator: true },
    });
    if (!row) {
      throw createAppError('Reel not found', 404, 'REEL_NOT_FOUND');
    }

    let isLiked = false;
    if (viewerId) {
      const like = await this.prisma.reelLike.findUnique({
        where: { reelId_userId: { reelId, userId: viewerId } },
      });
      isLiked = Boolean(like);
    }

    return this.shapeReel(row, isLiked);
  }

  async deleteReel(reelId: string, userId: string): Promise<{ deleted: boolean }> {
    const reel = await this.prisma.reel.findUnique({ where: { id: reelId } });
    if (!reel) {
      throw createAppError('Reel not found', 404, 'REEL_NOT_FOUND');
    }
    if (reel.creatorId !== userId) {
      throw createAppError('Not allowed to delete this reel', 403, 'FORBIDDEN');
    }

    // Reel has no `deletedAt` column, so this is a hard delete. The reelLike /
    // reelComment rows are removed explicitly (deleteMany) so the seam does not
    // depend on database-level cascade behavior.
    await this.prisma.$transaction(async (tx) => {
      await tx.reelLike.deleteMany({ where: { reelId } });
      await tx.reelComment.deleteMany({ where: { reelId } });
      await tx.reel.delete({ where: { id: reelId } });
    });

    return { deleted: true };
  }

  async getFeed(viewerId: string, options: ReelFeedOptions = {}): Promise<ShapedReel[]> {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const rows = await this.prisma.reel.findMany({
      include: { creator: true },
      orderBy: [{ isFeatured: 'desc' }, { likeCount: 'desc' }, { createdAt: 'desc' }],
      skip,
      take: pageSize,
    });

    const reelIds = rows.map((r: any) => r.id);
    let likedSet = new Set<string>();
    if (viewerId && reelIds.length > 0) {
      const likes = await this.prisma.reelLike.findMany({
        where: { userId: viewerId, reelId: { in: reelIds } },
      });
      likedSet = new Set(likes.map((l: any) => l.reelId));
    }

    return rows.map((r: any) => this.shapeReel(r, likedSet.has(r.id)));
  }

  async toggleLike(reelId: string, userId: string): Promise<{ liked: boolean; likeCount: number }> {
    const reel = await this.prisma.reel.findUnique({ where: { id: reelId } });
    if (!reel) {
      throw createAppError('Reel not found', 404, 'REEL_NOT_FOUND');
    }

    const existing = await this.prisma.reelLike.findUnique({
      where: { reelId_userId: { reelId, userId } },
    });

    return this.prisma.$transaction(async (tx) => {
      if (existing) {
        await tx.reelLike.delete({ where: { reelId_userId: { reelId, userId } } });
        const updated = await tx.reel.update({
          where: { id: reelId },
          data: { likeCount: { decrement: 1 } },
        });
        return { liked: false, likeCount: updated.likeCount };
      }
      await tx.reelLike.create({ data: { reelId, userId } });
      const updated = await tx.reel.update({
        where: { id: reelId },
        data: { likeCount: { increment: 1 } },
      });
      return { liked: true, likeCount: updated.likeCount };
    });
  }

  async addComment(reelId: string, userId: string, content: string): Promise<ShapedReelComment> {
    const reel = await this.prisma.reel.findUnique({ where: { id: reelId } });
    if (!reel) {
      throw createAppError('Reel not found', 404, 'REEL_NOT_FOUND');
    }

    const comment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.reelComment.create({ data: { reelId, userId, content } });
      await tx.reel.update({
        where: { id: reelId },
        data: { commentCount: { increment: 1 } },
      });
      return created;
    });

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    return {
      id: comment.id,
      reelId: comment.reelId,
      userId: comment.userId,
      username: user?.username ?? 'unknown',
      userAvatar: user?.avatarUrl ?? null,
      content: comment.content,
      createdAt: comment.createdAt,
    };
  }

  async getComments(reelId: string): Promise<ShapedReelComment[]> {
    // ReelComment has no `user` relation, so usernames are resolved by a
    // batch user lookup on the comment authors.
    const comments = await this.prisma.reelComment.findMany({
      where: { reelId },
      orderBy: { createdAt: 'asc' },
    });
    const userIds = [...new Set(comments.map((c: any) => c.userId))];
    let byId = new Map<string, any>();
    if (userIds.length > 0) {
      const users = await this.prisma.user.findMany({ where: { id: { in: userIds } } });
      byId = new Map(users.map((u: any) => [u.id, u]));
    }
    return comments.map((c: any) => {
      const u = byId.get(c.userId);
      return {
        id: c.id,
        reelId: c.reelId,
        userId: c.userId,
        username: u?.username ?? 'unknown',
        userAvatar: u?.avatarUrl ?? null,
        content: c.content,
        createdAt: c.createdAt,
      };
    });
  }
}
