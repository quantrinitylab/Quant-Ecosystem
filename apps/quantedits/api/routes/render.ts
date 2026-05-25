// ============================================================================
// QuantEdits - Render Routes
// ============================================================================

interface Route {
  method: string;
  path: string;
  handler: string;
  middleware: string[];
}

const renderRoutes: Route[] = [
  { method: 'POST', path: '/api/render/start', handler: 'RenderController.startRender', middleware: ['auth', 'rateLimit'] },
  { method: 'GET', path: '/api/render/status/:jobId', handler: 'RenderController.getStatus', middleware: ['auth'] },
  { method: 'POST', path: '/api/render/cancel/:jobId', handler: 'RenderController.cancelRender', middleware: ['auth'] },
  { method: 'GET', path: '/api/render/queue', handler: 'RenderController.getQueue', middleware: ['auth'] },
  { method: 'POST', path: '/api/render/batch', handler: 'RenderController.batchRender', middleware: ['auth', 'rateLimit'] },
  { method: 'GET', path: '/api/render/presets', handler: 'RenderController.getPresets', middleware: ['auth'] },
  { method: 'POST', path: '/api/render/preview', handler: 'RenderController.generatePreview', middleware: ['auth', 'rateLimit'] },
  { method: 'GET', path: '/api/render/download/:jobId', handler: 'RenderController.downloadOutput', middleware: ['auth'] },
  { method: 'DELETE', path: '/api/render/:jobId', handler: 'RenderController.deleteJob', middleware: ['auth'] },
  { method: 'POST', path: '/api/render/thumbnail', handler: 'RenderController.generateThumbnail', middleware: ['auth'] },
];

export function registerRenderRoutes(router: { register: (route: Route) => void }): void {
  renderRoutes.forEach(route => router.register(route));
}

export { renderRoutes };
export default renderRoutes;
