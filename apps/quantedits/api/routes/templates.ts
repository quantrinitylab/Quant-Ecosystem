// ============================================================================
// QuantEdits API - Template Routes
// Template library, categories, custom templates
// ============================================================================

import type { Request, Response } from '../middleware';
import type { RouteDefinition } from '../../src/types';
import { templateService } from '../services/template-service';

export const templateRoutes: RouteDefinition[] = [
  {
    method: 'GET',
    path: '/api/templates',
    handler: async (req: Request, res: Response) => {
      const { category, search, page, limit, premium } = req.query as any;
      const result = templateService.listTemplates({
        category,
        search,
        page: Number(page) || 1,
        limit: Number(limit) || 20,
        premium: premium === 'true' ? true : premium === 'false' ? false : undefined,
      });
      res.status(200).json({ success: true, data: result.templates, pagination: { total: result.total } });
    },
    requiresAuth: false,
  },
  {
    method: 'GET',
    path: '/api/templates/categories',
    handler: async (_req: Request, res: Response) => {
      const categories = templateService.getCategories();
      res.status(200).json({ success: true, data: categories });
    },
    requiresAuth: false,
  },
  {
    method: 'GET',
    path: '/api/templates/trending',
    handler: async (req: Request, res: Response) => {
      const limit = Number(req.query['limit']) || 10;
      const trending = templateService.getTrending(limit);
      res.status(200).json({ success: true, data: trending });
    },
    requiresAuth: false,
  },
  {
    method: 'GET',
    path: '/api/templates/:id',
    handler: async (req: Request, res: Response) => {
      const template = templateService.getTemplate(req.params['id']);
      if (!template) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Template not found' } }); return; }
      res.status(200).json({ success: true, data: template });
    },
    requiresAuth: false,
  },
  {
    method: 'POST',
    path: '/api/templates',
    handler: async (req: Request, res: Response) => {
      const body = req.body as any;
      const template = templateService.createCustomTemplate(req.userId!, {
        name: body.name,
        description: body.description || '',
        category: body.category || 'social-media',
        width: body.width || 1080,
        height: body.height || 1080,
        duration: body.duration,
        layers: body.layers || [],
        variables: body.variables || [],
        tags: body.tags || [],
      });
      res.status(201).json({ success: true, data: template });
    },
  },
  {
    method: 'DELETE',
    path: '/api/templates/:id',
    handler: async (req: Request, res: Response) => {
      const deleted = templateService.deleteTemplate(req.params['id'], req.userId!);
      if (!deleted) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Template not found or unauthorized' } }); return; }
      res.status(200).json({ success: true, message: 'Template deleted' });
    },
  },
  {
    method: 'POST',
    path: '/api/templates/:id/apply',
    handler: async (req: Request, res: Response) => {
      const template = templateService.getTemplate(req.params['id']);
      if (!template) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Template not found' } }); return; }
      const body = req.body as any;
      const result = templateService.applyTemplate(template, body.variables || {});
      res.status(200).json({ success: true, data: result });
    },
  },
];
