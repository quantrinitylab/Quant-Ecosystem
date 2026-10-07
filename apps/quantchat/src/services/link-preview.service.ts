// ============================================================================
// QuantChat - Link Preview Service
// URL extraction, metadata parsing, and preview caching
// ============================================================================

export type LinkType = 'article' | 'video' | 'image' | 'website';

export interface LinkPreview {
  url: string;
  title: string;
  description: string;
  imageUrl?: string;
  siteName: string;
  favicon?: string;
  type: LinkType;
}

export class LinkPreviewService {
  private cache: Map<string, LinkPreview> = new Map();

  private static readonly URL_REGEX =
    /https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_+.~#?&/=]*)/g;

  extractUrls(text: string): string[] {
    const matches = text.match(LinkPreviewService.URL_REGEX);
    if (!matches) {
      return [];
    }
    // Deduplicate
    return [...new Set(matches)];
  }

  generatePreview(url: string): LinkPreview {
    // Check cache first
    const cached = this.cache.get(url);
    if (cached) {
      return cached;
    }

    // Generate preview from URL structure
    const urlObj = this.parseUrl(url);
    if (!urlObj) {
      const fallback: LinkPreview = {
        url,
        title: url,
        description: '',
        siteName: 'Unknown',
        type: 'website',
      };
      this.cache.set(url, fallback);
      return fallback;
    }

    const type = this.detectLinkType(url);
    const siteName = this.extractSiteName(urlObj.hostname);

    const preview: LinkPreview = {
      url,
      title: this.generateTitle(urlObj.pathname, siteName),
      description: `Content from ${siteName}`,
      siteName,
      favicon: `${urlObj.protocol}//${urlObj.hostname}/favicon.ico`,
      type,
    };

    this.cache.set(url, preview);
    return preview;
  }

  getCachedPreview(url: string): LinkPreview | null {
    return this.cache.get(url) ?? null;
  }

  setCachedPreview(url: string, preview: LinkPreview): void {
    this.cache.set(url, preview);
  }

  isValidUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  clearCache(): void {
    this.cache.clear();
  }

  private parseUrl(url: string): URL | null {
    try {
      return new URL(url);
    } catch {
      return null;
    }
  }

  private detectLinkType(url: string): LinkType {
    const lowerUrl = url.toLowerCase();

    if (/youtube\.com|vimeo\.com|youtu\.be|\.mp4|\.webm/.test(lowerUrl)) {
      return 'video';
    }

    if (/\.png|\.jpg|\.jpeg|\.gif|\.webp|\.svg|imgur\.com/.test(lowerUrl)) {
      return 'image';
    }

    if (/medium\.com|blog|article|news|post/.test(lowerUrl)) {
      return 'article';
    }

    return 'website';
  }

  private extractSiteName(hostname: string): string {
    // Remove www. prefix and TLD
    const parts = hostname.replace(/^www\./, '').split('.');
    const name = parts[0];
    if (!name) {
      return hostname;
    }
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  private generateTitle(pathname: string, siteName: string): string {
    if (pathname === '/' || pathname === '') {
      return siteName;
    }

    // Convert path to readable title
    const segments = pathname.split('/').filter(Boolean);
    const lastSegment = segments[segments.length - 1];
    if (!lastSegment) {
      return siteName;
    }

    return lastSegment
      .replace(/[-_]/g, ' ')
      .replace(/\.[^.]+$/, '') // Remove file extension
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
}
