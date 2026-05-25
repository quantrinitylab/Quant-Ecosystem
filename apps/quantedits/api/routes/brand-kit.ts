// ============================================================================
// QuantEdits - Brand Kit Routes
// ============================================================================

interface Route {
  method: string;
  path: string;
  handler: string;
  middleware: string[];
}

const brandKitRoutes: Route[] = [
  { method: 'GET', path: '/api/brand-kits', handler: 'BrandKitController.listKits', middleware: ['auth'] },
  { method: 'POST', path: '/api/brand-kits', handler: 'BrandKitController.createKit', middleware: ['auth'] },
  { method: 'GET', path: '/api/brand-kits/:id', handler: 'BrandKitController.getKit', middleware: ['auth'] },
  { method: 'PUT', path: '/api/brand-kits/:id', handler: 'BrandKitController.updateKit', middleware: ['auth'] },
  { method: 'DELETE', path: '/api/brand-kits/:id', handler: 'BrandKitController.deleteKit', middleware: ['auth'] },
  { method: 'POST', path: '/api/brand-kits/:id/logos', handler: 'BrandKitController.addLogo', middleware: ['auth'] },
  { method: 'DELETE', path: '/api/brand-kits/:id/logos/:logoId', handler: 'BrandKitController.removeLogo', middleware: ['auth'] },
  { method: 'PUT', path: '/api/brand-kits/:id/colors', handler: 'BrandKitController.updateColors', middleware: ['auth'] },
  { method: 'POST', path: '/api/brand-kits/:id/fonts', handler: 'BrandKitController.addFont', middleware: ['auth'] },
  { method: 'POST', path: '/api/brand-kits/:id/share', handler: 'BrandKitController.shareKit', middleware: ['auth'] },
  { method: 'POST', path: '/api/brand-kits/:id/apply', handler: 'BrandKitController.applyToProject', middleware: ['auth'] },
  { method: 'POST', path: '/api/brand-kits/:id/check-consistency', handler: 'BrandKitController.checkConsistency', middleware: ['auth'] },
];

export function registerBrandKitRoutes(router: { register: (route: Route) => void }): void {
  brandKitRoutes.forEach(route => router.register(route));
}

export { brandKitRoutes };
export default brandKitRoutes;
