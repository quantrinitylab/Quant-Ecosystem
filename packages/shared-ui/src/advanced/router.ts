// ============================================================================
// @quant/shared-ui - Advanced Client-Side Router
// ============================================================================

import { Route, RouteMatch, RouteParams, NavigationEvent, RouterConfig, RouteMeta } from './types';

interface CompiledRoute {
  route: Route;
  regex: RegExp;
  paramNames: string[];
  parent: CompiledRoute | null;
}

interface HistoryEntry {
  path: string;
  state?: any;
  timestamp: number;
}

type NavigationHook = (to: RouteMatch, from: RouteMatch | null) => Promise<boolean> | boolean;

export class Router {
  private routes: Route[] = [];
  private compiledRoutes: CompiledRoute[] = [];
  private currentMatch: RouteMatch | null = null;
  private history: HistoryEntry[] = [];
  private historyIndex: number = -1;
  private beforeHooks: NavigationHook[] = [];
  private afterHooks: Array<(to: RouteMatch, from: RouteMatch | null) => void> = [];
  private navigationEvents: NavigationEvent[] = [];
  private listeners: Set<(match: RouteMatch | null) => void> = new Set();
  private base: string;
  private scrollBehavior: 'top' | 'restore' | 'none';
  private scrollPositions: Map<string, { x: number; y: number }> = new Map();

  constructor(config: RouterConfig) {
    this.routes = config.routes || [];
    this.base = config.base || '';
    this.scrollBehavior = config.scrollBehavior || 'top';
    this.compileRoutes(this.routes, null);
  }

  // Compile route patterns to regex for fast matching
  private compileRoutes(routes: Route[], parent: CompiledRoute | null): void {
    for (const route of routes) {
      const compiled = this.compileRoute(route, parent);
      this.compiledRoutes.push(compiled);
      if (route.children && route.children.length > 0) {
        this.compileRoutes(route.children, compiled);
      }
    }
  }

  private compileRoute(route: Route, parent: CompiledRoute | null): CompiledRoute {
    const paramNames: string[] = [];
    let fullPath = route.path;
    if (parent) {
      const parentPath = parent.route.path.replace(/\/$/, '');
      fullPath = parentPath + '/' + route.path.replace(/^\//, '');
    }
    // Convert path pattern to regex in a single pass so escaping and
    // wildcard/param substitution cannot interfere with one another.
    const regexStr = fullPath.replace(
      /:([^/]+)|\*|[.\/+?^${}()|[\]\\]/g,
      (m, paramName) => {
        if (paramName) {
          paramNames.push(paramName);
          return '([^/]+)';
        }
        if (m === '*') return '(.*)';
        return '\\' + m; // escape any other regex metacharacter literally
      },
    );

    const regex = new RegExp(`^${regexStr}$`);
    return { route: { ...route, path: fullPath }, regex, paramNames, parent };
  }

  // Register new routes dynamically
  addRoute(route: Route, parentPath?: string): void {
    if (parentPath) {
      const parent = this.compiledRoutes.find((cr) => cr.route.path === parentPath);
      if (parent) {
        if (!parent.route.children) parent.route.children = [];
        parent.route.children.push(route);
        this.compileRoute(route, parent);
      }
    } else {
      this.routes.push(route);
      const compiled = this.compileRoute(route, null);
      this.compiledRoutes.push(compiled);
    }
  }

  // Remove a route by path
  removeRoute(path: string): void {
    this.compiledRoutes = this.compiledRoutes.filter((cr) => cr.route.path !== path);
    this.routes = this.routes.filter((r) => r.path !== path);
  }

  // Match a path against registered routes
  match(path: string): RouteMatch | null {
    const parts = path.split('?');
    const pathname = parts[0] ?? '';
    const queryString = parts[1] ?? '';
    const normalizedPath = this.normalizePath(pathname);
    const query = this.parseQueryString(queryString);

    for (const compiled of this.compiledRoutes) {
      const match = normalizedPath.match(compiled.regex);
      if (match) {
        const params: RouteParams = {};
        compiled.paramNames.forEach((name, index) => {
          params[name] = decodeURIComponent(match[index + 1] ?? '');
        });
        const matched = this.getMatchedChain(compiled);
        return {
          route: compiled.route,
          params,
          query,
          path: normalizedPath,
          matched,
        };
      }
    }
    return null;
  }

  // Get full chain of matched routes (for nested routes)
  private getMatchedChain(compiled: CompiledRoute): Route[] {
    const chain: Route[] = [];
    let current: CompiledRoute | null = compiled;
    while (current) {
      chain.unshift(current.route);
      current = current.parent;
    }
    return chain;
  }

  // Normalize path (remove trailing slash, add leading slash)
  private normalizePath(path: string): string {
    let normalized = path;
    if (this.base && normalized.startsWith(this.base)) {
      normalized = normalized.slice(this.base.length);
    }
    if (!normalized.startsWith('/')) normalized = '/' + normalized;
    if (normalized.length > 1 && normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  }

  // Parse query string into key-value pairs
  parseQueryString(queryString: string): Record<string, string> {
    const params: Record<string, string> = {};
    if (!queryString) return params;
    const parts = queryString.replace(/^\?/, '').split('&');
    for (const part of parts) {
      if (!part) continue;
      const splitParts = part.split('=');
      const key = splitParts[0] ?? '';
      const value = splitParts.slice(1).join('=');
      params[decodeURIComponent(key)] = decodeURIComponent(value || '');
    }
    return params;
  }

  // Build query string from params object
  buildQueryString(params: Record<string, string>): string {
    const parts = Object.entries(params)
      .filter(([_, v]) => v !== undefined && v !== null)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
    return parts.length > 0 ? '?' + parts.join('&') : '';
  }

  // Build full URL from path and params
  buildUrl(path: string, params?: RouteParams, query?: Record<string, string>): string {
    let url = path;
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url = url.replace(`:${key}`, encodeURIComponent(value));
      }
    }
    if (query) {
      url += this.buildQueryString(query);
    }
    return this.base + url;
  }

