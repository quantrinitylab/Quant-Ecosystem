// ============================================================================
// QuantTube API - Shorts Routes
// ============================================================================

import { ShortsController } from '../controllers/shorts-controller';

interface RouteConfig {
  method: string;
  path: string;
  handler: string;
  middleware?: string[];
}

export const shortsRoutes: RouteConfig[] = [
  { method: 'GET', path: '/api/shorts/feed', handler: 'ShortsController.getFeed', middleware: ['auth', 'rateLimit'] },
  { method: 'GET', path: '/api/shorts/trending', handler: 'ShortsController.getTrending', middleware: ['rateLimit'] },
  { method: 'GET', path: '/api/shorts/:id', handler: 'ShortsController.getShort', middleware: ['rateLimit'] },
  { method: 'POST', path: '/api/shorts', handler: 'ShortsController.createShort', middleware: ['auth', 'upload'] },
  { method: 'DELETE', path: '/api/shorts/:id', handler: 'ShortsController.deleteShort', middleware: ['auth'] },
  { method: 'POST', path: '/api/shorts/:id/like', handler: 'ShortsController.toggleLike', middleware: ['auth'] },
  { method: 'POST', path: '/api/shorts/:id/comment', handler: 'ShortsController.addComment', middleware: ['auth'] },
  { method: 'POST', path: '/api/shorts/:id/share', handler: 'ShortsController.shareShort', middleware: ['auth'] },
  { method: 'POST', path: '/api/shorts/:id/view', handler: 'ShortsController.recordView', middleware: ['auth'] },
  { method: 'GET', path: '/api/shorts/sounds', handler: 'ShortsController.getSoundLibrary', middleware: ['rateLimit'] },
  { method: 'GET', path: '/api/shorts/sounds/:id', handler: 'ShortsController.getSound', middleware: ['rateLimit'] },
];

export function registerShortsRoutes(router: any): void {
  const controller = new ShortsController();
  shortsRoutes.forEach(route => {
    const method = route.method.toLowerCase();
    if (typeof router[method] === 'function') {
      router[method](route.path, (req: any, res: any) => {
        const handlerName = route.handler.split('.')[1];
        (controller as any)[handlerName](req, res);
      });
    }
  });
}

export default shortsRoutes;
