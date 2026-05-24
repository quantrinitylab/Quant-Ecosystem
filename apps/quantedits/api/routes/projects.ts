// ============================================================================
// QuantEdits API - Project Routes
// Create/manage editing projects, auto-save, version history, collaboration
// ============================================================================

import type { Request, Response } from '../middleware';
import type { RouteDefinition } from '../../src/types';
import { editorService } from '../services/editor-service';

export const projectRoutes: RouteDefinition[] = [
  {
    method: 'POST',
    path: '/api/projects',
    handler: async (req: Request, res: Response) => {
      const body = req.body as any;
      const project = editorService.createProject(req.userId!, {
        title: body.title || 'Untitled Project',
        type: body.type || 'design',
        width: body.width || 1080,
        height: body.height || 1080,
        fps: body.fps,
        duration: body.duration,
      });
      res.status(201).json({ success: true, data: project });
    },
  },
  {
    method: 'GET',
    path: '/api/projects',
    handler: async (req: Request, res: Response) => {
      const { type, page, limit } = req.query as any;
      const result = editorService.listProjects(req.userId!, { type, page: Number(page) || 1, limit: Number(limit) || 20 });
      res.status(200).json({ success: true, data: result.projects, pagination: { total: result.total, page: Number(page) || 1, limit: Number(limit) || 20 } });
    },
  },
  {
    method: 'GET',
    path: '/api/projects/:id',
    handler: async (req: Request, res: Response) => {
      const project = editorService.getProject(req.params['id']);
      if (!project) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Project not found' } }); return; }
      res.status(200).json({ success: true, data: project });
    },
  },
  {
    method: 'PUT',
    path: '/api/projects/:id',
    handler: async (req: Request, res: Response) => {
      const project = editorService.updateProject(req.params['id'], req.body as any);
      if (!project) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Project not found' } }); return; }
      res.status(200).json({ success: true, data: project });
    },
  },
  {
    method: 'DELETE',
    path: '/api/projects/:id',
    handler: async (req: Request, res: Response) => {
      const deleted = editorService.deleteProject(req.params['id']);
      if (!deleted) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Project not found' } }); return; }
      res.status(200).json({ success: true, message: 'Project deleted' });
    },
  },
  {
    method: 'POST',
    path: '/api/projects/:id/autosave',
    handler: async (req: Request, res: Response) => {
      const result = editorService.autoSave(req.params['id']);
      if (!result) { res.status(400).json({ success: false, error: { code: 'AUTOSAVE_FAILED', message: 'Auto-save not available' } }); return; }
      res.status(200).json({ success: true, data: result });
    },
  },
  {
    method: 'POST',
    path: '/api/projects/:id/layers',
    handler: async (req: Request, res: Response) => {
      const body = req.body as any;
      const layer = editorService.addLayer(req.params['id'], { name: body.name, type: body.type, content: body.content, position: body.position, size: body.size, startTime: body.startTime, endTime: body.endTime });
      if (!layer) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Project not found' } }); return; }
      res.status(201).json({ success: true, data: layer });
    },
  },
  {
    method: 'PUT',
    path: '/api/projects/:id/layers/:layerId',
    handler: async (req: Request, res: Response) => {
      const layer = editorService.updateLayer(req.params['id'], req.params['layerId'], req.body as any);
      if (!layer) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Layer not found' } }); return; }
      res.status(200).json({ success: true, data: layer });
    },
  },
  {
    method: 'DELETE',
    path: '/api/projects/:id/layers/:layerId',
    handler: async (req: Request, res: Response) => {
      const deleted = editorService.removeLayer(req.params['id'], req.params['layerId']);
      if (!deleted) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Layer not found' } }); return; }
      res.status(200).json({ success: true, message: 'Layer deleted' });
    },
  },
  {
    method: 'POST',
    path: '/api/projects/:id/layers/:layerId/duplicate',
    handler: async (req: Request, res: Response) => {
      const layer = editorService.duplicateLayer(req.params['id'], req.params['layerId']);
      if (!layer) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Layer not found' } }); return; }
      res.status(201).json({ success: true, data: layer });
    },
  },
  {
    method: 'PUT',
    path: '/api/projects/:id/layers/reorder',
    handler: async (req: Request, res: Response) => {
      const body = req.body as any;
      const success = editorService.reorderLayers(req.params['id'], body.layerIds);
      if (!success) { res.status(400).json({ success: false, error: { code: 'REORDER_FAILED', message: 'Reorder failed' } }); return; }
      res.status(200).json({ success: true, message: 'Layers reordered' });
    },
  },
  {
    method: 'POST',
    path: '/api/projects/:id/timeline/split',
    handler: async (req: Request, res: Response) => {
      const body = req.body as any;
      const result = editorService.splitClip(req.params['id'], body.clipId, body.time);
      if (!result) { res.status(400).json({ success: false, error: { code: 'SPLIT_FAILED', message: 'Could not split clip' } }); return; }
      res.status(200).json({ success: true, data: result });
    },
  },
  {
    method: 'POST',
    path: '/api/projects/:id/timeline/tracks',
    handler: async (req: Request, res: Response) => {
      const body = req.body as any;
      const track = editorService.addTrack(req.params['id'], body.type, body.name);
      if (!track) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Project not found' } }); return; }
      res.status(201).json({ success: true, data: track });
    },
  },
  {
    method: 'POST',
    path: '/api/projects/:id/canvas',
    handler: async (req: Request, res: Response) => {
      const body = req.body as any;
      const success = editorService.applyCanvasOperation(req.params['id'], { type: body.operation, layerId: body.layerId, params: body.params });
      if (!success) { res.status(400).json({ success: false, error: { code: 'OPERATION_FAILED', message: 'Canvas operation failed' } }); return; }
      res.status(200).json({ success: true, message: 'Operation applied' });
    },
  },
];
