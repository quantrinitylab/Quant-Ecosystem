import type { AIEngine } from '@quant/ai';
import { z } from 'zod';

export const AdCopyInputSchema = z.object({
  product: z.string(),
  audience: z.string().optional(),
  tone: z.enum(['bold', 'professional', 'playful', 'urgent']).optional(),
  variations: z.number().int().min(1).max(10).optional().default(3),
});

export const HeadlineInputSchema = z.object({
  product: z.string(),
  count: z.number().int().min(1).max(20).optional().default(5),
});

export type AdCopyInput = z.infer<typeof AdCopyInputSchema>;
export type HeadlineInput = z.infer<typeof HeadlineInputSchema>;

export class AIAdCopyService {
  constructor(private readonly ai: AIEngine) {}

  async generateAdCopy(
    input: AdCopyInput,
    userId: string,
  ): Promise<{ variations: string[] }> {
    const validated = AdCopyInputSchema.parse(input);

    const audienceLine = validated.audience
      ? ` targeting ${validated.audience}`
      : '';
    const toneLine = validated.tone
      ? ` in a ${validated.tone} tone`
      : '';

    const response = await this.ai.infer({
      prompt: `Write ${validated.variations} ad copy variations for the following product: "${validated.product}"${audienceLine}${toneLine}. Each variation should be separated by a blank line. Do not number the variations.`,
      systemPrompt:
        'You are an expert advertising copywriter. Write compelling, conversion-focused ad copy.',
      userId,
      app: 'quantads',
      feature: 'ad-copy',
      temperature: 0.8,
    });

    const variations = response.content
      .split(/\n{2,}/)
      .map((section) => section.replace(/^[\d]+[.)\s]+|^[-*•]\s*/, '').trim())
      .filter((section) => section.length > 0)
      .slice(0, validated.variations);

    return { variations };
  }

  async generateHeadlines(
    input: HeadlineInput,
    userId: string,
  ): Promise<{ headlines: string[] }> {
    const validated = HeadlineInputSchema.parse(input);

    const response = await this.ai.infer({
      prompt: `Generate ${validated.count} catchy ad headlines for the following product: "${validated.product}". Each headline should be on its own line without numbering or bullet points.`,
      systemPrompt:
        'You are an expert advertising copywriter. Write catchy, memorable headlines.',
      userId,
      app: 'quantads',
      feature: 'headlines',
      temperature: 0.8,
    });

    const headlines = response.content
      .split('\n')
      .map((line) => line.replace(/^[\d]+[.)\s]+|^[-*•]\s*/, '').trim())
      .filter((line) => line.length > 0)
      .slice(0, validated.count);

    return { headlines };
  }
}
