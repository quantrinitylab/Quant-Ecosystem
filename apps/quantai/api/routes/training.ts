// ============================================================================
// QuantAI API - Training Routes
// Custom model training, datasets, fine-tuning jobs
// ============================================================================

import type { Request, Response } from '../middleware';
import type { RouteDefinition } from '../../src/types';
import { modelService } from '../services/model-service';

export const trainingRoutes: RouteDefinition[] = [
  { method: 'POST', path: '/api/training', handler: async (req: Request, res: Response) => { const body = req.body as any; const job = modelService.startTrainingJob(req.userId!, { modelId: body.modelId, name: body.name, dataset: body.dataset, hyperparams: body.hyperparams || { epochs: 3, learningRate: 0.0001, batchSize: 32, warmupSteps: 100 } }); res.status(201).json({ success: true, data: job }); } },
  { method: 'GET', path: '/api/training', handler: async (req: Request, res: Response) => { const jobs = modelService.listTrainingJobs(req.userId!); res.status(200).json({ success: true, data: jobs }); } },
  { method: 'GET', path: '/api/training/:id', handler: async (req: Request, res: Response) => { const job = modelService.getTrainingJob(req.params['id']); if (!job) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Training job not found' } }); return; } res.status(200).json({ success: true, data: job }); } },
  { method: 'DELETE', path: '/api/training/:id', handler: async (req: Request, res: Response) => { const cancelled = modelService.cancelTrainingJob(req.params['id']); if (!cancelled) { res.status(400).json({ success: false, error: { code: 'CANCEL_FAILED', message: 'Cannot cancel job' } }); return; } res.status(200).json({ success: true, message: 'Training cancelled' }); } },
];
