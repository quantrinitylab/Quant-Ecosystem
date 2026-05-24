// ============================================================================
// QuantMax API - Matching Routes
// Tinder-style swipe, like/pass/superlike, compatibility scoring
// ============================================================================

import type { Request, Response } from '../middleware';
import type { RouteDefinition } from '../../src/types';
import { matchingService } from '../services/matching-service';

export const matchingRoutes: RouteDefinition[] = [
  {
    method: 'GET',
    path: '/api/matching/recommendations',
    handler: async (req: Request, res: Response) => {
      const limit = Number(req.query['limit']) || 20;
      const recommendations = matchingService.getRecommendations(req.userId!, limit);
      res.status(200).json({ success: true, data: recommendations });
    },
  },
  {
    method: 'POST',
    path: '/api/matching/swipe',
    handler: async (req: Request, res: Response) => {
      const body = req.body as any;
      const result = matchingService.processSwipe(req.userId!, body.targetId, body.action);
      res.status(200).json({
        success: true,
        data: {
          matched: !!result.match,
          match: result.match,
          eloChange: result.eloChange,
        },
      });
    },
  },
  {
    method: 'GET',
    path: '/api/matching/matches',
    handler: async (req: Request, res: Response) => {
      const matches = matchingService.getMatches(req.userId!);
      res.status(200).json({ success: true, data: matches });
    },
  },
  {
    method: 'GET',
    path: '/api/matching/matches/:matchId',
    handler: async (req: Request, res: Response) => {
      const match = matchingService.getMatch(req.params['matchId']);
      if (!match) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Match not found' } }); return; }
      res.status(200).json({ success: true, data: match });
    },
  },
  {
    method: 'DELETE',
    path: '/api/matching/matches/:matchId',
    handler: async (req: Request, res: Response) => {
      const unmatched = matchingService.unmatch(req.params['matchId'], req.userId!);
      if (!unmatched) { res.status(400).json({ success: false, error: { code: 'UNMATCH_FAILED', message: 'Could not unmatch' } }); return; }
      res.status(200).json({ success: true, message: 'Unmatched successfully' });
    },
  },
  {
    method: 'GET',
    path: '/api/matching/compatibility/:targetId',
    handler: async (req: Request, res: Response) => {
      const score = matchingService.calculateCompatibility(req.userId!, req.params['targetId']);
      res.status(200).json({ success: true, data: { compatibility: score } });
    },
  },
];
