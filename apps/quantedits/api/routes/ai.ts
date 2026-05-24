// ============================================================================
// QuantEdits API - AI Routes
// AI editing: auto-edit, background removal, upscale, style transfer, etc.
// ============================================================================

import type { Request, Response } from '../middleware';
import type { RouteDefinition } from '../../src/types';
import { aiEditingService } from '../services/ai-service';

export const aiRoutes: RouteDefinition[] = [
  {
    method: 'POST',
    path: '/api/ai/background-removal',
    handler: async (req: Request, res: Response) => {
      const body = req.body as any;
      const result = await aiEditingService.removeBackground(body.imageUrl);
      res.status(200).json({ success: true, data: result });
    },
  },
  {
    method: 'POST',
    path: '/api/ai/upscale',
    handler: async (req: Request, res: Response) => {
      const body = req.body as any;
      const result = await aiEditingService.upscaleImage(body.imageUrl, body.scale || 2);
      res.status(200).json({ success: true, data: result });
    },
  },
  {
    method: 'POST',
    path: '/api/ai/style-transfer',
    handler: async (req: Request, res: Response) => {
      const body = req.body as any;
      const result = await aiEditingService.styleTransfer(body.imageUrl, body.style);
      res.status(200).json({ success: true, data: result });
    },
  },
  {
    method: 'POST',
    path: '/api/ai/auto-caption',
    handler: async (req: Request, res: Response) => {
      const body = req.body as any;
      const result = await aiEditingService.autoCaption(body.videoUrl, body.language || 'en');
      res.status(200).json({ success: true, data: result });
    },
  },
  {
    method: 'POST',
    path: '/api/ai/voice-clone',
    handler: async (req: Request, res: Response) => {
      const body = req.body as any;
      const result = await aiEditingService.voiceClone(body.audioUrl, body.text);
      res.status(200).json({ success: true, data: result });
    },
  },
  {
    method: 'POST',
    path: '/api/ai/object-removal',
    handler: async (req: Request, res: Response) => {
      const body = req.body as any;
      const result = await aiEditingService.removeObject(body.imageUrl, body.mask);
      res.status(200).json({ success: true, data: result });
    },
  },
  {
    method: 'POST',
    path: '/api/ai/color-grade',
    handler: async (req: Request, res: Response) => {
      const body = req.body as any;
      const result = await aiEditingService.autoColorGrade(body.imageUrl, body.mood || 'cinematic');
      res.status(200).json({ success: true, data: result });
    },
  },
  {
    method: 'POST',
    path: '/api/ai/auto-edit',
    handler: async (req: Request, res: Response) => {
      const body = req.body as any;
      const result = await aiEditingService.autoEdit(body.projectId, body.prompt);
      res.status(200).json({ success: true, data: result });
    },
  },
  {
    method: 'POST',
    path: '/api/ai/enhance',
    handler: async (req: Request, res: Response) => {
      const body = req.body as any;
      const result = await aiEditingService.enhanceImage(body.imageUrl);
      res.status(200).json({ success: true, data: result });
    },
  },
  {
    method: 'GET',
    path: '/api/ai/models',
    handler: async (_req: Request, res: Response) => {
      const models = aiEditingService.getAvailableModels();
      res.status(200).json({ success: true, data: models });
    },
    requiresAuth: false,
  },
  {
    method: 'GET',
    path: '/api/ai/result/:id',
    handler: async (req: Request, res: Response) => {
      const result = aiEditingService.getResult(req.params['id']);
      if (!result) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Result not found' } }); return; }
      res.status(200).json({ success: true, data: result });
    },
  },
];
