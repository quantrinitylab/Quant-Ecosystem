// ============================================================================
// QuantAI API - Models Routes
// Model management, fine-tuning, custom models, marketplace
// ============================================================================

import type { Request, Response } from '../middleware';
import type { RouteDefinition } from '../../src/types';
import { modelService } from '../services/model-service';

export const modelRoutes: RouteDefinition[] = [
  { method: 'GET', path: '/api/models', handler: async (req: Request, res: Response) => { const { provider, capability, status } = req.query as any; const models = modelService.listModels({ provider, capability, status }); res.status(200).json({ success: true, data: models }); }, requiresAuth: false },
  { method: 'GET', path: '/api/models/:id', handler: async (req: Request, res: Response) => { const model = modelService.getModel(req.params['id']); if (!model) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Model not found' } }); return; } res.status(200).json({ success: true, data: model }); }, requiresAuth: false },
  { method: 'POST', path: '/api/models/compare', handler: async (req: Request, res: Response) => { const body = req.body as any; const comparison = modelService.compareModels(body.modelIds || []); res.status(200).json({ success: true, data: comparison }); }, requiresAuth: false },
];
