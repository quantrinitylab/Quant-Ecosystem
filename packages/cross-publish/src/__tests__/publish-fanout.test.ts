import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PublishFanoutService } from '../publish-fanout.service.js';
import { PublishIntentService } from '../publish-intent.js';
import type { QueueAdapter } from '../publish-fanout.service.js';
import type { PublishIntent } from '../types.js';

describe('PublishFanoutService', () => {
  let intentService: PublishIntentService;
  let mockQueue: QueueAdapter;
  let fanoutService: PublishFanoutService;

  const createIntent = (): PublishIntent => {
    return intentService.create({
      userId: 'user-1',
      contentId: 'content-1',
      contentType: 'video',
      title: 'Test Video',
      description: 'Test description',
      surfaces: ['quantube', 'quantsync', 'quantneon', 'quantmail'],
      mediaUrl: 'https://storage.example.com/video.mp4',
      thumbnailUrl: 'https://storage.example.com/thumb.jpg',
      metadata: {},
    });
  };

  beforeEach(() => {
    intentService = new PublishIntentService();
    mockQueue = {
      add: vi.fn().mockResolvedValue('job-id-123'),
    };
    fanoutService = new PublishFanoutService(intentService, mockQueue);
  });

  describe('fanOut', () => {
    it('should fan out to all target surfaces', async () => {
      const intent = createIntent();
      const jobIds = await fanoutService.fanOut(intent);

      expect(jobIds).toHaveLength(4);
      expect(mockQueue.add).toHaveBeenCalledTimes(4);
    });

    it('should update intent status to processing', async () => {
      const intent = createIntent();
      await fanoutService.fanOut(intent);

      const updated = intentService.getById(intent.id);
      expect(updated?.status).toBe('processing');
    });

    it('should create jobs with correct payload', async () => {
      const intent = createIntent();
      await fanoutService.fanOut(intent);

      expect(mockQueue.add).toHaveBeenCalledWith(
        'publish:quantube',
        expect.objectContaining({
          intentId: intent.id,
          surface: 'quantube',
          contentId: 'content-1',
          contentType: 'video',
          mediaUrl: 'https://storage.example.com/video.mp4',
        }),
      );
    });

    it('should handle partial failures gracefully', async () => {
      let callCount = 0;
      mockQueue.add = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 2) {
          return Promise.reject(new Error('Queue unavailable'));
        }
        return Promise.resolve(`job-${callCount}`);
      });

      const intent = createIntent();
      const jobIds = await fanoutService.fanOut(intent);

      expect(jobIds).toHaveLength(3);
      const updated = intentService.getById(intent.id);
      expect(updated?.status).toBe('partial');
    });

    it('should mark as failed when all surfaces fail', async () => {
      mockQueue.add = vi.fn().mockRejectedValue(new Error('Queue down'));

      const intent = createIntent();
      const jobIds = await fanoutService.fanOut(intent);

      expect(jobIds).toHaveLength(0);
      const updated = intentService.getById(intent.id);
      expect(updated?.status).toBe('failed');
    });
  });

  describe('getStatus', () => {
    it('should return status for existing intent', () => {
      const intent = createIntent();
      const status = fanoutService.getStatus(intent.id);

      expect(status).toBeDefined();
      expect(status!.status).toBe('pending');
    });

    it('should return undefined for nonexistent intent', () => {
      const status = fanoutService.getStatus('nonexistent');
      expect(status).toBeUndefined();
    });
  });
});
