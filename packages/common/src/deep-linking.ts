// ============================================================================
// Deep Linking Service - Cross-App Universal Link Navigation
// ============================================================================

export interface DeepLink {
  app: string;
  path: string;
  params: Record<string, string>;
  fullUrl: string;
}

export interface LinkHandler {
  pattern: RegExp;
  app: string;
  handler: (params: Record<string, string>) => string;
}

interface RegisteredHandler {
  pattern: RegExp;
  app: string;
  handler: (params: Record<string, string>) => string;
}

export class DeepLinkingService {
  private handlers: RegisteredHandler[] = [];
  private readonly PROTOCOL = 'quant://';

  generateLink(app: string, path: string, params?: Record<string, string>): string {
    let url = `${this.PROTOCOL}${app}/${path.replace(/^\//, '')}`;
    if (params && Object.keys(params).length > 0) {
      const query = Object.entries(params)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');
      url += `?${query}`;
    }
    return url;
  }

  parseLink(url: string): DeepLink | null {
    if (!url.startsWith(this.PROTOCOL)) {
      return null;
    }

    const stripped = url.slice(this.PROTOCOL.length);
    const [pathPart, queryPart] = stripped.split('?') as [string, string | undefined];
    const segments = pathPart.split('/');
    const app = segments[0];

    if (!app) {
      return null;
    }

    const path = '/' + segments.slice(1).join('/');
    const params: Record<string, string> = {};

    if (queryPart) {
      const pairs = queryPart.split('&');
      for (const pair of pairs) {
        const [key, value] = pair.split('=') as [string, string | undefined];
        if (key) {
          params[decodeURIComponent(key)] = decodeURIComponent(value ?? '');
        }
      }
    }

    return { app, path, params, fullUrl: url };
  }

  registerHandler(
    app: string,
    pattern: string,
    handler: (params: Record<string, string>) => string,
  ): void {
    this.handlers.push({
      pattern: new RegExp(pattern),
      app,
      handler,
    });
  }

  getHandlers(): LinkHandler[] {
    return this.handlers.map((h) => ({
      pattern: h.pattern,
      app: h.app,
      handler: h.handler,
    }));
  }

  isValidLink(url: string): boolean {
    if (!url.startsWith(this.PROTOCOL)) {
      return false;
    }
    const parsed = this.parseLink(url);
    return parsed !== null && parsed.app.length > 0;
  }

  getAppFromLink(url: string): string | null {
    const parsed = this.parseLink(url);
    return parsed?.app ?? null;
  }

  buildWebFallback(deepLink: DeepLink): string {
    let fallback = `https://${deepLink.app}.quant.app${deepLink.path}`;
    if (Object.keys(deepLink.params).length > 0) {
      const query = Object.entries(deepLink.params)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');
      fallback += `?${query}`;
    }
    return fallback;
  }
}
