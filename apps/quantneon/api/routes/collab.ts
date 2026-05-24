// ============================================================================
// QuantNeon API - Collab Routes
// ============================================================================

interface RouteConfig { method: string; path: string; handler: string; middleware?: string[]; }

export const collabRoutes: RouteConfig[] = [
  { method: 'GET', path: '/api/collab', handler: 'CollabController.getUserCollabs', middleware: ['auth'] },
  { method: 'GET', path: '/api/collab/invites/pending', handler: 'CollabController.getPendingInvites', middleware: ['auth'] },
  { method: 'GET', path: '/api/collab/invites/sent', handler: 'CollabController.getSentInvites', middleware: ['auth'] },
  { method: 'POST', path: '/api/collab/invite', handler: 'CollabController.createInvite', middleware: ['auth'] },
  { method: 'POST', path: '/api/collab/invites/:id/accept', handler: 'CollabController.acceptInvite', middleware: ['auth'] },
  { method: 'POST', path: '/api/collab/invites/:id/decline', handler: 'CollabController.declineInvite', middleware: ['auth'] },
  { method: 'DELETE', path: '/api/collab/:id', handler: 'CollabController.deleteCollab', middleware: ['auth'] },
];

export default collabRoutes;
