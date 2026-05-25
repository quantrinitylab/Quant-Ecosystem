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

  async subscribe(channelId: string, _userId: string): Promise<VideoChannel> {
    const channel = await this.prisma.videoChannel.findUnique({
      where: { id: channelId },
    });

    if (!channel) {
      throw createAppError('Channel not found', 404, 'CHANNEL_NOT_FOUND');
    }

    return this.prisma.videoChannel.update({
      where: { id: channelId },
      data: { subscriberCount: channel.subscriberCount + 1 },
    });
  }

  async unsubscribe(channelId: string, _userId: string): Promise<VideoChannel> {
    const channel = await this.prisma.videoChannel.findUnique({
      where: { id: channelId },
    });

    if (!channel) {
      throw createAppError('Channel not found', 404, 'CHANNEL_NOT_FOUND');
    }

    return this.prisma.videoChannel.update({
      where: { id: channelId },
      data: { subscriberCount: Math.max(0, channel.subscriberCount - 1) },
    });
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
