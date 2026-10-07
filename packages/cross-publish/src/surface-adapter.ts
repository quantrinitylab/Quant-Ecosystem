import type { PublishIntent, Surface, AspectRatio } from './types.js';

export interface FormattedContent {
  title: string;
  description: string;
  aspectRatio: AspectRatio;
  surface: Surface;
  mediaUrl: string;
  thumbnailUrl: string;
  metadata: Record<string, unknown>;
}

export class SurfaceAdapter {
  formatForSurface(intent: PublishIntent, surface: Surface): FormattedContent {
    switch (surface) {
      case 'quantube':
        return this.formatForQuantube(intent);
      case 'quantsync':
        return this.formatForQuantsync(intent);
      case 'quantneon':
        return this.formatForQuantneon(intent);
      case 'quantmail':
        return this.formatForQuantmail(intent);
    }
  }

  private formatForQuantube(intent: PublishIntent): FormattedContent {
    return {
      title: intent.title.slice(0, 100),
      description: intent.description.slice(0, 5000),
      aspectRatio: 'horizontal_16_9',
      surface: 'quantube',
      mediaUrl: intent.mediaUrl,
      thumbnailUrl: intent.thumbnailUrl,
      metadata: { ...intent.metadata, platform: 'quantube' },
    };
  }

  private formatForQuantsync(intent: PublishIntent): FormattedContent {
    return {
      title: intent.title.slice(0, 50),
      description: intent.description.slice(0, 300),
      aspectRatio: 'vertical_9_16',
      surface: 'quantsync',
      mediaUrl: intent.mediaUrl,
      thumbnailUrl: intent.thumbnailUrl,
      metadata: { ...intent.metadata, platform: 'quantsync' },
    };
  }

  private formatForQuantneon(intent: PublishIntent): FormattedContent {
    const hashtags = this.extractHashtags(intent.description);
    return {
      title: intent.title.slice(0, 60),
      description: `${intent.description.slice(0, 200)} ${hashtags}`.trim(),
      aspectRatio: 'square_1_1',
      surface: 'quantneon',
      mediaUrl: intent.mediaUrl,
      thumbnailUrl: intent.thumbnailUrl,
      metadata: { ...intent.metadata, platform: 'quantneon', hashtags },
    };
  }

  private formatForQuantmail(intent: PublishIntent): FormattedContent {
    return {
      title: `Newsletter: ${intent.title}`.slice(0, 120),
      description: intent.description.slice(0, 10000),
      aspectRatio: 'horizontal_16_9',
      surface: 'quantmail',
      mediaUrl: intent.mediaUrl,
      thumbnailUrl: intent.thumbnailUrl,
      metadata: { ...intent.metadata, platform: 'quantmail', format: 'newsletter' },
    };
  }

  private extractHashtags(text: string): string {
    const words = text.split(/\s+/).filter((w) => w.startsWith('#'));
    if (words.length > 0) return words.slice(0, 5).join(' ');
    const keywords = text
      .split(/\s+/)
      .filter((w) => w.length > 4)
      .slice(0, 3);
    return keywords.map((w) => `#${w.toLowerCase()}`).join(' ');
  }
}
