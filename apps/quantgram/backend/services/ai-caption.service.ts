import type { AIEngine } from '@quant/ai';
import { z } from 'zod';

export const CaptionInputSchema = z.object({
  description: z.string(),
  mood: z.enum(['aesthetic', 'funny', 'minimal', 'poetic']).optional().default('aesthetic'),
  count: z.number().int().min(1).max(10).optional().default(3),
});

export const FilterSuggestInputSchema = z.object({
  description: z.string(),
});

export const CaptionGenerateInputSchema = z.object({
  mediaUrl: z.string().optional(),
  description: z.string().optional(),
  mood: z.enum(['aesthetic', 'funny', 'minimal', 'poetic']).optional().default('aesthetic'),
  count: z.number().int().min(1).max(10).optional().default(3),
});

export const HashtagSuggestInputSchema = z.object({
  caption: z.string(),
  count: z.number().int().min(1).max(30).optional().default(8),
});

export type CaptionInput = z.infer<typeof CaptionInputSchema>;
export type FilterSuggestInput = z.infer<typeof FilterSuggestInputSchema>;
export type CaptionGenerateInput = z.infer<typeof CaptionGenerateInputSchema>;
export type HashtagSuggestInput = z.infer<typeof HashtagSuggestInputSchema>;

export class AICaptionService {
  constructor(private readonly ai: AIEngine) {}

  async generateCaptions(input: CaptionInput, userId: string): Promise<{ captions: string[] }> {
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

  /**
   * Generate captions from the richer create-flow payload
   * ({ mediaUrl?, description?, mood?, count? }).
   */
  async generateCaptionsForMedia(
    input: CaptionGenerateInput,
    userId: string,
  ): Promise<{ captions: string[] }> {
    const validated = CaptionGenerateInputSchema.parse(input);
    const description =
      validated.description ||
      (validated.mediaUrl ? `the image at ${validated.mediaUrl}` : 'this moment');
    return this.generateCaptions(
      { description, mood: validated.mood, count: validated.count },
      userId,
    );
  }

  async suggestHashtags(
    input: HashtagSuggestInput,
    userId: string,
  ): Promise<{ hashtags: string[] }> {
    const validated = HashtagSuggestInputSchema.parse(input);

    const response = await this.ai.infer({
      prompt: `Suggest ${validated.count} relevant Instagram hashtags for this caption: "${validated.caption}". Return each hashtag on its own line, starting with #, without numbering or extra commentary.`,
      systemPrompt:
        'You are a social media growth expert. Suggest concise, relevant, popular hashtags.',
      userId,
      app: 'quantneon',
      feature: 'hashtag-suggest',
      temperature: 0.7,
    });

    const hashtags = response.content
      .split(/[\n,\s]+/)
      .map((token) => token.replace(/^[\d]+[.)\s]+|^[-*•]\s*/, '').trim())
      .filter((token) => token.length > 0)
      .map((token) => (token.startsWith('#') ? token : `#${token}`))
      .filter((token) => token.length > 1)
      .slice(0, validated.count);

    return { hashtags };
  }

  async suggestFilters(input: FilterSuggestInput, userId: string): Promise<{ filters: string[] }> {
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
