// ============================================================================
// Performance Package - Resource Preloader
// Link rel generation, fetch priority hints, critical resource detection,
// dependency ordering
// ============================================================================

import type { PreloadHint, ResourceType, FetchPriority } from '../types';

/** Resource dependency definition */
interface ResourceDependency {
  url: string;
  type: ResourceType;
  critical: boolean;
  dependsOn: string[];
  size: number;
  loadTime: number;
}

/** Critical path resource */
interface CriticalResource {
  url: string;
  type: ResourceType;
  priority: FetchPriority;
  blocking: boolean;
  discoveryTime: number;
}

/** Preloader statistics */
interface PreloaderStats {
  totalResources: number;
  criticalResources: number;
  preloadGenerated: number;
  prefetchGenerated: number;
  preconnectGenerated: number;
  estimatedTimeSaved: number;
}

/**
 * ResourcePreloader generates optimal resource loading hints including
 * preload, prefetch, preconnect, and dns-prefetch. Detects critical
 * resources and orders dependencies for minimal waterfall.
 */
export class ResourcePreloader {
  private readonly resources: Map<string, ResourceDependency>;
  private readonly criticalResources: Map<string, CriticalResource>;
  private readonly origins: Set<string>;
  private readonly generatedHints: PreloadHint[];
  private readonly discoveredOrigins: Map<string, number>;

  constructor() {
    this.resources = new Map();
    this.criticalResources = new Map();
    this.origins = new Set();
    this.generatedHints = [];
    this.discoveredOrigins = new Map();
  }

  /**
   * Register a resource for preload analysis.
   */
  addResource(
    url: string,
    type: ResourceType,
    options: {
      critical?: boolean;
      dependsOn?: string[];
      size?: number;
      loadTime?: number;
    } = {}
  ): void {
    this.resources.set(url, {
      url,
      type,
      critical: options.critical ?? false,
      dependsOn: options.dependsOn ?? [],
      size: options.size ?? 0,
      loadTime: options.loadTime ?? 0,
    });

    // Extract and track origin
    const origin = this.extractOrigin(url);
    if (origin) {
      this.origins.add(origin);
      this.discoveredOrigins.set(origin, Date.now());
    }

    // Mark as critical if specified
    if (options.critical) {
      this.criticalResources.set(url, {
        url,
        type,
        priority: 'high',
        blocking: type === 'style' || type === 'font',
        discoveryTime: Date.now(),
      });
    }
  }

  /**
   * Generate preload hints for all critical resources.
   */
  generatePreloadHints(): PreloadHint[] {
    const hints: PreloadHint[] = [];

    // Sort critical resources by dependency order
    const ordered = this.getTopologicalOrder();

    for (const url of ordered) {
      const resource = this.resources.get(url);
      if (!resource || !resource.critical) continue;

      const hint: PreloadHint = {
        href: url,
        as: resource.type,
        type: this.getMimeType(resource.type, url),
        crossorigin: this.isCrossOrigin(url),
        fetchPriority: this.determinePriority(resource),
        rel: 'preload',
      };

      hints.push(hint);
    }

    this.generatedHints.push(...hints);
    return hints;
  }

  /**
   * Generate prefetch hints for anticipated navigation resources.
   */
  generatePrefetchHints(anticipatedUrls: string[]): PreloadHint[] {
    const hints: PreloadHint[] = [];

    for (const url of anticipatedUrls) {
      const resource = this.resources.get(url);
      const type = resource?.type ?? this.inferResourceType(url);

      hints.push({
        href: url,
        as: type,
        type: this.getMimeType(type, url),
        crossorigin: this.isCrossOrigin(url),
        fetchPriority: 'low',
        rel: 'prefetch',
      });
    }

    this.generatedHints.push(...hints);
    return hints;
  }

  /**
   * Generate preconnect hints for third-party origins.
   */
  generatePreconnectHints(): PreloadHint[] {
    const hints: PreloadHint[] = [];
    const currentOrigin = 'https://localhost';

    for (const origin of this.origins) {
      if (origin === currentOrigin) continue;

      hints.push({
        href: origin,
        as: 'fetch',
        crossorigin: true,
        fetchPriority: 'high',
        rel: 'preconnect',
      });
    }

    this.generatedHints.push(...hints);
    return hints;
  }

  /**
   * Generate dns-prefetch hints for discovered origins.
   */
  generateDnsPrefetchHints(): PreloadHint[] {
    const hints: PreloadHint[] = [];

    for (const origin of this.origins) {
      hints.push({
        href: origin,
        as: 'fetch',
        crossorigin: false,
        fetchPriority: 'auto',
        rel: 'dns-prefetch',
      });
    }

    return hints;
  }

