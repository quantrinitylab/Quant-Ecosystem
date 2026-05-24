// ============================================================================
// QuantEdits API - Export Routes
// Export to all formats/resolutions, quality settings, direct publish
// ============================================================================

import type { Request, Response } from '../middleware';
import type { RouteDefinition } from '../../src/types';
import { renderService } from '../services/render-service';
import { publishService } from '../services/publish-service';
import { editorService } from '../services/editor-service';

export const exportRoutes: RouteDefinition[] = [
  {
    method: 'POST',
    path: '/api/export',
    handler: async (req: Request, res: Response) => {
      const body = req.body as any;
      const project = editorService.getProject(body.projectId);
      if (!project) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Project not found' } }); return; }

      const job = await renderService.startExport(project, {
        format: body.format || 'mp4',
        quality: body.quality || 'high',
        width: body.width || project.width,
        height: body.height || project.height,
        fps: body.fps || project.fps,
        bitrate: body.bitrate,
        codec: body.codec,
        audioCodec: body.audioCodec,
        publishTo: body.publishTo,
      }, req.userId!);

      res.status(202).json({ success: true, data: job });
    },
  },
  {
    method: 'GET',
    path: '/api/export/:jobId',
    handler: async (req: Request, res: Response) => {
      const job = renderService.getJob(req.params['jobId']);
      if (!job) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Export job not found' } }); return; }
      res.status(200).json({ success: true, data: job });
    },
  },
  {
    method: 'GET',
    path: '/api/export',
    handler: async (req: Request, res: Response) => {
      const jobs = renderService.listJobs(req.userId!);
      res.status(200).json({ success: true, data: jobs });
    },
  },
  {
    method: 'DELETE',
    path: '/api/export/:jobId',
    handler: async (req: Request, res: Response) => {
      const cancelled = renderService.cancelJob(req.params['jobId']);
      if (!cancelled) { res.status(400).json({ success: false, error: { code: 'CANCEL_FAILED', message: 'Cannot cancel job' } }); return; }
      res.status(200).json({ success: true, message: 'Export cancelled' });
    },
  },
  {
    method: 'POST',
    path: '/api/export/:jobId/publish',
    handler: async (req: Request, res: Response) => {
      const job = renderService.getJob(req.params['jobId']);
      if (!job || job.status !== 'completed') { res.status(400).json({ success: false, error: { code: 'NOT_READY', message: 'Export not completed' } }); return; }
      const body = req.body as any;
      const result = await publishService.publishToTargets(job.projectId, req.userId!, job.outputUrl!, body.targets);
      res.status(200).json({ success: true, data: result });
    },
  },
  {
    method: 'GET',
    path: '/api/export/targets',
    handler: async (_req: Request, res: Response) => {
      const targets = publishService.getAvailableTargets();
      res.status(200).json({ success: true, data: targets });
    },
    requiresAuth: false,
  },
  {
    method: 'GET',
    path: '/api/export/history',
    handler: async (req: Request, res: Response) => {
      const projectId = req.query['projectId'] as string | undefined;
      const history = publishService.getPublishHistory(req.userId!, projectId);
      res.status(200).json({ success: true, data: history });
    },
  },
  {
    method: 'POST',
    path: '/api/export/estimate',
    handler: async (req: Request, res: Response) => {
      const body = req.body as any;
      const project = editorService.getProject(body.projectId);
      if (!project) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Project not found' } }); return; }
      const estimatedSeconds = renderService.estimateRenderTime(project, body.config || { format: 'mp4', quality: 'high', width: project.width, height: project.height });
      res.status(200).json({ success: true, data: { estimatedSeconds, estimatedMinutes: Math.ceil(estimatedSeconds / 60) } });
    },
  },
];
