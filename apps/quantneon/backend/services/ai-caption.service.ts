import type { AIEngine } from '@quant/ai';
import { z } from 'zod';

export const CaptionInputSchema = z.object({
  description: z.string(),
  mood: z
    .enum(['aesthetic', 'funny', 'minimal', 'poetic'])
    .optional()
    .default('aesthetic'),
  count: z.number().int().min(1).max(10).optional().default(3),
});

export const FilterSuggestInputSchema = z.object({
  description: z.string(),
});

export type CaptionInput = z.infer<typeof CaptionInputSchema>;
export type FilterSuggestInput = z.infer<typeof FilterSuggestInputSchema>;

export class AICaptionService {
  constructor(private readonly ai: AIEngine) {}

  async generateCaptions(
    input: CaptionInput,
    userId: string,
  ): Promise<{ captions: string[] }> {
    const validated = CaptionInputSchema.parse(input);

    const response = await this.ai.infer({
      prompt: `Write ${validated.count} Instagram-style captions for a photo matching this description: "${validated.description}". The mood should be ${validated.mood}. Each caption should be on its own line without numbering or bullet points.`,
      systemPrompt:
        'You are a creative social media caption writer. Write engaging, authentic captions that match the described mood.',
      userId,
      app: 'quantneon',
      feature: 'photo-caption',
      temperature: 0.85,
    });

    const captions = response.content
      .split('\n')
      .map((line) => line.replace(/^[\d]+[.)\s]+|^[-*•]\s*/, '').trim())
      .filter((line) => line.length > 0)
      .slice(0, validated.count);

    return { captions };
  }

  async suggestFilters(
    input: FilterSuggestInput,
    userId: string,
  ): Promise<{ filters: string[] }> {
    const validated = FilterSuggestInputSchema.parse(input);

    const response = await this.ai.infer({
      prompt: `Suggest 3 photo filter or aesthetic styles that would suit a photo matching this description: "${validated.description}". Each filter name should be a short, evocative style name on its own line without numbering or bullet points.`,
      systemPrompt:
        'You are a photography and aesthetic expert. Suggest filter styles as short evocative names.',
      userId,
      app: 'quantneon',
      feature: 'filter-suggest',
      temperature: 0.85,
    });

    const filters = response.content
      .split('\n')
      .map((line) => line.replace(/^[\d]+[.)\s]+|^[-*•]\s*/, '').trim())
      .filter((line) => line.length > 0)
      .slice(0, 3);

    return { filters };
  }
}
