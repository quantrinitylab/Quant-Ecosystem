import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ShortVideoService } from '../services/short-video.service';

function createMockPrisma() {
  return {
    shortVideo: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
  };
}

describe('ShortVideoService', () => {
  let service: ShortVideoService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new ShortVideoService(prisma as never);
  });

  describe('uploadShortVideo', () => {
    it('creates a short video with zero counts', async () => {
      prisma.shortVideo.create.mockResolvedValue({
        id: 'sv-1',
        userId: 'user-1',
        videoUrl: 'https://cdn.example.com/short.mp4',
        caption: 'Fun video',
        hashtags: ['fun'],
        likeCount: 0,
        shareCount: 0,
        viewCount: 0,
      });

      const result = await service.uploadShortVideo({
        userId: 'user-1',
        videoUrl: 'https://cdn.example.com/short.mp4',
        caption: 'Fun video',
        hashtags: ['fun'],
        duration: 15,
      });

      expect(result.likeCount).toBe(0);
      expect(result.shareCount).toBe(0);
      expect(prisma.shortVideo.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          videoUrl: 'https://cdn.example.com/short.mp4',
          caption: 'Fun video',
          hashtags: ['fun'],
          duration: 15,
        }),
      });
    });
  });

  describe('getFeed', () => {
    it('returns paginated short video feed', async () => {
      prisma.shortVideo.findMany.mockResolvedValue([{ id: 'sv-1' }, { id: 'sv-2' }]);
      prisma.shortVideo.count.mockResolvedValue(50);

      const result = await service.getFeed('user-1', { page: 1, pageSize: 20 });

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(50);
      expect(result.hasNext).toBe(true);
    });
  });

  describe('likeVideo', () => {
    it('increments like count', async () => {
      prisma.shortVideo.findUnique.mockResolvedValue({ id: 'sv-1', likeCount: 5 });
      prisma.shortVideo.update.mockResolvedValue({ id: 'sv-1', likeCount: 6 });

      const result = await service.likeVideo('sv-1', 'user-1');

      expect(result.likeCount).toBe(6);
    });

    it('throws SHORT_VIDEO_NOT_FOUND for missing video', async () => {
      prisma.shortVideo.findUnique.mockResolvedValue(null);

      await expect(service.likeVideo('sv-missing', 'user-1')).rejects.toThrow(
        'Short video not found',
      );
    });
  });

  describe('shareVideo', () => {
    it('increments share count', async () => {
      prisma.shortVideo.findUnique.mockResolvedValue({ id: 'sv-1', shareCount: 2 });
      prisma.shortVideo.update.mockResolvedValue({ id: 'sv-1', shareCount: 3 });

      const result = await service.shareVideo('sv-1', 'user-1');

      expect(result.shareCount).toBe(3);
    });

    it('throws SHORT_VIDEO_NOT_FOUND for missing video', async () => {
      prisma.shortVideo.findUnique.mockResolvedValue(null);

      await expect(service.shareVideo('sv-missing', 'user-1')).rejects.toThrow(
        'Short video not found',
      );
    });
  });

  describe('getHashtagFeed', () => {
    it('returns videos matching a hashtag', async () => {
      prisma.shortVideo.findMany.mockResolvedValue([{ id: 'sv-1', hashtags: ['dance'] }]);
      prisma.shortVideo.count.mockResolvedValue(1);

      const result = await service.getHashtagFeed('dance', { page: 1, pageSize: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });
});
