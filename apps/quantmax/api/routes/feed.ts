// ============================================================================
// QuantMax API - Feed Routes
// Short video feed, for-you algorithm, sounds, hashtags, challenges
// ============================================================================

import type { Request, Response } from '../middleware';
import type { RouteDefinition } from '../../src/types';
import { feedService } from '../services/feed-service';

export const feedRoutes: RouteDefinition[] = [
  {
    method: 'GET',
    path: '/api/feed/for-you',
    handler: async (req: Request, res: Response) => {
      const limit = Number(req.query['limit']) || 20;
      const offset = Number(req.query['offset']) || 0;
      const videos = feedService.getForYouFeed(req.userId!, limit, offset);
      res.status(200).json({ success: true, data: videos });
    },
  },
  {
    method: 'GET',
    path: '/api/feed/following',
    handler: async (req: Request, res: Response) => {
      const following = (req.query['following'] as string || '').split(',').filter(Boolean);
      const videos = feedService.getFollowingFeed(req.userId!, following);
      res.status(200).json({ success: true, data: videos });
    },
  },
  {
    method: 'GET',
    path: '/api/feed/trending',
    handler: async (req: Request, res: Response) => {
      const limit = Number(req.query['limit']) || 20;
      const videos = feedService.getTrending(limit);
      res.status(200).json({ success: true, data: videos });
    },
    requiresAuth: false,
  },
  {
    method: 'POST',
    path: '/api/feed/engagement',
    handler: async (req: Request, res: Response) => {
      const body = req.body as any;
      feedService.recordEngagement({ userId: req.userId!, videoId: body.videoId, watchTime: body.watchTime, watchPercentage: body.watchPercentage, liked: body.liked || false, shared: body.shared || false, commented: body.commented || false, skippedAt: body.skippedAt });
      res.status(200).json({ success: true });
    },
  },
  {
    method: 'GET',
    path: '/api/feed/search',
    handler: async (req: Request, res: Response) => {
      const query = req.query['q'] as string || '';
      const videos = feedService.searchVideos(query);
      res.status(200).json({ success: true, data: videos });
    },
    requiresAuth: false,
  },
  {
    method: 'GET',
    path: '/api/feed/sounds/trending',
    handler: async (_req: Request, res: Response) => {
      const sounds = feedService.getTrendingSounds();
      res.status(200).json({ success: true, data: sounds });
    },
    requiresAuth: false,
  },
  {
    method: 'GET',
    path: '/api/feed/challenges',
    handler: async (_req: Request, res: Response) => {
      const challenges = feedService.getActiveChallenges();
      res.status(200).json({ success: true, data: challenges });
    },
    requiresAuth: false,
  },
];
