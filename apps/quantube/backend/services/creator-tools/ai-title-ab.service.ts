/**
 * AI Title A/B Testing Service
 *
 * Generates alternative title options and manages A/B testing
 * to determine the most effective title for engagement.
 */
import { z } from 'zod';

export const GenerateTitlesSchema = z.object({
  videoId: z.string().min(1),
  description: z.string().min(1),
  keywords: z.array(z.string()).optional(),
  count: z.number().int().min(1).optional(),
});

export const StartABTestSchema = z.object({
  videoId: z.string().min(1),
  titles: z.array(z.string().min(1)).min(2),
});

export const RecordImpressionSchema = z.object({
  testId: z.string().min(1),
  titleIndex: z.number().int().min(0),
});

export const RecordClickSchema = z.object({
  testId: z.string().min(1),
  titleIndex: z.number().int().min(0),
});

export type GenerateTitlesInput = z.infer<typeof GenerateTitlesSchema>;
export type StartABTestInput = z.infer<typeof StartABTestSchema>;

export interface ABTestVariant {
  title: string;
  impressions: number;
  clicks: number;
  ctr: number;
}

export interface ABTest {
  id: string;
  videoId: string;
  variants: ABTestVariant[];
  createdAt: Date;
  status: 'running' | 'completed';
}

const MIN_IMPRESSIONS_FOR_WINNER = 10;

export class AITitleABService {
  private readonly tests = new Map<string, ABTest>();

  async generateTitles(params: GenerateTitlesInput): Promise<string[]> {
    const parsed = GenerateTitlesSchema.parse(params);
    const count = parsed.count ?? 10;

    const templates = [
      (d: string) => `${d} - You Won't Believe What Happens`,
      (d: string) => `The Ultimate Guide to ${d}`,
      (d: string) => `${d}: Everything You Need to Know`,
      (d: string) => `Why ${d} Changes Everything`,
      (d: string) => `${d} Explained in Under 10 Minutes`,
      (d: string) => `Top Secrets About ${d} Revealed`,
      (d: string) => `${d}: A Deep Dive`,
      (d: string) => `How ${d} Actually Works`,
      (d: string) => `${d} - The Complete Breakdown`,
      (d: string) => `What Nobody Tells You About ${d}`,
      (d: string) => `${d}: Tips & Tricks`,
      (d: string) => `Mastering ${d} Step by Step`,
    ];

    const titles: string[] = [];
    const keywords = parsed.keywords ?? [];
    const baseDesc = keywords.length > 0 ? keywords.join(' & ') : parsed.description;

    for (let i = 0; i < count; i++) {
      const template = templates[i % templates.length]!;
      titles.push(template(baseDesc));
    }

    return titles.slice(0, 10);
  }

  async startABTest(params: StartABTestInput): Promise<ABTest> {
    const parsed = StartABTestSchema.parse(params);

    const test: ABTest = {
      id: `ab-${parsed.videoId}-${Date.now()}`,
      videoId: parsed.videoId,
      variants: parsed.titles.map((title) => ({
        title,
        impressions: 0,
        clicks: 0,
        ctr: 0,
      })),
      createdAt: new Date(),
      status: 'running',
    };

    this.tests.set(test.id, test);
    return test;
  }

  async recordImpression(testId: string, titleIndex: number): Promise<void> {
    RecordImpressionSchema.parse({ testId, titleIndex });
    const test = this.getTest(testId);

    if (titleIndex >= test.variants.length) {
      throw new Error(`Title index ${titleIndex} out of range`);
    }

    const variant = test.variants[titleIndex]!;
    variant.impressions++;
    variant.ctr = variant.impressions > 0 ? variant.clicks / variant.impressions : 0;
  }

  async recordClick(testId: string, titleIndex: number): Promise<void> {
    RecordClickSchema.parse({ testId, titleIndex });
    const test = this.getTest(testId);

    if (titleIndex >= test.variants.length) {
      throw new Error(`Title index ${titleIndex} out of range`);
    }

    const variant = test.variants[titleIndex]!;
    variant.clicks++;
    variant.ctr = variant.impressions > 0 ? variant.clicks / variant.impressions : 0;
  }

  async getABTestResults(testId: string): Promise<ABTestVariant[]> {
    const test = this.getTest(testId);
    return test.variants.map((v) => ({ ...v }));
  }

  async pickWinner(testId: string): Promise<string> {
    const test = this.getTest(testId);

    const eligible = test.variants.filter((v) => v.impressions >= MIN_IMPRESSIONS_FOR_WINNER);

    if (eligible.length === 0) {
      throw new Error('No variants have enough impressions to determine a winner');
    }

    let winner = eligible[0]!;
    for (const variant of eligible) {
      if (variant.ctr > winner.ctr) {
        winner = variant;
      }
    }

    test.status = 'completed';
    return winner.title;
  }

  private getTest(testId: string): ABTest {
    const test = this.tests.get(testId);
    if (!test) {
      throw new Error(`A/B test not found: ${testId}`);
    }
    return test;
  }
}
