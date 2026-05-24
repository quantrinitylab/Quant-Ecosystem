// ============================================================================
// QuantTube API - Premium Routes
// ============================================================================

interface RouteConfig {
  method: string;
  path: string;
  handler: string;
  middleware?: string[];
}

export const premiumRoutes: RouteConfig[] = [
  { method: 'GET', path: '/api/premium/plans', handler: 'PremiumController.getPlans' },
  { method: 'GET', path: '/api/premium/status', handler: 'PremiumController.getStatus', middleware: ['auth'] },
  { method: 'POST', path: '/api/premium/subscribe', handler: 'PremiumController.subscribe', middleware: ['auth'] },
  { method: 'POST', path: '/api/premium/cancel', handler: 'PremiumController.cancel', middleware: ['auth'] },
  { method: 'PUT', path: '/api/premium/plan', handler: 'PremiumController.changePlan', middleware: ['auth'] },
  { method: 'GET', path: '/api/premium/content', handler: 'PremiumController.getExclusiveContent', middleware: ['auth'] },
  { method: 'GET', path: '/api/premium/billing', handler: 'PremiumController.getBillingHistory', middleware: ['auth'] },
];

export function registerPremiumRoutes(router: any): void {
  premiumRoutes.forEach(route => {
    const method = route.method.toLowerCase();
    if (typeof router[method] === 'function') {
      router[method](route.path, (req: any, res: any) => {
        res.status(200).json({ success: true, route: route.path });
      });
    }
  });
}

export default premiumRoutes;
