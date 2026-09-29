import type { AIEngine } from '@quant/ai';
import { z } from 'zod';

export const TitleInputSchema = z.object({
  description: z.string(),
  platform: z.enum(['youtube', 'tiktok', 'instagram', 'general']).optional(),
  count: z.number().int().min(1).max(10).optional().default(5),
});

export const CaptionInputSchema = z.object({
  transcript: z.string(),
  style: z.enum(['concise', 'detailed', 'funny']).optional(),
});

export class AIVideoService {
  constructor(private readonly ai: AIEngine) {}

  async suggestTitles(input: unknown, userId: string) {
    const validated = TitleInputSchema.parse(input);

    const platformText = validated.platform
      ? ` optimized for ${validated.platform}`
      : '';

    const response = await this.ai.infer({
      prompt: `Generate ${validated.count} catchy video titles for the following video description${platformText}. Each title should be on its own line without numbering or bullet points:\n\n${validated.description}`,
      systemPrompt:
        'You are a creative copywriter specializing in catchy video titles.',
      userId,
      app: 'quantedits',
      feature: 'title-suggest',
      temperature: 0.8,
    });

    const titles = response.content
      .split('\n')
      .map((line) => line.replace(/^[\d]+[.)\s]+|^[-*•]\s*/, '').trim())
      .filter((line) => line.length > 0);

    return { titles };
  }

  async generateCaptions(input: unknown, userId: string) {
    const validated = CaptionInputSchema.parse(input);

    const stylePrompt =
      validated.style === 'funny'
        ? 'in a funny and entertaining style'
        : validated.style === 'detailed'
          ? 'in a detailed and thorough style'
          : 'in a concise and clear style';

    const response = await this.ai.infer({
      prompt: `Write captions/description for a video from the following transcript ${stylePrompt}:\n\n${validated.transcript}`,
      systemPrompt:
        'You are a social media caption writer who creates engaging video descriptions.',
      userId,
      app: 'quantedits',
      feature: 'captions',
      temperature: 0.7,
    });

    return { caption: response.content };
  }
}
