// ============================================================================
// QuantMax API - Safety Routes
// Reporting, blocking, identity verification, moderation
// ============================================================================

import type { Request, Response } from '../middleware';
import type { RouteDefinition } from '../../src/types';
import { safetyService } from '../services/safety-service';

export const safetyRoutes: RouteDefinition[] = [
  {
    method: 'POST',
    path: '/api/safety/report',
    handler: async (req: Request, res: Response) => {
      const body = req.body as any;
      const report = safetyService.submitReport(req.userId!, body.reportedUserId, body.reason, body.description, body.evidence);
      res.status(201).json({ success: true, data: report });
    },
  },
  {
    method: 'GET',
    path: '/api/safety/reports',
    handler: async (req: Request, res: Response) => {
      const reports = safetyService.getReports(req.userId!);
      res.status(200).json({ success: true, data: reports });
    },
  },
  {
    method: 'POST',
    path: '/api/safety/block/:userId',
    handler: async (req: Request, res: Response) => {
      safetyService.blockUser(req.userId!, req.params['userId']);
      res.status(200).json({ success: true, message: 'User blocked' });
    },
  },
  {
    method: 'DELETE',
    path: '/api/safety/block/:userId',
    handler: async (req: Request, res: Response) => {
      safetyService.unblockUser(req.userId!, req.params['userId']);
      res.status(200).json({ success: true, message: 'User unblocked' });
    },
  },
  {
    method: 'GET',
    path: '/api/safety/blocked',
    handler: async (req: Request, res: Response) => {
      const blocked = safetyService.getBlockedUsers(req.userId!);
      res.status(200).json({ success: true, data: blocked });
    },
  },
  {
    method: 'POST',
    path: '/api/safety/verify',
    handler: async (req: Request, res: Response) => {
      const body = req.body as any;
      const request = safetyService.submitVerification(req.userId!, body.type || 'photo');
      res.status(201).json({ success: true, data: request });
    },
  },
  {
    method: 'POST',
    path: '/api/safety/moderate',
    handler: async (req: Request, res: Response) => {
      const body = req.body as any;
      const result = safetyService.moderateContent(body.content, body.type || 'text');
      res.status(200).json({ success: true, data: result });
    },
  },
  {
    method: 'POST',
    path: '/api/safety/screenshot-detected',
    handler: async (req: Request, res: Response) => {
      const body = req.body as any;
      safetyService.notifyScreenshot(body.chatPartnerId, req.userId!);
      res.status(200).json({ success: true, message: 'Screenshot notification sent' });
    },
  },
];
