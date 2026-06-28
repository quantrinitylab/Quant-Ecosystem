import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PhotoService } from '../services/photo.service';
import { StoryService } from '../services/story.service';

function createMockPrisma() {
  return {
    photo: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
    photoAlbum: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
    story: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    storyView: {
      upsert: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
    },
  };
}

describe('PhotoService', () => {
  let service: PhotoService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new PhotoService(prisma as never);
  });

  describe('uploadPhoto', () => {
    it('creates a photo with metadata', async () => {
      const mockPhoto = {
        id: 'photo-1',
        userId: 'user-1',
        albumId: null,
        caption: 'Beautiful sunset',
        imageUrl: 'https://cdn.example.com/photo.jpg',
        thumbnailUrl: null,
        width: 1080,
        height: 1080,
        fileSize: 2500000,
        filter: null,
        location: null,
        tags: [],
        likeCount: 0,
        commentCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };
      prisma.photo.create.mockResolvedValue(mockPhoto);

      const result = await service.uploadPhoto({
        userId: 'user-1',
        caption: 'Beautiful sunset',
        imageUrl: 'https://cdn.example.com/photo.jpg',
        width: 1080,
        height: 1080,
        fileSize: 2500000,
      });

      expect(result).toEqual(mockPhoto);
      expect(prisma.photo.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          albumId: null,
          caption: 'Beautiful sunset',
          imageUrl: 'https://cdn.example.com/photo.jpg',
          thumbnailUrl: null,
          width: 1080,
          height: 1080,
          fileSize: 2500000,
          filter: null,
          location: null,
          tags: [],
          likeCount: 0,
          commentCount: 0,
        },
      });
    });
  });

  describe('likePhoto', () => {
    it('increments like count', async () => {
      prisma.photo.findUnique.mockResolvedValue({
        id: 'photo-1',
        likeCount: 10,
        deletedAt: null,
      });
      prisma.photo.update.mockResolvedValue({
        id: 'photo-1',
        likeCount: 11,
      });

      const result = await service.likePhoto('photo-1');

      expect(result.likeCount).toBe(11);
    });

    it('throws PHOTO_NOT_FOUND for deleted photo', async () => {
      prisma.photo.findUnique.mockResolvedValue({
        id: 'photo-1',
        deletedAt: new Date(),
      });

      await expect(service.likePhoto('photo-1')).rejects.toThrow('Photo not found');
    });
  });

  describe('deletePhoto', () => {
    it('soft-deletes photo when called by owner', async () => {
      prisma.photo.findUnique.mockResolvedValue({
        id: 'photo-1',
        userId: 'user-1',
        deletedAt: null,
      });
      prisma.photo.update.mockResolvedValue({
        id: 'photo-1',
        deletedAt: expect.any(Date),
      });

      const result = await service.deletePhoto('photo-1', 'user-1');

      expect(result.deletedAt).toBeDefined();
    });

    it('throws NOT_PHOTO_OWNER if different user', async () => {
      prisma.photo.findUnique.mockResolvedValue({
        id: 'photo-1',
        userId: 'user-1',
        deletedAt: null,
      });

      await expect(service.deletePhoto('photo-1', 'user-2')).rejects.toThrow(
        'Only the owner can delete this photo',
      );
    });
  });

  describe('listByUser', () => {
    it('returns paginated photos', async () => {
      prisma.photo.findMany.mockResolvedValue([{ id: 'photo-1' }, { id: 'photo-2' }]);
      prisma.photo.count.mockResolvedValue(50);

      const result = await service.listByUser('user-1', { page: 1, pageSize: 20 });

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(50);
      expect(result.totalPages).toBe(3);
      expect(result.hasNext).toBe(true);
    });
  });

  describe('createAlbum', () => {
    it('creates an album', async () => {
      prisma.photoAlbum.create.mockResolvedValue({
        id: 'album-1',
        userId: 'user-1',
        name: 'Vacation',
        description: null,
        photoCount: 0,
        visibility: 'PUBLIC',
      });

      const result = await service.createAlbum({
        userId: 'user-1',
        name: 'Vacation',
      });

      expect(result.name).toBe('Vacation');
      expect(result.photoCount).toBe(0);
    });
  });
});

describe('StoryService', () => {
  let service: StoryService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new StoryService(prisma as never);
  });

  describe('createStory', () => {
    it('creates a story with 24h expiry', async () => {
      prisma.story.create.mockResolvedValue({
        id: 'story-1',
        userId: 'user-1',
        type: 'IMAGE',
        mediaUrl: 'https://cdn.example.com/story.jpg',
        viewCount: 0,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        createdAt: new Date(),
      });

      const result = await service.createStory({
        userId: 'user-1',
        type: 'IMAGE',
        mediaUrl: 'https://cdn.example.com/story.jpg',
      });

      expect(result.viewCount).toBe(0);
      expect(prisma.story.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          type: 'IMAGE',
          mediaUrl: 'https://cdn.example.com/story.jpg',
          expiresAt: expect.any(Date),
        }),
      });
    });
  });

  describe('getActiveStories', () => {
    it('returns only non-expired stories', async () => {
      const activeStory = {
        id: 'story-1',
        expiresAt: new Date(Date.now() + 10 * 60 * 60 * 1000),
      };
      prisma.story.findMany.mockResolvedValue([activeStory]);

      const result = await service.getActiveStories('user-1');

      expect(result).toHaveLength(1);
      expect(prisma.story.findMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          expiresAt: { gt: expect.any(Date) },
        },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('viewStory', () => {
    it('records a distinct view and sets viewCount to the distinct count', async () => {
      prisma.story.findUnique.mockResolvedValue({
        id: 'story-1',
        userId: 'owner',
        viewCount: 5,
        expiresAt: new Date(Date.now() + 10 * 60 * 60 * 1000),
      });
      prisma.storyView.upsert.mockResolvedValue({});
      prisma.storyView.count.mockResolvedValue(6);
      prisma.story.update.mockResolvedValue({
        id: 'story-1',
        viewCount: 6,
      });

      const result = await service.viewStory('story-1', 'viewer-1');

      expect(result.viewCount).toBe(6);
      expect(prisma.storyView.upsert).toHaveBeenCalled();
    });

    it('throws STORY_EXPIRED for expired story', async () => {
      prisma.story.findUnique.mockResolvedValue({
        id: 'story-1',
        viewCount: 5,
        expiresAt: new Date(Date.now() - 1000), // Already expired
      });

      await expect(service.viewStory('story-1', 'viewer-1')).rejects.toThrow('Story has expired');
    });

    it('throws STORY_NOT_FOUND for non-existent story', async () => {
      prisma.story.findUnique.mockResolvedValue(null);

      await expect(service.viewStory('missing', 'viewer-1')).rejects.toThrow('Story not found');
    });
  });

  describe('expireStories', () => {
    it('deletes expired stories and returns count', async () => {
      prisma.story.deleteMany.mockResolvedValue({ count: 3 });

      const count = await service.expireStories();

      expect(count).toBe(3);
      expect(prisma.story.deleteMany).toHaveBeenCalledWith({
        where: { expiresAt: { lte: expect.any(Date) } },
      });
    });
  });
});