  // Navigate to a new path (push)
  async push(path: string, state?: any): Promise<boolean> {
    return this.navigate(path, 'push', state);
  }

  // Replace current path
  async replace(path: string, state?: any): Promise<boolean> {
    return this.navigate(path, 'replace', state);
  }

  // Go back in history
  async back(): Promise<boolean> {
    if (this.historyIndex <= 0) return false;
    const prevEntry = this.history[this.historyIndex - 1];
    if (prevEntry) {
      return this.navigate(prevEntry.path, 'pop');
    }
    return false;
  }

  // Go forward in history
  async forward(): Promise<boolean> {
    if (this.historyIndex >= this.history.length - 1) return false;
    const nextEntry = this.history[this.historyIndex + 1];
    if (nextEntry) {
      return this.navigate(nextEntry.path, 'pop');
    }
    return false;
  }

  // Core navigation logic
  private async navigate(
    path: string,
    type: 'push' | 'replace' | 'pop',
    state?: any,
  ): Promise<boolean> {
    const newMatch = this.match(path);
    if (!newMatch) return false;

    // Handle redirects
    if (newMatch.route.redirect) {
      return this.navigate(newMatch.route.redirect, 'replace');
    }

    // Run before hooks
    for (const hook of this.beforeHooks) {
      const result = await hook(newMatch, this.currentMatch);
      if (!result) return false;
    }

    // Run route guards (canDeactivate on current, canActivate on new)
    if (this.currentMatch && this.currentMatch.route.guards) {
      for (const guard of this.currentMatch.route.guards) {
        if (guard.canDeactivate) {
          const canLeave = await guard.canDeactivate(this.currentMatch, newMatch);
          if (!canLeave) return false;
        }
      }
    }

    if (newMatch.route.guards) {
      for (const guard of newMatch.route.guards) {
        if (guard.canActivate) {
          const canEnter = await guard.canActivate(newMatch, this.currentMatch);
          if (!canEnter) return false;
        }
      }
    }

    // Save scroll position for current route
    if (this.currentMatch && this.scrollBehavior === 'restore') {
      this.scrollPositions.set(this.currentMatch.path, { x: 0, y: 0 });
    }

    // Lazy load component if needed
    if (newMatch.route.load) {
      try {
        await newMatch.route.load();
      } catch (e) {
        return false;
      }
    }

    const previousMatch = this.currentMatch;
    this.currentMatch = newMatch;

    // Update history
    const entry: HistoryEntry = { path, state, timestamp: Date.now() };
    if (type === 'push') {
      if (this.historyIndex < this.history.length - 1) {
        this.history = this.history.slice(0, this.historyIndex + 1);
      }
      this.history.push(entry);
      this.historyIndex = this.history.length - 1;
    } else if (type === 'replace') {
      this.history[this.historyIndex] = entry;
    } else if (type === 'pop') {
      const newIndex = this.history.findIndex((h) => h.path === path);
      if (newIndex >= 0) this.historyIndex = newIndex;
    }

    // Record navigation event
    const event: NavigationEvent = {
      type:
        type === 'pop' ? (this.historyIndex < this.history.length - 1 ? 'back' : 'forward') : type,
      from: previousMatch,
      to: newMatch,
      timestamp: Date.now(),
    };
    this.navigationEvents.push(event);

    // Notify listeners
    this.listeners.forEach((listener) => listener(newMatch));

    // Run after hooks
    for (const hook of this.afterHooks) {
      hook(newMatch, previousMatch);
    }

    return true;
  }

