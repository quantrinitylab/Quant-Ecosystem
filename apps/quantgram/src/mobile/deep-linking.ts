// Quantads - Deep Linking Service
// Mobile deep link handling for advertising platform

export interface DeepLinkRoute {
  pattern: string;
  screen: string;
  params: RouteParam[];
  requiresAuth: boolean;
  fallbackUrl: string;
}

export interface RouteParam {
  name: string;
  type: 'string' | 'number' | 'boolean';
  required: boolean;
  defaultValue?: string | number | boolean;
}

export interface ParsedLink {
  route: DeepLinkRoute;
  params: Record<string, string | number | boolean>;
  query: Record<string, string>;
  fragment?: string;
  raw: string;
}

export interface DeferredDeepLink {
  id: string;
  url: string;
  createdAt: number;
  expiresAt: number;
  claimed: boolean;
  installSource?: string;
}

export interface GeneratedLink {
  url: string;
  shortUrl: string;
  qrCodeData: string;
  expiresAt?: number;
  metadata: LinkMetadata;
}

export interface LinkMetadata {
  title: string;
  description: string;
  imageUrl?: string;
  contentType: string;
  contentId: string;
}

export interface UniversalLinkConfig {
  domain: string;
  appId: string;
  paths: string[];
  excludedPaths: string[];
}

export interface AppLinkVerification {
  domain: string;
  packageName: string;
  fingerprints: string[];
  verified: boolean;
}

export class DeepLinkService {
  private routes: Map<string, DeepLinkRoute> = new Map();
  private deferredLinks: Map<string, DeferredDeepLink> = new Map();
  private lastLink: ParsedLink | null = null;
  private universalLinkConfig: UniversalLinkConfig = {
    domain: 'quantads.quant.app',
    appId: 'com.quant.quantads',
    paths: ['/campaigns/*', '/creatives/*', '/audiences/*', '/analytics/*'],
    excludedPaths: ['/api/*', '/static/*'],
  };
  private linkHistory: ParsedLink[] = [];

  constructor() {
    this.registerDefaultRoutes();
  }

  private registerDefaultRoutes(): void {
    const defaultRoutes: DeepLinkRoute[] = [
      {
        pattern: '/campaigns/:id',
        screen: 'campaignsDetail',
        params: [{ name: 'id', type: 'string', required: true }],
        requiresAuth: true,
        fallbackUrl: 'https://quantads.quant.app/campaigns',
      },
      {
        pattern: '/creatives/:id',
        screen: 'creativesDetail',
        params: [{ name: 'id', type: 'string', required: true }],
        requiresAuth: true,
        fallbackUrl: 'https://quantads.quant.app/creatives',
      },
      {
        pattern: '/audiences/:id',
        screen: 'audiencesDetail',
        params: [{ name: 'id', type: 'string', required: true }],
        requiresAuth: false,
        fallbackUrl: 'https://quantads.quant.app/audiences',
      },
      {
        pattern: '/analytics/:id',
        screen: 'analyticsDetail',
        params: [{ name: 'id', type: 'string', required: true }],
        requiresAuth: true,
        fallbackUrl: 'https://quantads.quant.app/analytics',
      },
      {
        pattern: '/settings/:section',
        screen: 'settings',
        params: [{ name: 'section', type: 'string', required: false, defaultValue: 'general' }],
        requiresAuth: true,
        fallbackUrl: 'https://quantads.quant.app/settings',
      },
      {
        pattern: '/invite/:code',
        screen: 'invite',
        params: [{ name: 'code', type: 'string', required: true }],
        requiresAuth: false,
        fallbackUrl: 'https://quantads.quant.app/invite',
      },
      {
        pattern: '/share/:contentType/:id',
        screen: 'sharedContent',
        params: [
          { name: 'contentType', type: 'string', required: true },
          { name: 'id', type: 'string', required: true },
        ],
        requiresAuth: false,
        fallbackUrl: 'https://quantads.quant.app/share',
      },
    ];
    defaultRoutes.forEach((route) => this.routes.set(route.pattern, route));
  }

