// ============================================================================
// QuantAI API - Analytics Routes
// AI usage analytics, performance metrics, cost tracking
// ============================================================================

import type { Request, Response } from '../middleware';
import type { RouteDefinition } from '../../src/types';
import { ecosystemService } from '../services/ecosystem-service';

export const analyticsRoutes: RouteDefinition[] = [
  { method: 'GET', path: '/api/analytics', handler: async (_req: Request, res: Response) => { const analytics = ecosystemService.getAnalytics(); res.status(200).json({ success: true, data: analytics }); } },
  { method: 'GET', path: '/api/analytics/apps/:appId', handler: async (req: Request, res: Response) => { const analytics = ecosystemService.getAppAnalytics(req.params['appId']); if (!analytics) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'App not found' } }); return; } res.status(200).json({ success: true, data: analytics }); } },
];
