// ============================================================================
// QuantNeon API - Highlights Routes
// ============================================================================

interface RouteConfig { method: string; path: string; handler: string; middleware?: string[]; }

export const highlightsRoutes: RouteConfig[] = [
  { method: 'GET', path: '/api/highlights/:userId', handler: 'HighlightsController.getUserHighlights' },
  { method: 'GET', path: '/api/highlights/:id/stories', handler: 'HighlightsController.getStories' },
  { method: 'POST', path: '/api/highlights', handler: 'HighlightsController.createHighlight', middleware: ['auth'] },
  { method: 'PUT', path: '/api/highlights/:id', handler: 'HighlightsController.updateHighlight', middleware: ['auth'] },
  { method: 'DELETE', path: '/api/highlights/:id', handler: 'HighlightsController.deleteHighlight', middleware: ['auth'] },
  { method: 'POST', path: '/api/highlights/:id/stories', handler: 'HighlightsController.addStories', middleware: ['auth'] },
  { method: 'DELETE', path: '/api/highlights/:id/stories/:storyId', handler: 'HighlightsController.removeStory', middleware: ['auth'] },
  { method: 'PUT', path: '/api/highlights/reorder', handler: 'HighlightsController.reorder', middleware: ['auth'] },
  { method: 'PUT', path: '/api/highlights/:id/cover', handler: 'HighlightsController.setCover', middleware: ['auth'] },
];

export default highlightsRoutes;
