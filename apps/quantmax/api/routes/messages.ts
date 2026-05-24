// ============================================================================
// QuantMax API - Messages Routes
// Chat after matching, icebreakers, video messages, reactions
// ============================================================================

import type { Request, Response } from '../middleware';
import type { RouteDefinition, Message } from '../../src/types';

const messageStore: Map<string, Message[]> = new Map();

export const messageRoutes: RouteDefinition[] = [
  {
    method: 'GET',
    path: '/api/messages/:matchId',
    handler: async (req: Request, res: Response) => {
      const messages = messageStore.get(req.params['matchId']) || [];
      const limit = Number(req.query['limit']) || 50;
      const offset = Number(req.query['offset']) || 0;
      res.status(200).json({ success: true, data: messages.slice(offset, offset + limit), total: messages.length });
    },
  },
  {
    method: 'POST',
    path: '/api/messages/:matchId',
    handler: async (req: Request, res: Response) => {
      const body = req.body as any;
      const message: Message = {
        id: `msg_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
        matchId: req.params['matchId'],
        senderId: req.userId!,
        content: body.content,
        type: body.type || 'text',
        mediaUrl: body.mediaUrl,
        reactions: [],
        createdAt: new Date().toISOString(),
      };
      const messages = messageStore.get(req.params['matchId']) || [];
      messages.push(message);
      messageStore.set(req.params['matchId'], messages);
      res.status(201).json({ success: true, data: message });
    },
  },
  {
    method: 'POST',
    path: '/api/messages/:matchId/:messageId/react',
    handler: async (req: Request, res: Response) => {
      const body = req.body as any;
      const messages = messageStore.get(req.params['matchId']) || [];
      const message = messages.find(m => m.id === req.params['messageId']);
      if (!message) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Message not found' } }); return; }
      message.reactions.push(body.reaction);
      res.status(200).json({ success: true, data: message });
    },
  },
  {
    method: 'PUT',
    path: '/api/messages/:matchId/:messageId/read',
    handler: async (req: Request, res: Response) => {
      const messages = messageStore.get(req.params['matchId']) || [];
      const message = messages.find(m => m.id === req.params['messageId']);
      if (!message) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Message not found' } }); return; }
      message.readAt = new Date().toISOString();
      res.status(200).json({ success: true, data: message });
    },
  },
  {
    method: 'POST',
    path: '/api/messages/:matchId/icebreaker',
    handler: async (req: Request, res: Response) => {
      const body = req.body as any;
      const message: Message = {
        id: `msg_${Date.now().toString(36)}_ice`,
        matchId: req.params['matchId'],
        senderId: req.userId!,
        content: body.icebreaker || "Hey! I thought we could start with something fun...",
        type: 'icebreaker',
        reactions: [],
        createdAt: new Date().toISOString(),
      };
      const messages = messageStore.get(req.params['matchId']) || [];
      messages.push(message);
      messageStore.set(req.params['matchId'], messages);
      res.status(201).json({ success: true, data: message });
    },
  },
];
