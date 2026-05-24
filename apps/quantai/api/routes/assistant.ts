// ============================================================================
// QuantAI API - Assistant Routes
// AI assistant: chat, commands, context-aware, multi-modal
// ============================================================================

import type { Request, Response } from '../middleware';
import type { RouteDefinition } from '../../src/types';
import { assistantService } from '../services/assistant-service';

export const assistantRoutes: RouteDefinition[] = [
  {
    method: 'POST',
    path: '/api/assistant/chat',
    handler: async (req: Request, res: Response) => {
      const body = req.body as any;
      const result = await assistantService.chat(req.userId!, body.conversationId || null, body.message, body.attachments);
      res.status(200).json({ success: true, data: result });
    },
  },
  {
    method: 'GET',
    path: '/api/assistant/conversations',
    handler: async (req: Request, res: Response) => {
      const conversations = assistantService.listConversations(req.userId!);
      res.status(200).json({ success: true, data: conversations });
    },
  },
  {
    method: 'GET',
    path: '/api/assistant/conversations/:id',
    handler: async (req: Request, res: Response) => {
      const conversation = assistantService.getConversation(req.params['id']);
      if (!conversation) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Conversation not found' } }); return; }
      res.status(200).json({ success: true, data: conversation });
    },
  },
  {
    method: 'DELETE',
    path: '/api/assistant/conversations/:id',
    handler: async (req: Request, res: Response) => {
      assistantService.deleteConversation(req.params['id']);
      res.status(200).json({ success: true, message: 'Conversation deleted' });
    },
  },
  {
    method: 'GET',
    path: '/api/assistant/tools',
    handler: async (_req: Request, res: Response) => {
      const tools = assistantService.getAvailableTools();
      res.status(200).json({ success: true, data: tools });
    },
    requiresAuth: false,
  },
  {
    method: 'PUT',
    path: '/api/assistant/personality',
    handler: async (req: Request, res: Response) => {
      const assistant = assistantService.updatePersonality(req.userId!, req.body as any);
      res.status(200).json({ success: true, data: assistant });
    },
  },
  {
    method: 'GET',
    path: '/api/assistant/me',
    handler: async (req: Request, res: Response) => {
      const assistant = assistantService.getOrCreateAssistant(req.userId!);
      res.status(200).json({ success: true, data: assistant });
    },
  },
];
