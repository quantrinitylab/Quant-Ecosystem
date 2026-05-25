import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VideoService } from '../services/video.service';

function createMockPrisma() {
  return {
    video: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
  };
}

describe('VideoService', () => {
  let service: VideoService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new VideoService(prisma as never);
  });

  describe('uploadVideo', () => {
    it('creates a video with PENDING processing status', async () => {
      const mockVideo = {
        id: 'video-1',
        userId: 'user-1',
        channelId: 'channel-1',
        title: 'My Video',
        description: null,
        videoUrl: 'https://cdn.example.com/video.mp4',
        thumbnailUrl: null,
        duration: 120,
        width: 1920,
        height: 1080,
        fileSize: BigInt(50000000),
        category: null,
        tags: [],
        visibility: 'PUBLIC',
        ageRestricted: false,
        viewCount: 0,
        likeCount: 0,
        commentCount: 0,
        processingStatus: 'PENDING',
        publishedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };
      prisma.video.create.mockResolvedValue(mockVideo);

      const result = await service.uploadVideo({
        userId: 'user-1',
        channelId: 'channel-1',
        title: 'My Video',
        videoUrl: 'https://cdn.example.com/video.mp4',
        duration: 120,
        width: 1920,
        height: 1080,
        fileSize: BigInt(50000000),
      });

      expect(result.processingStatus).toBe('PENDING');
      expect(result.viewCount).toBe(0);
      expect(prisma.video.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          channelId: 'channel-1',
          title: 'My Video',
          description: null,
          videoUrl: 'https://cdn.example.com/video.mp4',
          thumbnailUrl: null,
          duration: 120,
          width: 1920,
          height: 1080,
          fileSize: BigInt(50000000),
          category: null,
          tags: [],
          visibility: 'PUBLIC',
          ageRestricted: false,
          viewCount: 0,
          likeCount: 0,
          commentCount: 0,
          processingStatus: 'PENDING',
          publishedAt: null,
        },
      });
    });
  });

  describe('incrementView', () => {
    it('increments view count', async () => {
      prisma.video.findUnique.mockResolvedValue({
        id: 'video-1',
        viewCount: 100,
        deletedAt: null,
      });
      prisma.video.update.mockResolvedValue({
        id: 'video-1',
        viewCount: 101,
      });

      const result = await service.incrementView('video-1');

      expect(result.viewCount).toBe(101);
      expect(prisma.video.update).toHaveBeenCalledWith({
        where: { id: 'video-1' },
        data: { viewCount: { increment: 1 } },
      });
    });

    it('throws VIDEO_NOT_FOUND for deleted video', async () => {
      prisma.video.findUnique.mockResolvedValue({
        id: 'video-1',
        deletedAt: new Date(),
      });

      await expect(service.incrementView('video-1')).rejects.toThrow('Video not found');
    });

    it('throws VIDEO_NOT_FOUND for non-existent video', async () => {
      prisma.video.findUnique.mockResolvedValue(null);

      await expect(service.incrementView('missing')).rejects.toThrow('Video not found');
    });
  });

  describe('listByChannel', () => {
    it('returns paginated videos for a channel', async () => {
      const videos = [
        { id: 'video-1', title: 'First' },
        { id: 'video-2', title: 'Second' },
      ];
      prisma.video.findMany.mockResolvedValue(videos);
      prisma.video.count.mockResolvedValue(30);

      const result = await service.listByChannel('channel-1', { page: 1, pageSize: 10 });

      expect(result.data).toEqual(videos);
      expect(result.total).toBe(30);
      expect(result.totalPages).toBe(3);
      expect(result.hasNext).toBe(true);
      expect(result.hasPrev).toBe(false);
      expect(prisma.video.findMany).toHaveBeenCalledWith({
        where: { channelId: 'channel-1', deletedAt: null, visibility: 'PUBLIC' },
        skip: 0,
        take: 10,
        orderBy: { createdAt: 'desc' },
      });
    });

    it('returns last page correctly', async () => {
      prisma.video.findMany.mockResolvedValue([{ id: 'video-3' }]);
      prisma.video.count.mockResolvedValue(25);

      const result = await service.listByChannel('channel-1', { page: 3, pageSize: 10 });

      expect(result.hasNext).toBe(false);
      expect(result.hasPrev).toBe(true);
    });
  });

  describe('deleteVideo', () => {
    it('soft-deletes a video when called by owner', async () => {
      prisma.video.findUnique.mockResolvedValue({
        id: 'video-1',
        userId: 'user-1',
        deletedAt: null,
      });
      prisma.video.update.mockResolvedValue({
        id: 'video-1',
        deletedAt: expect.any(Date),
      });

      const result = await service.deleteVideo('video-1', 'user-1');

      expect(result.deletedAt).toBeDefined();
    });

    it('throws NOT_VIDEO_OWNER if different user tries to delete', async () => {
      prisma.video.findUnique.mockResolvedValue({
        id: 'video-1',
        userId: 'user-1',
        deletedAt: null,
      });

      await expect(service.deleteVideo('video-1', 'user-2')).rejects.toThrow(
        'Only the owner can delete this video',
      );
    });
  });

  describe('getVideo', () => {
    it('returns a video by id', async () => {
      const mockVideo = { id: 'video-1', title: 'Test', deletedAt: null };
      prisma.video.findUnique.mockResolvedValue(mockVideo);

      const result = await service.getVideo('video-1');

      expect(result).toEqual(mockVideo);
    });

    it('throws VIDEO_NOT_FOUND for non-existent video', async () => {
      prisma.video.findUnique.mockResolvedValue(null);

      await expect(service.getVideo('missing')).rejects.toThrow('Video not found');
    });
  });
});
