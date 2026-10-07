import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPublishRoutes } from '../routes/publish.js';
import { PublishIntentService } from '../publish-intent.js';
import { PublishFanoutService } from '../publish-fanout.service.js';
import { AnalyticsAggregatorService } from '../analytics-aggregator.service.js';
import type { QueueAdapter } from '../publish-fanout.service.js';

describe('Route Handlers', () => {
  let intentService: PublishIntentService;
  let fanoutService: PublishFanoutService;
  let analyticsService: AnalyticsAggregatorService;
  let routes: ReturnType<typeof createPublishRoutes>;
  let mockQueue: QueueAdapter;

  beforeEach(() => {
    intentService = new PublishIntentService();
    mockQueue = { add: vi.fn().mockResolvedValue('job-123') };
    fanoutService = new PublishFanoutService(intentService, mockQueue);
    analyticsService = new AnalyticsAggregatorService();
    routes = createPublishRoutes(intentService, fanoutService, analyticsService);
  });

  describe('handleCreatePublish', () => {
    const validBody = {
      userId: 'user-1',
      contentId: 'content-1',
      contentType: 'video',
      title: 'Test Video',
      description: 'A test video',
      surfaces: ['quantube', 'quantsync'],
      mediaUrl: 'https://storage.example.com/video.mp4',
      thumbnailUrl: 'https://storage.example.com/thumb.jpg',
      metadata: {},
    };

    it('should create a publish intent and return 201', async () => {
      const response = await routes.handleCreatePublish({ body: validBody });
      expect(response.status).toBe(201);
      const body = response.body as { intent: { id: string }; jobIds: string[] };
      expect(body.intent.id).toBeDefined();
      expect(body.jobIds).toHaveLength(2);
    });

    it('should return 400 for invalid input', async () => {
      const response = await routes.handleCreatePublish({
        body: { title: '' },
      });
      expect(response.status).toBe(400);
      const body = response.body as { error: string };
      expect(body.error).toBe('Validation failed');
    });
  });

  describe('handleGetStatus', () => {
    it('should return status for existing intent', async () => {
      const createResp = await routes.handleCreatePublish({
        body: {
          userId: 'user-1',
          contentId: 'content-1',
          contentType: 'video',
          title: 'Test',
          description: 'Test',
          surfaces: ['quantube'],
          mediaUrl: 'https://storage.example.com/video.mp4',
          thumbnailUrl: 'https://storage.example.com/thumb.jpg',
        },
      });
      const intent = (createResp.body as { intent: { id: string } }).intent;

      const response = routes.handleGetStatus({
        params: { id: intent.id },
      });
      expect(response.status).toBe(200);
      const body = response.body as { status: string };
      expect(body.status).toBe('processing');
    });

    it('should return 404 for nonexistent intent', () => {
      const response = routes.handleGetStatus({
        params: { id: 'nonexistent-id' },
      });
      expect(response.status).toBe(404);
    });

    it('should return 400 for missing id', () => {
      const response = routes.handleGetStatus({ params: {} });
      expect(response.status).toBe(400);
    });
  });

  describe('handleGetAnalytics', () => {
    it('should return analytics for a user', () => {
      analyticsService.recordMetrics(
        'intent-1',
        'quantube',
        {
          views: 100,
          likes: 10,
          shares: 5,
          comments: 3,
          watchTime: 500,
        },
        'user-1',
      );

      const response = routes.handleGetAnalytics({
        query: { userId: 'user-1' },
      });
      expect(response.status).toBe(200);
      const body = response.body as { analytics: unknown[] };
      expect(body.analytics).toHaveLength(1);
    });

    it('should return 400 for missing userId', () => {
      const response = routes.handleGetAnalytics({ query: {} });
      expect(response.status).toBe(400);
    });
  });
});
