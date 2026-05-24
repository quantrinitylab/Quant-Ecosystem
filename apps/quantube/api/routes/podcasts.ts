// ============================================================================
// QuantTube API - Podcasts Routes
// ============================================================================

import { PodcastsController } from '../controllers/podcasts-controller';

interface RouteConfig {
  method: string;
  path: string;
  handler: string;
  middleware?: string[];
}

export const podcastsRoutes: RouteConfig[] = [
  { method: 'GET', path: '/api/podcasts', handler: 'PodcastsController.browse', middleware: ['rateLimit'] },
  { method: 'GET', path: '/api/podcasts/search', handler: 'PodcastsController.search', middleware: ['rateLimit'] },
  { method: 'GET', path: '/api/podcasts/subscriptions', handler: 'PodcastsController.getSubscriptions', middleware: ['auth'] },
  { method: 'GET', path: '/api/podcasts/:id', handler: 'PodcastsController.getPodcast', middleware: ['rateLimit'] },
  { method: 'GET', path: '/api/podcasts/:id/episodes', handler: 'PodcastsController.getEpisodes', middleware: ['rateLimit'] },
  { method: 'POST', path: '/api/podcasts/import', handler: 'PodcastsController.importRSS', middleware: ['auth'] },
  { method: 'POST', path: '/api/podcasts/:id/subscribe', handler: 'PodcastsController.subscribe', middleware: ['auth'] },
  { method: 'DELETE', path: '/api/podcasts/:id/subscribe', handler: 'PodcastsController.unsubscribe', middleware: ['auth'] },
  { method: 'POST', path: '/api/podcasts/episodes/:id/play', handler: 'PodcastsController.recordPlay', middleware: ['auth'] },
  { method: 'POST', path: '/api/podcasts/episodes/:id/transcribe', handler: 'PodcastsController.generateTranscription', middleware: ['auth'] },
  { method: 'POST', path: '/api/podcasts/episodes/:id/chapters', handler: 'PodcastsController.generateChapters', middleware: ['auth'] },
];

export function registerPodcastsRoutes(router: any): void {
  const controller = new PodcastsController();
  podcastsRoutes.forEach(route => {
    const method = route.method.toLowerCase();
    if (typeof router[method] === 'function') {
      router[method](route.path, (req: any, res: any) => {
        const handlerName = route.handler.split('.')[1];
        (controller as any)[handlerName](req, res);
      });
    }
  });
}

export default podcastsRoutes;
