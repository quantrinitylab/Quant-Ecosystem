// ============================================================================
// QuantEdits API - Collaboration Routes
// Real-time collaborative editing, comments, approvals, team workspaces
// ============================================================================

import type { Request, Response } from '../middleware';
import type { RouteDefinition, Collaborator, Comment } from '../../src/types';

const projectCollaborators: Map<string, Collaborator[]> = new Map();
const projectComments: Map<string, Comment[]> = new Map();

export const collaborationRoutes: RouteDefinition[] = [
  {
    method: 'POST',
    path: '/api/collaboration/:projectId/invite',
    handler: async (req: Request, res: Response) => {
      const body = req.body as any;
      const collaborator: Collaborator = {
        userId: body.userId,
        username: body.username || 'Unknown',
        role: body.role || 'viewer',
        joinedAt: new Date().toISOString(),
        isOnline: false,
      };
      const collabs = projectCollaborators.get(req.params['projectId']) || [];
      if (collabs.find(c => c.userId === body.userId)) {
        res.status(409).json({ success: false, error: { code: 'ALREADY_INVITED', message: 'User already invited' } });
        return;
      }
      collabs.push(collaborator);
      projectCollaborators.set(req.params['projectId'], collabs);
      res.status(201).json({ success: true, data: collaborator });
    },
  },
  {
    method: 'GET',
    path: '/api/collaboration/:projectId/members',
    handler: async (req: Request, res: Response) => {
      const collabs = projectCollaborators.get(req.params['projectId']) || [];
      res.status(200).json({ success: true, data: collabs });
    },
  },
  {
    method: 'PUT',
    path: '/api/collaboration/:projectId/members/:userId',
    handler: async (req: Request, res: Response) => {
      const collabs = projectCollaborators.get(req.params['projectId']) || [];
      const collab = collabs.find(c => c.userId === req.params['userId']);
      if (!collab) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Collaborator not found' } }); return; }
      const body = req.body as any;
      if (body.role) collab.role = body.role;
      res.status(200).json({ success: true, data: collab });
    },
  },
  {
    method: 'DELETE',
    path: '/api/collaboration/:projectId/members/:userId',
    handler: async (req: Request, res: Response) => {
      const collabs = projectCollaborators.get(req.params['projectId']) || [];
      const idx = collabs.findIndex(c => c.userId === req.params['userId']);
      if (idx === -1) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Collaborator not found' } }); return; }
      collabs.splice(idx, 1);
      res.status(200).json({ success: true, message: 'Collaborator removed' });
    },
  },
  {
    method: 'POST',
    path: '/api/collaboration/:projectId/comments',
    handler: async (req: Request, res: Response) => {
      const body = req.body as any;
      const comment: Comment = {
        id: `comment_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
        projectId: req.params['projectId'],
        userId: req.userId!,
        username: req.user?.username || 'Unknown',
        content: body.content,
        timestamp: body.timestamp || 0,
        layerId: body.layerId,
        position: body.position,
        resolved: false,
        replies: [],
        createdAt: new Date().toISOString(),
      };
      const comments = projectComments.get(req.params['projectId']) || [];
      comments.push(comment);
      projectComments.set(req.params['projectId'], comments);
      res.status(201).json({ success: true, data: comment });
    },
  },
  {
    method: 'GET',
    path: '/api/collaboration/:projectId/comments',
    handler: async (req: Request, res: Response) => {
      const comments = projectComments.get(req.params['projectId']) || [];
      res.status(200).json({ success: true, data: comments });
    },
  },
  {
    method: 'PUT',
    path: '/api/collaboration/:projectId/comments/:commentId/resolve',
    handler: async (req: Request, res: Response) => {
      const comments = projectComments.get(req.params['projectId']) || [];
      const comment = comments.find(c => c.id === req.params['commentId']);
      if (!comment) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Comment not found' } }); return; }
      comment.resolved = true;
      res.status(200).json({ success: true, data: comment });
    },
  },
  {
    method: 'POST',
    path: '/api/collaboration/:projectId/comments/:commentId/reply',
    handler: async (req: Request, res: Response) => {
      const comments = projectComments.get(req.params['projectId']) || [];
      const comment = comments.find(c => c.id === req.params['commentId']);
      if (!comment) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Comment not found' } }); return; }
      const body = req.body as any;
      const reply: Comment = {
        id: `reply_${Date.now().toString(36)}`,
        projectId: req.params['projectId'],
        userId: req.userId!,
        username: req.user?.username || 'Unknown',
        content: body.content,
        timestamp: 0,
        resolved: false,
        replies: [],
        createdAt: new Date().toISOString(),
      };
      comment.replies.push(reply);
      res.status(201).json({ success: true, data: reply });
    },
  },
  {
    method: 'POST',
    path: '/api/collaboration/:projectId/cursor',
    handler: async (req: Request, res: Response) => {
      const body = req.body as any;
      const collabs = projectCollaborators.get(req.params['projectId']) || [];
      const collab = collabs.find(c => c.userId === req.userId);
      if (collab) {
        collab.cursorPosition = body.position;
        collab.selectedLayerId = body.selectedLayerId;
        collab.isOnline = true;
      }
      res.status(200).json({ success: true, message: 'Cursor updated' });
    },
  },
];
