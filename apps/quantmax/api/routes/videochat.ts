// ============================================================================
// QuantMax API - Video Chat Routes
// Random video chat, interest matching, report/skip, text fallback
// ============================================================================

import type { Request, Response } from '../middleware';
import type { RouteDefinition } from '../../src/types';
import { videoChatService } from '../services/videochat-service';

export const videochatRoutes: RouteDefinition[] = [
  {
    method: 'POST',
    path: '/api/videochat/join',
    handler: async (req: Request, res: Response) => {
      const body = req.body as any;
      const result = videoChatService.joinQueue(req.userId!, {
        interests: body.interests || [],
        ageRange: body.ageRange || { min: 18, max: 99 },
        genders: body.genders || [],
        language: body.language || 'en',
        enableTextFallback: body.enableTextFallback ?? true,
        enableGames: body.enableGames ?? false,
      });
      res.status(200).json({ success: true, data: result });
    },
  },
  {
    method: 'POST',
    path: '/api/videochat/skip',
    handler: async (req: Request, res: Response) => {
      const result = videoChatService.skip(req.userId!);
      res.status(200).json({ success: true, data: result });
    },
  },
  {
    method: 'POST',
    path: '/api/videochat/end',
    handler: async (req: Request, res: Response) => {
      const ended = videoChatService.endSession(req.userId!);
      if (!ended) { res.status(400).json({ success: false, error: { code: 'NO_SESSION', message: 'No active session' } }); return; }
      res.status(200).json({ success: true, message: 'Session ended' });
    },
  },
  {
    method: 'POST',
    path: '/api/videochat/message',
    handler: async (req: Request, res: Response) => {
      const body = req.body as any;
      const sent = videoChatService.sendTextMessage(req.userId!, body.content);
      if (!sent) { res.status(400).json({ success: false, error: { code: 'SEND_FAILED', message: 'Could not send message' } }); return; }
      res.status(200).json({ success: true });
    },
  },
  {
    method: 'GET',
    path: '/api/videochat/session',
    handler: async (req: Request, res: Response) => {
      const session = videoChatService.getUserSession(req.userId!);
      if (!session) { res.status(404).json({ success: false, error: { code: 'NO_SESSION', message: 'No active session' } }); return; }
      res.status(200).json({ success: true, data: { chat: session.chat, messages: session.textMessages } });
    },
  },
  {
    method: 'POST',
    path: '/api/videochat/report',
    handler: async (req: Request, res: Response) => {
      const body = req.body as any;
      const reported = videoChatService.reportUser(req.userId!, body.reason);
      if (!reported) { res.status(400).json({ success: false, error: { code: 'REPORT_FAILED', message: 'No active session to report' } }); return; }
      res.status(200).json({ success: true, message: 'User reported and session ended' });
    },
  },
  {
    method: 'GET',
    path: '/api/videochat/stats',
    handler: async (_req: Request, res: Response) => {
      res.status(200).json({ success: true, data: { queueLength: videoChatService.getQueueLength(), activeSessions: videoChatService.getActiveSessionCount() } });
    },
    requiresAuth: false,
  },
];
