/**
 * AI Thumbnail Service
 *
 * Generates thumbnail options from video metadata using simulated AI analysis.
 * Provides scoring and selection of optimal thumbnails.
 */
import { z } from 'zod';

export const GenerateThumbnailsSchema = z.object({
  videoId: z.string().min(1),
  videoUrl: z.string().url(),
  title: z.string().optional(),
  frameCount: z.number().int().min(1).optional(),
});

export type GenerateThumbnailsInput = z.infer<typeof GenerateThumbnailsSchema>;

export interface ThumbnailOption {
  id: string;
  url: string;
  score: number;
  description: string;
  timestamp: number;
}

export interface AIThumbnailConfig {
  aiProvider?: string;
}

export class AIThumbnailService {
  readonly provider: string | undefined;

  constructor(config: AIThumbnailConfig = {}) {
    this.provider = config.aiProvider;
  }

  async generateThumbnails(params: GenerateThumbnailsInput): Promise<ThumbnailOption[]> {
    const parsed = GenerateThumbnailsSchema.parse(params);
    const count = parsed.frameCount ?? 6;

    const thumbnails: ThumbnailOption[] = [];

    for (let i = 0; i < count; i++) {
      const score = this.computeScore(i, count);
      const timestamp = (i + 1) * 10;
      thumbnails.push({
        id: `thumb-${parsed.videoId}-${i}`,
        url: `${parsed.videoUrl}/thumbnails/frame-${i}.jpg`,
        score,
        description: this.generateDescription(i, parsed.title),
        timestamp,
      });
    }

    return thumbnails.sort((a, b) => b.score - a.score);
  }

  selectBestThumbnail(thumbnails: ThumbnailOption[]): ThumbnailOption {
    if (thumbnails.length === 0) {
      throw new Error('No thumbnails provided');
    }

    let best = thumbnails[0]!;
    for (const thumb of thumbnails) {
      if (thumb.score > best.score) {
        best = thumb;
      }
    }
    return best;
  }

  private computeScore(index: number, total: number): number {
    // Deterministic scoring: middle frames score higher (simulates AI preference)
    const middle = (total - 1) / 2;
    const distance = Math.abs(index - middle) / Math.max(middle, 1);
    const baseScore = 1 - distance * 0.5;
    // Add small variation based on index for uniqueness
    const variation = ((index * 7 + 3) % 10) / 100;
    return Math.min(1, Math.max(0, Number((baseScore + variation).toFixed(4))));
  }

  private generateDescription(index: number, title?: string): string {
    const descriptions = [
      'High-contrast action frame with subject centered',
      'Close-up facial expression showing emotion',
      'Wide establishing shot with vibrant colors',
      'Dynamic motion frame with strong composition',
      'Text overlay opportunity with clear background',
      'Eye-catching moment with high visual interest',
      'Dramatic lighting with strong focal point',
      'Engaging scene with multiple subjects',
    ];
    const desc = descriptions[index % descriptions.length]!;
    return title ? `${desc} - "${title}"` : desc;
  }
}
