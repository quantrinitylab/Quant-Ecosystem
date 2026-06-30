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
    videoLike: {
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    videoComment: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    videoChannel: {
      findUnique: vi.fn(),
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
    it('soft-deletes a video and decrements the channel videoCount when called by owner', async () => {
      prisma.video.findUnique.mockResolvedValue({
        id: 'video-1',
        userId: 'user-1',
        channelId: 'channel-1',
        deletedAt: null,
      });
      prisma.video.update.mockResolvedValue({});
      prisma.videoChannel.findUnique.mockResolvedValue({
        id: 'channel-1',
        videoCount: 5,
      });
      prisma.videoChannel.update.mockResolvedValue({});

      const result = await service.deleteVideo('video-1', 'user-1');

      expect(result).toEqual({
        success: true,
        videoId: 'video-1',
        deletedAt: expect.any(Date),
      });
      // Soft delete: deletedAt stamped, row not removed.
      expect(prisma.video.update).toHaveBeenCalledWith({
        where: { id: 'video-1' },
        data: { deletedAt: expect.any(Date) },
      });
      // Channel videoCount decremented by one.
      expect(prisma.videoChannel.update).toHaveBeenCalledWith({
        where: { id: 'channel-1' },
        data: { videoCount: 4 },
      });
    });

    it('clamps the channel videoCount at 0 (never negative)', async () => {
      prisma.video.findUnique.mockResolvedValue({
        id: 'video-1',
        userId: 'user-1',
        channelId: 'channel-1',
        deletedAt: null,
      });
      prisma.video.update.mockResolvedValue({});
      prisma.videoChannel.findUnique.mockResolvedValue({
        id: 'channel-1',
        videoCount: 0,
      });
      prisma.videoChannel.update.mockResolvedValue({});

      await service.deleteVideo('video-1', 'user-1');

      expect(prisma.videoChannel.update).toHaveBeenCalledWith({
        where: { id: 'channel-1' },
        data: { videoCount: 0 },
      });
    });

    it('throws NOT_VIDEO_OWNER if a different user tries to delete', async () => {
      prisma.video.findUnique.mockResolvedValue({
        id: 'video-1',
        userId: 'user-1',
        channelId: 'channel-1',
        deletedAt: null,
      });

      await expect(service.deleteVideo('video-1', 'user-2')).rejects.toThrow(
        'Only the owner can delete this video',
      );
      // No mutation on a forbidden delete.
      expect(prisma.video.update).not.toHaveBeenCalled();
      expect(prisma.videoChannel.update).not.toHaveBeenCalled();
    });

    it('throws VIDEO_NOT_FOUND for a non-existent video', async () => {
      prisma.video.findUnique.mockResolvedValue(null);

      await expect(service.deleteVideo('missing', 'user-1')).rejects.toThrow('Video not found');
      expect(prisma.video.update).not.toHaveBeenCalled();
    });

    it('throws VIDEO_NOT_FOUND for an already-deleted video (idempotent guard)', async () => {
      prisma.video.findUnique.mockResolvedValue({
        id: 'video-1',
        userId: 'user-1',
        channelId: 'channel-1',
        deletedAt: new Date(),
      });

      await expect(service.deleteVideo('video-1', 'user-1')).rejects.toThrow('Video not found');
      expect(prisma.video.update).not.toHaveBeenCalled();
      expect(prisma.videoChannel.update).not.toHaveBeenCalled();
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

  describe('search', () => {
    it('matches title OR description (case-insensitive) over public, non-deleted videos', async () => {
      prisma.video.findMany.mockResolvedValue([{ id: 'v1', title: 'Cooking Pasta' }]);
      prisma.video.count.mockResolvedValue(1);

      const result = await service.search('pasta', { page: 1, pageSize: 20 });

      expect(result.total).toBe(1);
      expect(result.data).toHaveLength(1);
      expect(prisma.video.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deletedAt: null,
            visibility: 'PUBLIC',
            OR: [
              { title: { contains: 'pasta', mode: 'insensitive' } },
              { description: { contains: 'pasta', mode: 'insensitive' } },
            ],
          }),
          orderBy: { viewCount: 'desc' },
        }),
      );
    });

    it('trims the query before matching', async () => {
      prisma.video.findMany.mockResolvedValue([]);
      prisma.video.count.mockResolvedValue(0);

      await service.search('  pasta  ');

      expect(prisma.video.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { title: { contains: 'pasta', mode: 'insensitive' } },
              { description: { contains: 'pasta', mode: 'insensitive' } },
            ],
          }),
        }),
      );
    });

    it('returns an empty page for a blank query without querying the DB', async () => {
      const result = await service.search('   ');

      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(prisma.video.findMany).not.toHaveBeenCalled();
      expect(prisma.video.count).not.toHaveBeenCalled();
    });

    it('reports pagination metadata', async () => {
      prisma.video.findMany.mockResolvedValue([{ id: 'v1' }]);
      prisma.video.count.mockResolvedValue(45);

      const result = await service.search('quant', { page: 2, pageSize: 20 });

      expect(result.page).toBe(2);
      expect(result.totalPages).toBe(3);
      expect(result.hasNext).toBe(true);
      expect(result.hasPrev).toBe(true);
    });
  });

  describe('likeVideo', () => {
    it('toggles a like on/off and recomputes likeCount from real rows', async () => {
      prisma.video.findUnique.mockResolvedValue({ id: 'v1', deletedAt: null });
      prisma.videoLike.findUnique.mockResolvedValueOnce(null);
      prisma.videoLike.create.mockResolvedValue({});
      prisma.videoLike.count.mockResolvedValueOnce(1);
      prisma.video.update.mockResolvedValue({});

      const first = await service.likeVideo('v1', 'user-1');
      expect(first).toEqual({ liked: true, likeCount: 1 });
      expect(prisma.videoLike.create).toHaveBeenCalledWith({
        data: { userId: 'user-1', videoId: 'v1' },
      });

      prisma.videoLike.findUnique.mockResolvedValueOnce({ id: 'l1' });
      prisma.videoLike.count.mockResolvedValueOnce(0);
      const second = await service.likeVideo('v1', 'user-1');
      expect(second).toEqual({ liked: false, likeCount: 0 });
      expect(prisma.videoLike.delete).toHaveBeenCalled();
    });

    it('counts likes from distinct users (no inflation)', async () => {
      prisma.video.findUnique.mockResolvedValue({ id: 'v1', deletedAt: null });
      prisma.videoLike.findUnique.mockResolvedValue(null);
      prisma.videoLike.create.mockResolvedValue({});
      prisma.videoLike.count.mockResolvedValueOnce(2);
      prisma.video.update.mockResolvedValue({});

      const r = await service.likeVideo('v1', 'user-2');
      expect(r.likeCount).toBe(2);
    });

    it('throws for a missing/deleted video', async () => {
      prisma.video.findUnique.mockResolvedValue(null);
      await expect(service.likeVideo('missing', 'user-1')).rejects.toThrow('Video not found');
    });
  });

  describe('addComment', () => {
    it('persists the comment content and syncs commentCount', async () => {
      prisma.video.findUnique.mockResolvedValue({ id: 'v1', deletedAt: null });
      prisma.videoComment.create.mockResolvedValue({
        id: 'c1',
        videoId: 'v1',
        userId: 'user-1',
        content: 'great video',
      });
      prisma.videoComment.count.mockResolvedValue(1);
      prisma.video.update.mockResolvedValue({});

      const comment = await service.addComment('v1', 'user-1', '  great video  ');

      expect(prisma.videoComment.create).toHaveBeenCalledWith({
        data: { videoId: 'v1', userId: 'user-1', content: 'great video' },
      });
      expect(prisma.video.update).toHaveBeenCalledWith({
        where: { id: 'v1' },
        data: { commentCount: 1 },
      });
      expect(comment.content).toBe('great video');
    });

    it('rejects an empty/whitespace comment without touching the DB', async () => {
      await expect(service.addComment('v1', 'user-1', '   ')).rejects.toThrow(
        'Comment content is required',
      );
      expect(prisma.videoComment.create).not.toHaveBeenCalled();
    });

    it('throws for a missing/deleted video', async () => {
      prisma.video.findUnique.mockResolvedValue(null);
      await expect(service.addComment('missing', 'user-1', 'hi')).rejects.toThrow(
        'Video not found',
      );
    });
  });

  describe('listComments', () => {
    it('returns paginated comments newest first', async () => {
      prisma.videoComment.findMany.mockResolvedValue([
        { id: 'c2', content: 'b' },
        { id: 'c1', content: 'a' },
      ]);
      prisma.videoComment.count.mockResolvedValue(2);

      const result = await service.listComments('v1', { page: 1, pageSize: 20 });

      expect(result.total).toBe(2);
      expect(result.data).toHaveLength(2);
      expect(prisma.videoComment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { videoId: 'v1' },
          orderBy: { createdAt: 'desc' },
        }),
      );
    });
  });
});
