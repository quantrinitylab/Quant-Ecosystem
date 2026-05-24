// ============================================================================
// QuantMax API - Discover Routes
// Discover people, events, nearby, interest groups
// ============================================================================

import type { Request, Response } from '../middleware';
import type { RouteDefinition, LiveEvent, InterestGroup } from '../../src/types';

const events: Map<string, LiveEvent> = new Map();
const groups: Map<string, InterestGroup> = new Map();

export const discoverRoutes: RouteDefinition[] = [
  {
    method: 'GET',
    path: '/api/discover/people',
    handler: async (req: Request, res: Response) => {
      const { interests, nearby } = req.query as any;
      res.status(200).json({ success: true, data: [], message: 'Discover people based on shared interests' });
    },
  },
  {
    method: 'GET',
    path: '/api/discover/events',
    handler: async (_req: Request, res: Response) => {
      const allEvents = Array.from(events.values()).filter(e => e.isLive || (e.scheduledAt && new Date(e.scheduledAt) > new Date()));
      res.status(200).json({ success: true, data: allEvents });
    },
    requiresAuth: false,
  },
  {
    method: 'GET',
    path: '/api/discover/groups',
    handler: async (req: Request, res: Response) => {
      const { interest } = req.query as any;
      let allGroups = Array.from(groups.values());
      if (interest) allGroups = allGroups.filter(g => g.interests.includes(interest));
      res.status(200).json({ success: true, data: allGroups });
    },
    requiresAuth: false,
  },
  {
    method: 'POST',
    path: '/api/discover/groups',
    handler: async (req: Request, res: Response) => {
      const body = req.body as any;
      const group: InterestGroup = {
        id: `group_${Date.now().toString(36)}`,
        name: body.name,
        description: body.description || '',
        memberCount: 1,
        imageUrl: body.imageUrl || '/groups/default.png',
        interests: body.interests || [],
      };
      groups.set(group.id, group);
      res.status(201).json({ success: true, data: group });
    },
  },
  {
    method: 'GET',
    path: '/api/discover/nearby',
    handler: async (req: Request, res: Response) => {
      const { lat, lng, radius } = req.query as any;
      res.status(200).json({ success: true, data: [], location: { lat, lng, radius: radius || 50 } });
    },
  },
  {
    method: 'GET',
    path: '/api/discover/speed-dating',
    handler: async (_req: Request, res: Response) => {
      const speedDating = Array.from(events.values()).filter(e => e.type === 'speed-dating');
      res.status(200).json({ success: true, data: speedDating });
    },
    requiresAuth: false,
  },
];
