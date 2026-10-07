import type { PrismaClient } from '../types';
import { createAppError } from '@quant/server-core';

export interface VideoChannel {
  id: string;
  userId: string;
  name: string;
  handle: string;
  description: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  subscriberCount: number;
  videoCount: number;
  isVerified: boolean;
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

export interface CreateChannelInput {
  userId: string;
  name: string;
  handle: string;
  description?: string;
  avatarUrl?: string;
  bannerUrl?: string;
}

export interface UpdateChannelInput {
  name?: string;
  description?: string;
  avatarUrl?: string;
  bannerUrl?: string;
}

export interface ChannelStats {
  subscriberCount: number;
  videoCount: number;
  totalViews: number;
}

export class ChannelService {
  constructor(private readonly prisma: PrismaClient) {}

  async createChannel(input: CreateChannelInput): Promise<VideoChannel> {
    return this.prisma.videoChannel.create({
      data: {
        userId: input.userId,
        name: input.name,
        handle: input.handle,
        description: input.description ?? null,
        avatarUrl: input.avatarUrl ?? null,
        bannerUrl: input.bannerUrl ?? null,
        subscriberCount: 0,
        videoCount: 0,
        isVerified: false,
      },
    });
  }

  async getChannel(channelId: string): Promise<VideoChannel> {
    const channel = await this.prisma.videoChannel.findUnique({
      where: { id: channelId },
    });

    if (!channel) {
      throw createAppError('Channel not found', 404, 'CHANNEL_NOT_FOUND');
    }

    return channel;
  }

  async updateChannel(
    channelId: string,
    userId: string,
    input: UpdateChannelInput,
  ): Promise<VideoChannel> {
    const channel = await this.prisma.videoChannel.findUnique({
      where: { id: channelId },
    });

    if (!channel) {
      throw createAppError('Channel not found', 404, 'CHANNEL_NOT_FOUND');
    }

    if (channel.userId !== userId) {
      throw createAppError('Only the owner can update this channel', 403, 'NOT_CHANNEL_OWNER');
    }

    return this.prisma.videoChannel.update({
      where: { id: channelId },
      data: input,
    });
  }

  /**
   * Subscribe the user to a channel. Idempotent: a user who is already
   * subscribed stays subscribed (no double-counting). The channel's
   * `subscriberCount` is recomputed from the real subscription rows so it can
   * never drift from the actual number of distinct subscribers.
   */
  async subscribe(channelId: string, userId: string): Promise<VideoChannel> {
    const channel = await this.prisma.videoChannel.findUnique({
      where: { id: channelId },
    });

    if (!channel) {
      throw createAppError('Channel not found', 404, 'CHANNEL_NOT_FOUND');
    }

    const existing = await this.prisma.videoChannelSubscription.findUnique({
      where: { userId_channelId: { userId, channelId } },
    });

    if (!existing) {
      await this.prisma.videoChannelSubscription.create({
        data: { userId, channelId },
      });
    }

    const subscriberCount = await this.prisma.videoChannelSubscription.count({
      where: { channelId },
    });

    return this.prisma.videoChannel.update({
      where: { id: channelId },
      data: { subscriberCount },
    });
  }

  /**
   * Unsubscribe the user. Idempotent: unsubscribing when not subscribed is a
   * no-op. `subscriberCount` is recomputed from the real subscription rows.
   */
  async unsubscribe(channelId: string, userId: string): Promise<VideoChannel> {
    const channel = await this.prisma.videoChannel.findUnique({
      where: { id: channelId },
    });

    if (!channel) {
      throw createAppError('Channel not found', 404, 'CHANNEL_NOT_FOUND');
    }

    const existing = await this.prisma.videoChannelSubscription.findUnique({
      where: { userId_channelId: { userId, channelId } },
    });

    if (existing) {
      await this.prisma.videoChannelSubscription.delete({
        where: { userId_channelId: { userId, channelId } },
      });
    }

    const subscriberCount = await this.prisma.videoChannelSubscription.count({
      where: { channelId },
    });

    return this.prisma.videoChannel.update({
      where: { id: channelId },
      data: { subscriberCount },
    });
  }

  /** Whether the given user is subscribed to the given channel. */
  async isSubscribed(channelId: string, userId: string): Promise<boolean> {
    const existing = await this.prisma.videoChannelSubscription.findUnique({
      where: { userId_channelId: { userId, channelId } },
    });
    return Boolean(existing);
  }

  async getSubscribers(
    channelId: string,
    _options: PaginationOptions = {},
  ): Promise<{ channelId: string; subscriberCount: number }> {
    const channel = await this.prisma.videoChannel.findUnique({
      where: { id: channelId },
    });

    if (!channel) {
      throw createAppError('Channel not found', 404, 'CHANNEL_NOT_FOUND');
    }

    return { channelId, subscriberCount: channel.subscriberCount };
  }

  /**
   * The channels the given user is actually subscribed to (real, user-scoped),
   * newest subscription first. Subscription order is preserved.
   */
  async getSubscriptions(
    userId: string,
    options: PaginationOptions = {},
  ): Promise<PaginatedResult<VideoChannel>> {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const [subs, total] = await Promise.all([
      this.prisma.videoChannelSubscription.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.videoChannelSubscription.count({ where: { userId } }),
    ]);

    const channelIds = subs.map((s: { channelId: string }) => s.channelId);
    const channels: VideoChannel[] = channelIds.length
      ? await this.prisma.videoChannel.findMany({ where: { id: { in: channelIds } } })
      : [];

    // Preserve the subscription order (findMany by id does not guarantee order).
    const byId = new Map<string, VideoChannel>(channels.map((c) => [c.id, c]));
    const data = channelIds
      .map((id: string) => byId.get(id))
      .filter((c: VideoChannel | undefined): c is VideoChannel => Boolean(c));

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

  /**
   * The "Subscriptions" home feed: public, non-deleted videos from every
   * channel the user is subscribed to, newest first. Empty when the user has
   * no subscriptions.
   */
  async getSubscriptionFeed(
    userId: string,
    options: PaginationOptions = {},
  ): Promise<PaginatedResult<unknown>> {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const subs = await this.prisma.videoChannelSubscription.findMany({
      where: { userId },
    });
    const channelIds = subs.map((s: { channelId: string }) => s.channelId);

    if (channelIds.length === 0) {
      return {
        data: [],
        total: 0,
        page,
        pageSize,
        totalPages: 0,
        hasNext: false,
        hasPrev: false,
      };
    }

    const where = {
      channelId: { in: channelIds },
      deletedAt: null,
      visibility: 'PUBLIC',
    };

    const [data, total] = await Promise.all([
      this.prisma.video.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
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

  async getChannelStats(channelId: string): Promise<ChannelStats> {
    const channel = await this.prisma.videoChannel.findUnique({
      where: { id: channelId },
    });

    if (!channel) {
      throw createAppError('Channel not found', 404, 'CHANNEL_NOT_FOUND');
    }

    // Sum up view counts for all channel videos
    const videos = await this.prisma.video.findMany({
      where: { channelId, deletedAt: null },
      select: { viewCount: true },
    });

    const totalViews = videos.reduce(
      (sum: number, v: { viewCount: number }) => sum + v.viewCount,
      0,
    );

    return {
      subscriberCount: channel.subscriberCount,
      videoCount: channel.videoCount,
      totalViews,
    };
  }
}