  // Register before navigation hook
  beforeEach(hook: NavigationHook): () => void {
    this.beforeHooks.push(hook);
    return () => {
      const index = this.beforeHooks.indexOf(hook);
      if (index > -1) this.beforeHooks.splice(index, 1);
    };
  }

  // Register after navigation hook
  afterEach(hook: (to: RouteMatch, from: RouteMatch | null) => void): () => void {
    this.afterHooks.push(hook);
    return () => {
      const index = this.afterHooks.indexOf(hook);
      if (index > -1) this.afterHooks.splice(index, 1);
    };
  }

  // Subscribe to route changes
  subscribe(listener: (match: RouteMatch | null) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // Get current route match
  getCurrentMatch(): RouteMatch | null {
    return this.currentMatch;
  }

  // Get navigation history
  getHistory(): HistoryEntry[] {
    return [...this.history];
  }

  // Get navigation events log
  getNavigationEvents(): NavigationEvent[] {
    return [...this.navigationEvents];
  }

  // Check if a path is active
  isActive(path: string, exact: boolean = false): boolean {
    if (!this.currentMatch) return false;
    if (exact) return this.currentMatch.path === this.normalizePath(path);
    return this.currentMatch.path.startsWith(this.normalizePath(path));
  }

  // Get route metadata
  getMeta(): RouteMeta | undefined {
    return this.currentMatch?.route.meta;
  }

  // Generate breadcrumbs from matched chain
  getBreadcrumbs(): Array<{ label: string; path: string }> {
    if (!this.currentMatch) return [];
    return this.currentMatch.matched.map((route) => ({
      label: route.meta?.title || route.path,
      path: route.path,
    }));
  }

  // Get all registered route paths
  getRoutes(): Route[] {
    return [...this.routes];
  }

  // Resolve relative path
  resolve(relativePath: string): string {
    if (relativePath.startsWith('/')) return relativePath;
    const currentPath = this.currentMatch?.path || '/';
    const base = currentPath.split('/').slice(0, -1).join('/');
    return this.normalizePath(base + '/' + relativePath);
  }

  destroy(): void {
    this.listeners.clear();
    this.beforeHooks = [];
    this.afterHooks = [];
    this.history = [];
    this.navigationEvents = [];
    this.compiledRoutes = [];
    this.scrollPositions.clear();
  }
}

export default Router;

// Security: CodeQL #35/#36: wildcard replacement is global (complete sanitization).
