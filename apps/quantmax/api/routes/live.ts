// ============================================================================
// QuantMax API - Live Routes
// Go live, live events, virtual dating events, group video, party mode
// ============================================================================

import type { Request, Response } from '../middleware';
import type { RouteDefinition, LiveEvent } from '../../src/types';

const liveStreams: Map<string, LiveEvent> = new Map();

export const liveRoutes: RouteDefinition[] = [
  {
    method: 'POST',
    path: '/api/live/start',
    handler: async (req: Request, res: Response) => {
      const body = req.body as any;
      const stream: LiveEvent = {
        id: `live_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
        hostId: req.userId!,
        host: body.host || { id: req.userId! } as any,
        title: body.title || 'Live Stream',
        type: body.type || 'solo',
        thumbnailUrl: body.thumbnailUrl || '/live/default.png',
        viewerCount: 0,
        maxParticipants: body.maxParticipants || 100,
        isLive: true,
        startedAt: new Date().toISOString(),
        tags: body.tags || [],
      };
      liveStreams.set(stream.id, stream);
      res.status(201).json({ success: true, data: stream });
    },
  },
  {
    method: 'POST',
    path: '/api/live/:streamId/end',
    handler: async (req: Request, res: Response) => {
      const stream = liveStreams.get(req.params['streamId']);
      if (!stream) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Stream not found' } }); return; }
      if (stream.hostId !== req.userId) { res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Not your stream' } }); return; }
      stream.isLive = false;
      res.status(200).json({ success: true, data: stream });
    },
  },
  {
    method: 'POST',
    path: '/api/live/:streamId/join',
    handler: async (req: Request, res: Response) => {
      const stream = liveStreams.get(req.params['streamId']);
      if (!stream) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Stream not found' } }); return; }
      if (!stream.isLive) { res.status(400).json({ success: false, error: { code: 'STREAM_ENDED', message: 'Stream has ended' } }); return; }
      stream.viewerCount++;
      res.status(200).json({ success: true, data: { streamId: stream.id, viewerCount: stream.viewerCount } });
    },
  },
  {
    method: 'POST',
    path: '/api/live/:streamId/leave',
    handler: async (req: Request, res: Response) => {
      const stream = liveStreams.get(req.params['streamId']);
      if (!stream) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Stream not found' } }); return; }
      stream.viewerCount = Math.max(0, stream.viewerCount - 1);
      res.status(200).json({ success: true });
    },
  },
  {
    method: 'GET',
    path: '/api/live',
    handler: async (_req: Request, res: Response) => {
      const live = Array.from(liveStreams.values()).filter(s => s.isLive);
      res.status(200).json({ success: true, data: live });
    },
    requiresAuth: false,
  },
  {
    method: 'GET',
    path: '/api/live/:streamId',
    handler: async (req: Request, res: Response) => {
      const stream = liveStreams.get(req.params['streamId']);
      if (!stream) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Stream not found' } }); return; }
      res.status(200).json({ success: true, data: stream });
    },
    requiresAuth: false,
  },
];
