/**
 * Quanty navigation registry contracts.
 *
 * A registry maps each product (app) to the routes Quanty may hand off to.
 * Routes are declarative path patterns such as "/mail/thread/:threadId".
 * Registration and lookup only — this module never navigates anywhere.
 */

export interface QuantyRoute {
  /** Unique within the app, e.g. "mail.thread". */
  routeId: string;
  /** Owning product, e.g. "quantmail". */
  appId: string;
  /** Path pattern; ":name" segments are parameters, e.g. "/mail/thread/:threadId". */
  path: string;
  title?: string;
  description?: string;
  /** Intent actions this route can satisfy, e.g. ["open", "view"]. */
  actions?: string[];
  /** Capability the caller must hold for this route to be handed off. */
  requiredCapability?: string;
  /** At most one default route per app; used as the resolution fallback. */
  isDefault?: boolean;
}

export interface RouteMatch {
  route: QuantyRoute;
  params: Record<string, string>;
}

export interface NavigationRegistry {
  register(route: QuantyRoute): void;
  get(appId: string, routeId: string): QuantyRoute | undefined;
  /** All routes registered for an app, in registration order. */
  list(appId: string): QuantyRoute[];
  /** App ids that have at least one route. */
  apps(): string[];
  defaultRoute(appId: string): QuantyRoute | undefined;
  /** Match a concrete path against the app's route patterns. */
  matchPath(appId: string, path: string): RouteMatch | undefined;
}

function assertRoute(route: QuantyRoute): void {
  if (!route.routeId || !route.routeId.trim()) throw new Error('ROUTE_ID_REQUIRED');
  if (!route.appId || !route.appId.trim()) throw new Error('ROUTE_APP_REQUIRED');
  if (!route.path.startsWith('/')) throw new Error('ROUTE_PATH_MUST_START_WITH_SLASH');
  for (const segment of route.path.split('/')) {
    if (segment.startsWith(':') && segment.length === 1) throw new Error('ROUTE_EMPTY_PARAM_NAME');
  }
}

function normalize(path: string): string {
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
}

function matchPattern(pattern: string, path: string): Record<string, string> | undefined {
  const patternSegments = normalize(pattern).split('/');
  const pathSegments = normalize(path).split('/');
  if (patternSegments.length !== pathSegments.length) return undefined;
  const params: Record<string, string> = {};
  for (let i = 0; i < patternSegments.length; i++) {
    const p = patternSegments[i] as string;
    const s = pathSegments[i] as string;
    if (p.startsWith(':')) {
      params[p.slice(1)] = decodeURIComponent(s);
    } else if (p !== s) {
      return undefined;
    }
  }
  return params;
}

/**
 * In-memory navigation registry. Duplicate (appId, routeId) registrations
 * throw; at most one default route per app is allowed.
 */
export class InMemoryNavigationRegistry implements NavigationRegistry {
  private readonly routes = new Map<string, QuantyRoute[]>();

  register(route: QuantyRoute): void {
    assertRoute(route);
    const list = this.routes.get(route.appId) ?? [];
    if (list.some((r) => r.routeId === route.routeId)) {
      throw new Error(`ROUTE_ALREADY_REGISTERED:${route.appId}/${route.routeId}`);
    }
    if (route.isDefault && list.some((r) => r.isDefault)) {
      throw new Error(`DEFAULT_ROUTE_ALREADY_REGISTERED:${route.appId}`);
    }
    this.routes.set(route.appId, [...list, { ...route }]);
  }

  get(appId: string, routeId: string): QuantyRoute | undefined {
    const found = this.routes.get(appId)?.find((r) => r.routeId === routeId);
    return found ? { ...found } : undefined;
  }

  list(appId: string): QuantyRoute[] {
    return (this.routes.get(appId) ?? []).map((r) => ({ ...r }));
  }

  apps(): string[] {
    return [...this.routes.keys()];
  }

  defaultRoute(appId: string): QuantyRoute | undefined {
    const found = this.routes.get(appId)?.find((r) => r.isDefault);
    return found ? { ...found } : undefined;
  }

  matchPath(appId: string, path: string): RouteMatch | undefined {
    for (const route of this.routes.get(appId) ?? []) {
      const params = matchPattern(route.path, path);
      if (params) return { route: { ...route }, params };
    }
    return undefined;
  }
}
