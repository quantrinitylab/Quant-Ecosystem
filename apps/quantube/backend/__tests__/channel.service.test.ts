import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChannelService } from '../services/channel.service';

function createMockPrisma() {
  return {
    videoChannel: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
    video: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    videoChannelSubscription: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
  };
}

describe('ChannelService', () => {
  let service: ChannelService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new ChannelService(prisma as never);
  });

  describe('createChannel', () => {
    it('creates a channel with zero subscribers', async () => {
      const mockChannel = {
        id: 'channel-1',
        userId: 'user-1',
        name: 'My Channel',
        handle: 'mychannel',
        description: null,
        avatarUrl: null,
        bannerUrl: null,
        subscriberCount: 0,
        videoCount: 0,
        isVerified: false,
      };
      prisma.videoChannel.create.mockResolvedValue(mockChannel);

      const result = await service.createChannel({
        userId: 'user-1',
        name: 'My Channel',
        handle: 'mychannel',
      });

      expect(result.subscriberCount).toBe(0);
      expect(result.isVerified).toBe(false);
      expect(prisma.videoChannel.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          name: 'My Channel',
          handle: 'mychannel',
        }),
      });
    });
  });

  describe('getChannel', () => {
    it('returns channel by id', async () => {
      const mockChannel = { id: 'channel-1', name: 'Test' };
      prisma.videoChannel.findUnique.mockResolvedValue(mockChannel);

      const result = await service.getChannel('channel-1');

      expect(result).toEqual(mockChannel);
    });

    it('throws CHANNEL_NOT_FOUND for missing channel', async () => {
      prisma.videoChannel.findUnique.mockResolvedValue(null);

      await expect(service.getChannel('missing')).rejects.toThrow('Channel not found');
    });
  });

  describe('subscribe', () => {
    it('creates a subscription row and syncs count from real rows', async () => {
      prisma.videoChannel.findUnique.mockResolvedValue({ id: 'channel-1', subscriberCount: 10 });
      prisma.videoChannelSubscription.findUnique.mockResolvedValue(null);
      prisma.videoChannelSubscription.create.mockResolvedValue({});
      prisma.videoChannelSubscription.count.mockResolvedValue(11);
      prisma.videoChannel.update.mockResolvedValue({ id: 'channel-1', subscriberCount: 11 });

      const result = await service.subscribe('channel-1', 'user-2');

      expect(prisma.videoChannelSubscription.create).toHaveBeenCalledWith({
        data: { userId: 'user-2', channelId: 'channel-1' },
      });
      expect(prisma.videoChannel.update).toHaveBeenCalledWith({
        where: { id: 'channel-1' },
        data: { subscriberCount: 11 },
      });
      expect(result.subscriberCount).toBe(11);
    });

    it('is idempotent: already-subscribed does not create a second row', async () => {
      prisma.videoChannel.findUnique.mockResolvedValue({ id: 'channel-1', subscriberCount: 11 });
      prisma.videoChannelSubscription.findUnique.mockResolvedValue({
        id: 'sub-1',
        userId: 'user-2',
        channelId: 'channel-1',
      });
      prisma.videoChannelSubscription.count.mockResolvedValue(11);
      prisma.videoChannel.update.mockResolvedValue({ id: 'channel-1', subscriberCount: 11 });

      const result = await service.subscribe('channel-1', 'user-2');

      expect(prisma.videoChannelSubscription.create).not.toHaveBeenCalled();
      expect(result.subscriberCount).toBe(11);
    });

    it('throws when the channel does not exist', async () => {
      prisma.videoChannel.findUnique.mockResolvedValue(null);
      await expect(service.subscribe('missing', 'user-2')).rejects.toThrow();
    });
  });

  describe('unsubscribe', () => {
    it('deletes the subscription row and syncs count', async () => {
      prisma.videoChannel.findUnique.mockResolvedValue({ id: 'channel-1', subscriberCount: 10 });
      prisma.videoChannelSubscription.findUnique.mockResolvedValue({
        id: 'sub-1',
        userId: 'user-2',
        channelId: 'channel-1',
      });
      prisma.videoChannelSubscription.delete.mockResolvedValue({});
      prisma.videoChannelSubscription.count.mockResolvedValue(9);
      prisma.videoChannel.update.mockResolvedValue({ id: 'channel-1', subscriberCount: 9 });

      const result = await service.unsubscribe('channel-1', 'user-2');

      expect(prisma.videoChannelSubscription.delete).toHaveBeenCalledWith({
        where: { userId_channelId: { userId: 'user-2', channelId: 'channel-1' } },
      });
      expect(result.subscriberCount).toBe(9);
    });

    it('is idempotent: unsubscribing when not subscribed is a no-op delete', async () => {
      prisma.videoChannel.findUnique.mockResolvedValue({ id: 'channel-1', subscriberCount: 9 });
      prisma.videoChannelSubscription.findUnique.mockResolvedValue(null);
      prisma.videoChannelSubscription.count.mockResolvedValue(9);
      prisma.videoChannel.update.mockResolvedValue({ id: 'channel-1', subscriberCount: 9 });

      const result = await service.unsubscribe('channel-1', 'user-2');

      expect(prisma.videoChannelSubscription.delete).not.toHaveBeenCalled();
      expect(result.subscriberCount).toBe(9);
    });
  });

  describe('isSubscribed', () => {
    it('reflects whether a subscription row exists', async () => {
      prisma.videoChannelSubscription.findUnique.mockResolvedValueOnce({ id: 'sub-1' });
      expect(await service.isSubscribed('channel-1', 'user-2')).toBe(true);

      prisma.videoChannelSubscription.findUnique.mockResolvedValueOnce(null);
      expect(await service.isSubscribed('channel-1', 'user-3')).toBe(false);
    });
  });

  describe('getSubscribers', () => {
    it('returns subscriber count for channel', async () => {
      prisma.videoChannel.findUnique.mockResolvedValue({
        id: 'channel-1',
        subscriberCount: 1000,
      });

      const result = await service.getSubscribers('channel-1');

      expect(result.subscriberCount).toBe(1000);
    });
  });

  describe('getSubscriptions', () => {
    it('returns only the channels the user is subscribed to, in subscription order', async () => {
      prisma.videoChannelSubscription.findMany.mockResolvedValue([
        { channelId: 'channel-2' },
        { channelId: 'channel-1' },
      ]);
      prisma.videoChannelSubscription.count.mockResolvedValue(2);
      // findMany by id does not guarantee order — return reversed to prove we re-order.
      prisma.videoChannel.findMany.mockResolvedValue([
        { id: 'channel-1', name: 'Ch1' },
        { id: 'channel-2', name: 'Ch2' },
      ]);

      const result = await service.getSubscriptions('user-1');

      expect(result.total).toBe(2);
      expect(result.data.map((c) => c.id)).toEqual(['channel-2', 'channel-1']);
      expect(prisma.videoChannelSubscription.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-1' } }),
      );
    });

    it('returns an empty page when the user has no subscriptions', async () => {
      prisma.videoChannelSubscription.findMany.mockResolvedValue([]);
      prisma.videoChannelSubscription.count.mockResolvedValue(0);

      const result = await service.getSubscriptions('user-1');

      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(prisma.videoChannel.findMany).not.toHaveBeenCalled();
    });
  });

  describe('getSubscriptionFeed', () => {
    it('returns public videos from the subscribed channels, newest first', async () => {
      prisma.videoChannelSubscription.findMany.mockResolvedValue([
        { channelId: 'channel-1' },
        { channelId: 'channel-2' },
      ]);
      prisma.video.findMany.mockResolvedValue([
        { id: 'v2', channelId: 'channel-2' },
        { id: 'v1', channelId: 'channel-1' },
      ]);
      prisma.video.count.mockResolvedValue(2);

      const result = await service.getSubscriptionFeed('user-1');

      expect(result.total).toBe(2);
      expect(result.data).toHaveLength(2);
      expect(prisma.video.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            channelId: { in: ['channel-1', 'channel-2'] },
            deletedAt: null,
            visibility: 'PUBLIC',
          }),
        }),
      );
    });

    it('returns an empty feed when there are no subscriptions (no video query)', async () => {
      prisma.videoChannelSubscription.findMany.mockResolvedValue([]);

      const result = await service.getSubscriptionFeed('user-1');

      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(prisma.video.findMany).not.toHaveBeenCalled();
    });
  });
});
