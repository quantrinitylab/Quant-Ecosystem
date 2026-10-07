import type { Surface, ContentType } from './types.js';

export interface ContentInfo {
  title: string;
  description: string;
  contentType: ContentType;
  tags?: string[];
}

export class AITitleDescriptionService {
  generateTitle(content: ContentInfo, surface: Surface): string {
    switch (surface) {
      case 'quantube':
        return this.generateQuantubeTitle(content);
      case 'quantsync':
        return this.generateQuantsyncTitle(content);
      case 'quantneon':
        return this.generateQuantneonTitle(content);
      case 'quantmail':
        return this.generateQuantmailTitle(content);
    }
  }

  generateDescription(content: ContentInfo, surface: Surface): string {
    switch (surface) {
      case 'quantube':
        return this.generateQuantubeDescription(content);
      case 'quantsync':
        return this.generateQuantsyncDescription(content);
      case 'quantneon':
        return this.generateQuantneonDescription(content);
      case 'quantmail':
        return this.generateQuantmailDescription(content);
    }
  }

  generateBatch(
    content: ContentInfo,
    surfaces: Surface[],
  ): Map<Surface, { title: string; description: string }> {
    const results = new Map<Surface, { title: string; description: string }>();
    for (const surface of surfaces) {
      results.set(surface, {
        title: this.generateTitle(content, surface),
        description: this.generateDescription(content, surface),
      });
    }
    return results;
  }

  private generateQuantubeTitle(content: ContentInfo): string {
    // SEO-optimized longer title for Quantube
    const tags = content.tags?.slice(0, 3).join(' | ') ?? '';
    const seoTitle = tags
      ? `${content.title} | ${tags}`
      : `${content.title} - Full ${content.contentType.charAt(0).toUpperCase() + content.contentType.slice(1)}`;
    return seoTitle.slice(0, 100);
  }

  private generateQuantsyncTitle(content: ContentInfo): string {
    // Short catchy title for Quantsync
    return content.title.slice(0, 50);
  }

  private generateQuantneonTitle(content: ContentInfo): string {
    // Hashtag-focused for Quantneon
    const hashtags =
      content.tags
        ?.slice(0, 2)
        .map((t) => `#${t}`)
        .join(' ') ?? '';
    return `${content.title.slice(0, 40)} ${hashtags}`.trim().slice(0, 60);
  }

  private generateQuantmailTitle(content: ContentInfo): string {
    // Newsletter-style for Quantmail
    return `[New] ${content.title}`.slice(0, 120);
  }

  private generateQuantubeDescription(content: ContentInfo): string {
    const tags = content.tags?.map((t) => `#${t}`).join(' ') ?? '';
    return `${content.description}\n\n${tags}`.trim().slice(0, 5000);
  }

  private generateQuantsyncDescription(content: ContentInfo): string {
    return content.description.slice(0, 300);
  }

  private generateQuantneonDescription(content: ContentInfo): string {
    const hashtags = content.tags?.map((t) => `#${t}`).join(' ') ?? '';
    return `${content.description.slice(0, 150)}\n\n${hashtags}`.trim().slice(0, 2200);
  }

  private generateQuantmailDescription(content: ContentInfo): string {
    return `Dear subscriber,\n\n${content.description}\n\nBest regards`.slice(0, 10000);
  }
}
