import type { AIEngine } from '@quant/ai';
import { z } from 'zod';

export const PostDraftInputSchema = z.object({
  topic: z.string(),
  tone: z.enum(['casual', 'professional', 'witty', 'inspirational']).optional(),
  maxLength: z.number().int().positive().optional(),
});

export const HashtagInputSchema = z.object({
  content: z.string(),
  count: z.number().int().min(1).max(20).optional().default(5),
});

export type PostDraftInput = z.infer<typeof PostDraftInputSchema>;
export type HashtagInput = z.infer<typeof HashtagInputSchema>;

export class AIContentService {
  constructor(private readonly ai: AIEngine) {}

  async draftPost(
    input: unknown,
    userId: string,
  ): Promise<{ content: string }> {
    const validated = PostDraftInputSchema.parse(input);

    const tone = validated.tone ?? 'casual';
    const lengthHint = validated.maxLength
      ? ` Keep the post under approximately ${validated.maxLength} characters.`
      : '';

    const response = await this.ai.infer({
      prompt: `Write a social media post about the following topic:\n\n"${validated.topic}"\n\nTone: ${tone}.${lengthHint}\n\nReturn only the post content, no additional commentary.`,
      systemPrompt:
        'You are a creative social media content assistant. You write engaging, original posts in the requested tone.',
      userId,
      app: 'quantsync',
      feature: 'post-draft',
      temperature: 0.8,
    });

    return { content: response.content };
  }

  async suggestHashtags(
    input: unknown,
    userId: string,
  ): Promise<{ hashtags: string[] }> {
    const validated = HashtagInputSchema.parse(input);

    const response = await this.ai.infer({
      prompt: `Generate ${validated.count} relevant hashtags for the following content. Each hashtag must start with # and be on its own line without numbering or bullet points.\n\nContent: "${validated.content}"`,
      systemPrompt:
        'You are a hashtag generator. Return only hashtags, one per line, each starting with #. Do not include any numbering, bullet points, or additional text.',
      userId,
      app: 'quantsync',
      feature: 'hashtags',
      temperature: 0.7,
    });

    const hashtags = response.content
      .split('\n')
      .map((line) => {
        let cleaned = line
          .replace(/^[\d]+[.)\s]+|^[-*•]\s*/, '')
          .trim();
        if (cleaned && !cleaned.startsWith('#')) {
          cleaned = '#' + cleaned;
        }
        return cleaned;
      })
      .filter((line) => line.length > 0)
      .slice(0, validated.count);

    return { hashtags };
  }
}
