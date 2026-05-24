// ============================================================================
// QuantNeon API - Broadcast Routes
// ============================================================================

interface RouteConfig { method: string; path: string; handler: string; middleware?: string[]; }

export const broadcastRoutes: RouteConfig[] = [
  { method: 'GET', path: '/api/broadcast/channels', handler: 'BroadcastController.getChannels', middleware: ['auth'] },
  { method: 'GET', path: '/api/broadcast/channels/:id', handler: 'BroadcastController.getChannel' },
  { method: 'POST', path: '/api/broadcast/channels', handler: 'BroadcastController.createChannel', middleware: ['auth'] },
  { method: 'DELETE', path: '/api/broadcast/channels/:id', handler: 'BroadcastController.deleteChannel', middleware: ['auth'] },
  { method: 'POST', path: '/api/broadcast/channels/:id/subscribe', handler: 'BroadcastController.subscribe', middleware: ['auth'] },
  { method: 'DELETE', path: '/api/broadcast/channels/:id/subscribe', handler: 'BroadcastController.unsubscribe', middleware: ['auth'] },
  { method: 'GET', path: '/api/broadcast/channels/:id/messages', handler: 'BroadcastController.getMessages' },
  { method: 'POST', path: '/api/broadcast/channels/:id/messages', handler: 'BroadcastController.sendMessage', middleware: ['auth'] },
  { method: 'POST', path: '/api/broadcast/messages/:id/react', handler: 'BroadcastController.addReaction', middleware: ['auth'] },
];

export default broadcastRoutes;
