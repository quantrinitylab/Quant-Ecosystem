// ============================================================================
// QuantMax API - AI Routes
// AI matching, conversation starters, content moderation, catfish detection
// ============================================================================

import type { Request, Response } from '../middleware';
import type { RouteDefinition } from '../../src/types';
import { aiService } from '../services/ai-service';

export const aiRoutes: RouteDefinition[] = [
  {
    method: 'POST',
    path: '/api/ai/conversation-starters',
    handler: async (req: Request, res: Response) => {
      const body = req.body as any;
      const starters = aiService.generateConversationStarters(body.user, body.match);
      res.status(200).json({ success: true, data: starters });
    },
  },
  {
    method: 'POST',
    path: '/api/ai/compatibility',
    handler: async (req: Request, res: Response) => {
      const body = req.body as any;
      const insight = aiService.analyzeCompatibility(body.user, body.target);
      res.status(200).json({ success: true, data: insight });
    },
  },
  {
    method: 'POST',
    path: '/api/ai/moderate-message',
    handler: async (req: Request, res: Response) => {
      const body = req.body as any;
      const result = aiService.moderateMessage(body.message);
      res.status(200).json({ success: true, data: result });
    },
  },
  {
    method: 'POST',
    path: '/api/ai/catfish-detection',
    handler: async (req: Request, res: Response) => {
      const body = req.body as any;
      const result = aiService.detectCatfishBehavior(body.messages || [], body.userId);
      res.status(200).json({ success: true, data: result });
    },
  },
  {
    method: 'POST',
    path: '/api/ai/profile-tips',
    handler: async (req: Request, res: Response) => {
      const body = req.body as any;
      const tips = aiService.suggestMatchBoost(body.profile);
      res.status(200).json({ success: true, data: tips });
    },
  },
];
