// ============================================================================
// QuantAI API - Automation Routes
// Workflow automation, triggers, actions, schedules, IFTTT-style
// ============================================================================

import type { Request, Response } from '../middleware';
import type { RouteDefinition } from '../../src/types';
import { automationService } from '../services/automation-service';

export const automationRoutes: RouteDefinition[] = [
  {
    method: 'POST',
    path: '/api/automations',
    handler: async (req: Request, res: Response) => {
      const body = req.body as any;
      const automation = automationService.createAutomation(req.userId!, { name: body.name, description: body.description || '', trigger: body.trigger, actions: body.actions || [], conditions: body.conditions });
      res.status(201).json({ success: true, data: automation });
    },
  },
  {
    method: 'GET',
    path: '/api/automations',
    handler: async (req: Request, res: Response) => {
      const automations = automationService.listAutomations(req.userId!);
      res.status(200).json({ success: true, data: automations });
    },
  },
  {
    method: 'GET',
    path: '/api/automations/:id',
    handler: async (req: Request, res: Response) => {
      const automation = automationService.getAutomation(req.params['id']);
      if (!automation) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Automation not found' } }); return; }
      res.status(200).json({ success: true, data: automation });
    },
  },
  {
    method: 'PUT',
    path: '/api/automations/:id',
    handler: async (req: Request, res: Response) => {
      const automation = automationService.updateAutomation(req.params['id'], req.body as any);
      if (!automation) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Automation not found' } }); return; }
      res.status(200).json({ success: true, data: automation });
    },
  },
  {
    method: 'DELETE',
    path: '/api/automations/:id',
    handler: async (req: Request, res: Response) => {
      automationService.deleteAutomation(req.params['id']);
      res.status(200).json({ success: true, message: 'Automation deleted' });
    },
  },
  {
    method: 'POST',
    path: '/api/automations/:id/toggle',
    handler: async (req: Request, res: Response) => {
      const isActive = automationService.toggleAutomation(req.params['id']);
      res.status(200).json({ success: true, data: { isActive } });
    },
  },
  {
    method: 'POST',
    path: '/api/automations/:id/execute',
    handler: async (req: Request, res: Response) => {
      try {
        const body = req.body as any;
        const log = await automationService.executeAutomation(req.params['id'], body.triggerData);
        res.status(200).json({ success: true, data: log });
      } catch (error: any) {
        res.status(400).json({ success: false, error: { code: 'EXECUTION_FAILED', message: error.message } });
      }
    },
  },
  {
    method: 'GET',
    path: '/api/automations/:id/logs',
    handler: async (req: Request, res: Response) => {
      const logs = automationService.getExecutionLogs(req.params['id']);
      res.status(200).json({ success: true, data: logs });
    },
  },
  {
    method: 'GET',
    path: '/api/automations/templates',
    handler: async (_req: Request, res: Response) => {
      const templates = automationService.getTemplates();
      res.status(200).json({ success: true, data: templates });
    },
    requiresAuth: false,
  },
];