  public async handleUniversalLink(url: string): Promise<ParsedLink | null> {
    const parsed = this.parseUrl(url);
    if (!parsed) return null;
    const matched = this.matchRoute(parsed.pathname, parsed.query);
    if (matched) {
      this.lastLink = matched;
      this.linkHistory.push(matched);
      return matched;
    }
    return null;
  }

  public async handleAppLink(url: string): Promise<ParsedLink | null> {
    return this.handleUniversalLink(url);
  }

  public matchRoute(path: string, query: Record<string, string> = {}): ParsedLink | null {
    for (const [pattern, route] of this.routes) {
      const params = this.extractParams(pattern, path);
      if (params !== null) {
        return { route, params, query, raw: path };
      }
    }
    return null;
  }

  private extractParams(
    pattern: string,
    path: string,
  ): Record<string, string | number | boolean> | null {
    const patternParts = pattern.split('/').filter(Boolean);
    const pathParts = path.split('/').filter(Boolean);
    if (patternParts.length !== pathParts.length) return null;
    const params: Record<string, string | number | boolean> = {};
    for (let i = 0; i < patternParts.length; i++) {
      const patternPart = patternParts[i];
      const pathPart = pathParts[i];
      if (!patternPart || !pathPart) return null;
      if (patternPart.startsWith(':')) {
        const paramName = patternPart.substring(1);
        params[paramName] = pathPart;
      } else if (patternPart !== pathPart) {
        return null;
      }
    }
    return params;
  }

  private parseUrl(
    url: string,
  ): { pathname: string; query: Record<string, string>; fragment?: string } | null {
    try {
      const urlObj = new URL(url);
      const query: Record<string, string> = {};
      urlObj.searchParams.forEach((value, key) => {
        query[key] = value;
      });
      return { pathname: urlObj.pathname, query, fragment: urlObj.hash.substring(1) || undefined };
    } catch {
      return null;
    }
  }

  public async generateLink(metadata: LinkMetadata): Promise<GeneratedLink> {
    const path = `/share/${metadata.contentType}/${metadata.contentId}`;
    const url = `https://${this.universalLinkConfig.domain}${path}`;
    const shortUrl = `https://qnt.link/${Math.random().toString(36).substr(2, 8)}`;
    return { url, shortUrl, qrCodeData: url, metadata };
  }

  public async deferredDeepLink(url: string, installSource?: string): Promise<DeferredDeepLink> {
    const deferred: DeferredDeepLink = {
      id: `deferred_${Date.now()}`,
      url,
      createdAt: Date.now(),
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      claimed: false,
      installSource,
    };
    this.deferredLinks.set(deferred.id, deferred);
    return deferred;
  }

  public claimDeferredLink(id: string): DeferredDeepLink | null {
    const deferred = this.deferredLinks.get(id);
    if (!deferred || deferred.claimed || Date.now() > deferred.expiresAt) return null;
    deferred.claimed = true;
    return deferred;
  }

  public registerRoutes(routes: DeepLinkRoute[]): void {
    routes.forEach((route) => this.routes.set(route.pattern, route));
  }

  public removeRoute(pattern: string): boolean {
    return this.routes.delete(pattern);
  }

  public getLastLink(): ParsedLink | null {
    return this.lastLink;
  }

  public getLinkHistory(): ParsedLink[] {
    return [...this.linkHistory];
  }

  public getRegisteredRoutes(): DeepLinkRoute[] {
    return Array.from(this.routes.values());
  }

  public getUniversalLinkConfig(): UniversalLinkConfig {
    return { ...this.universalLinkConfig };
  }

  public validateLink(url: string): boolean {
    const parsed = this.parseUrl(url);
    if (!parsed) return false;
    return this.matchRoute(parsed.pathname) !== null;
  }
}
