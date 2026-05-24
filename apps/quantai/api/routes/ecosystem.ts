// ============================================================================
// QuantAI API - Ecosystem Routes
// AI control panel for all apps, per-app AI config, global settings
// ============================================================================

import type { Request, Response } from '../middleware';
import type { RouteDefinition } from '../../src/types';
import { ecosystemService } from '../services/ecosystem-service';

export const ecosystemRoutes: RouteDefinition[] = [
  { method: 'GET', path: '/api/ecosystem/apps', handler: async (_req: Request, res: Response) => { const apps = ecosystemService.listApps(); res.status(200).json({ success: true, data: apps }); } },
  { method: 'GET', path: '/api/ecosystem/apps/:appId', handler: async (req: Request, res: Response) => { const app = ecosystemService.getApp(req.params['appId']); if (!app) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'App not found' } }); return; } res.status(200).json({ success: true, data: app }); } },
  { method: 'PUT', path: '/api/ecosystem/apps/:appId/config', handler: async (req: Request, res: Response) => { const app = ecosystemService.updateAppConfig(req.params['appId'], req.body as any); if (!app) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'App not found' } }); return; } res.status(200).json({ success: true, data: app }); } },
  { method: 'POST', path: '/api/ecosystem/apps/:appId/toggle-ai', handler: async (req: Request, res: Response) => { const app = ecosystemService.toggleAppAI(req.params['appId']); if (!app) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'App not found' } }); return; } res.status(200).json({ success: true, data: app }); } },
  { method: 'PUT', path: '/api/ecosystem/apps/:appId/model', handler: async (req: Request, res: Response) => { const body = req.body as any; const app = ecosystemService.setAppModel(req.params['appId'], body.modelId); if (!app) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'App not found' } }); return; } res.status(200).json({ success: true, data: app }); } },
  { method: 'GET', path: '/api/ecosystem/policy', handler: async (_req: Request, res: Response) => { const policy = ecosystemService.getGlobalPolicy(); res.status(200).json({ success: true, data: policy }); }, requiresAuth: false },
];