  /**
   * Detect critical rendering path resources.
   */
  detectCriticalResources(): CriticalResource[] {
    const critical: CriticalResource[] = [];

    for (const resource of this.resources.values()) {
      // CSS and fonts are always render-blocking
      if (resource.type === 'style' || resource.type === 'font') {
        critical.push({
          url: resource.url,
          type: resource.type,
          priority: 'high',
          blocking: true,
          discoveryTime: 0,
        });
        continue;
      }

      // Scripts without async/defer are blocking
      if (resource.type === 'script' && resource.critical) {
        critical.push({
          url: resource.url,
          type: resource.type,
          priority: 'high',
          blocking: true,
          discoveryTime: 0,
        });
      }

      // Large images above the fold
      if (resource.type === 'image' && resource.critical) {
        critical.push({
          url: resource.url,
          type: resource.type,
          priority: 'high',
          blocking: false,
          discoveryTime: 0,
        });
      }
    }

    return critical.sort((a, b) => {
      if (a.blocking && !b.blocking) return -1;
      if (!a.blocking && b.blocking) return 1;
      return 0;
    });
  }

  /**
   * Generate all link tags as HTML strings.
   */
  generateLinkTags(): string[] {
    const allHints = [
      ...this.generatePreconnectHints(),
      ...this.generatePreloadHints(),
    ];

    return allHints.map((hint) => {
      const parts = [`<link rel="${hint.rel}" href="${hint.href}"`];
      if (hint.rel === 'preload' || hint.rel === 'prefetch') {
        parts.push(`as="${hint.as}"`);
      }
      if (hint.type) parts.push(`type="${hint.type}"`);
      if (hint.crossorigin) parts.push('crossorigin');
      if (hint.fetchPriority !== 'auto') {
        parts.push(`fetchpriority="${hint.fetchPriority}"`);
      }
      if (hint.media) parts.push(`media="${hint.media}"`);
      parts.push('>');
      return parts.join(' ');
    });
  }

  /**
   * Get loading statistics.
   */
  getStats(): PreloaderStats {
    const preloads = this.generatedHints.filter((h) => h.rel === 'preload');
    const prefetches = this.generatedHints.filter((h) => h.rel === 'prefetch');
    const preconnects = this.generatedHints.filter((h) => h.rel === 'preconnect');

    const estimatedTimeSaved = this.estimateTimeSaved();

    return {
      totalResources: this.resources.size,
      criticalResources: this.criticalResources.size,
      preloadGenerated: preloads.length,
      prefetchGenerated: prefetches.length,
      preconnectGenerated: preconnects.length,
      estimatedTimeSaved,
    };
  }

  /**
   * Reset all registered resources and hints.
   */
  reset(): void {
    this.resources.clear();
    this.criticalResources.clear();
    this.origins.clear();
    this.generatedHints.length = 0;
    this.discoveredOrigins.clear();
  }

  // ===========================================================================
  // Private methods
  // ===========================================================================

  /** Get topological order of resources based on dependencies */
  private getTopologicalOrder(): string[] {
    const visited = new Set<string>();
    const order: string[] = [];

    const visit = (url: string): void => {
      if (visited.has(url)) return;
      visited.add(url);

      const resource = this.resources.get(url);
      if (resource) {
        for (const dep of resource.dependsOn) {
          visit(dep);
        }
      }
      order.push(url);
    };

    for (const url of this.resources.keys()) {
      visit(url);
    }

    return order;
  }

  /** Determine fetch priority for a resource */
  private determinePriority(resource: ResourceDependency): FetchPriority {
    if (resource.type === 'style' || resource.type === 'font') return 'high';
    if (resource.type === 'script' && resource.critical) return 'high';
    if (resource.type === 'image' && resource.critical) return 'high';
    return 'auto';
  }

  /** Get MIME type for a resource */
  private getMimeType(type: ResourceType, url: string): string | undefined {
    if (type === 'font') {
      if (url.includes('.woff2')) return 'font/woff2';
      if (url.includes('.woff')) return 'font/woff';
      return 'font/woff2';
    }
    if (type === 'image') {
      if (url.includes('.webp')) return 'image/webp';
      if (url.includes('.avif')) return 'image/avif';
      return undefined;
    }
    return undefined;
  }

  /** Check if URL is cross-origin */
  private isCrossOrigin(url: string): boolean {
    try {
      return url.startsWith('http') && !url.includes('localhost');
    } catch {
      return false;
    }
  }

  /** Extract origin from URL */
  private extractOrigin(url: string): string | null {
    try {
      const match = url.match(/^(https?:\/\/[^/]+)/);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }

  /** Infer resource type from URL */
  private inferResourceType(url: string): ResourceType {
    if (url.match(/\.(js|mjs)(\?|$)/i)) return 'script';
    if (url.match(/\.(css)(\?|$)/i)) return 'style';
    if (url.match(/\.(jpg|jpeg|png|gif|webp|avif|svg)(\?|$)/i)) return 'image';
    if (url.match(/\.(woff|woff2|ttf|otf)(\?|$)/i)) return 'font';
    return 'fetch';
  }

  /** Estimate time saved by preloading */
  private estimateTimeSaved(): number {
    let saved = 0;
    for (const resource of this.criticalResources.values()) {
      // Preloading typically saves discovery time (50-200ms per resource)
      saved += resource.blocking ? 150 : 75;
    }
    // Preconnect saves ~100ms per origin (DNS + TCP + TLS)
    saved += (this.origins.size - 1) * 100;
    return saved;
  }
}
