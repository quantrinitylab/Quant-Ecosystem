import { describe, it, expect, beforeEach } from 'vitest';
import { PublishIntentService, CreatePublishIntentSchema } from '../publish-intent.js';
import type { CreatePublishIntentInput } from '../publish-intent.js';

describe('PublishIntentService', () => {
  let service: PublishIntentService;

  const validInput: CreatePublishIntentInput = {
    userId: 'user-123',
    contentId: 'content-456',
    contentType: 'video',
    title: 'My First Video',
    description: 'A great video about coding',
    surfaces: ['quantube', 'quantsync', 'quantneon', 'quantmail'],
    mediaUrl: 'https://storage.example.com/videos/test.mp4',
    thumbnailUrl: 'https://storage.example.com/thumbnails/test.jpg',
    metadata: { tags: ['coding', 'tutorial'] },
  };

  beforeEach(() => {
    service = new PublishIntentService();
  });

  describe('create', () => {
    it('should create a publish intent with valid data', () => {
      const intent = service.create(validInput);

      expect(intent.id).toBeDefined();
      expect(intent.userId).toBe('user-123');
      expect(intent.contentId).toBe('content-456');
      expect(intent.contentType).toBe('video');
      expect(intent.title).toBe('My First Video');
      expect(intent.surfaces).toEqual(['quantube', 'quantsync', 'quantneon', 'quantmail']);
      expect(intent.status).toBe('pending');
      expect(intent.createdAt).toBeInstanceOf(Date);
    });

    it('should reject invalid data with empty title', () => {
      const invalid = { ...validInput, title: '' };
      expect(() => service.create(invalid)).toThrow();
    });

    it('should reject invalid data with empty surfaces', () => {
      const invalid = { ...validInput, surfaces: [] as unknown[] };
      expect(() => service.create(invalid as CreatePublishIntentInput)).toThrow();
    });

    it('should reject invalid media URL', () => {
      const invalid = { ...validInput, mediaUrl: 'not-a-url' };
      expect(() => service.create(invalid)).toThrow();
    });

    it('should default metadata to empty object', () => {
      const { metadata: _meta, ...inputWithoutMeta } = validInput;
      const intent = service.create(inputWithoutMeta as CreatePublishIntentInput);
      expect(intent.metadata).toEqual({});
    });
  });

  describe('getById', () => {
    it('should return the intent by id', () => {
      const intent = service.create(validInput);
      const found = service.getById(intent.id);
      expect(found).toEqual(intent);
    });

    it('should return undefined for nonexistent id', () => {
      const found = service.getById('nonexistent');
      expect(found).toBeUndefined();
    });
  });

  describe('updateStatus', () => {
    it('should update the status of an intent', () => {
      const intent = service.create(validInput);
      const updated = service.updateStatus(intent.id, 'processing');
      expect(updated.status).toBe('processing');
    });

    it('should store surface results when provided', () => {
      const intent = service.create(validInput);
      const results = [
        {
          surface: 'quantube' as const,
          status: 'published' as const,
          publishedUrl: 'https://quantube.com/v/123',
          error: null,
          publishedAt: new Date(),
        },
      ];
      service.updateStatus(intent.id, 'published', results);
      const stored = service.getResults(intent.id);
      expect(stored).toEqual(results);
    });

    it('should throw for nonexistent intent', () => {
      expect(() => service.updateStatus('nonexistent', 'failed')).toThrow(
        'PublishIntent not found: nonexistent',
      );
    });
  });

  describe('list', () => {
    it('should list intents for a user', () => {
      service.create(validInput);
      service.create({ ...validInput, title: 'Second Video' });
      service.create({ ...validInput, userId: 'other-user', title: 'Other' });

      const results = service.list('user-123');
      expect(results).toHaveLength(2);
    });

    it('should filter by status', () => {
      const intent1 = service.create(validInput);
      service.create({ ...validInput, title: 'Second' });
      service.updateStatus(intent1.id, 'published');

      const results = service.list('user-123', { status: 'published' });
      expect(results).toHaveLength(1);
      expect(results[0]!.id).toBe(intent1.id);
    });

    it('should filter by content type', () => {
      service.create(validInput);
      service.create({ ...validInput, contentType: 'image', title: 'Image Post' });

      const results = service.list('user-123', { contentType: 'image' });
      expect(results).toHaveLength(1);
      expect(results[0]!.contentType).toBe('image');
    });
  });

  describe('CreatePublishIntentSchema', () => {
    it('should validate correct input', () => {
      const result = CreatePublishIntentSchema.parse(validInput);
      expect(result.userId).toBe('user-123');
    });

    it('should reject invalid surface names', () => {
      const invalid = { ...validInput, surfaces: ['invalid_platform'] };
      expect(() => CreatePublishIntentSchema.parse(invalid)).toThrow();
    });
  });
});
