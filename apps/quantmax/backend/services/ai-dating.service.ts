import type { AIEngine } from '@quant/ai';
import { z } from 'zod';

export const BioInputSchema = z.object({
  interests: z.array(z.string()),
  personality: z.string().optional(),
  vibe: z.enum(['fun', 'sincere', 'adventurous', 'chill']).optional(),
});

export const IcebreakerInputSchema = z.object({
  matchBio: z.string(),
  sharedInterests: z.array(z.string()).optional(),
  count: z.number().int().min(1).max(10).optional().default(3),
});

export type BioInput = z.infer<typeof BioInputSchema>;
export type IcebreakerInput = z.infer<typeof IcebreakerInputSchema>;

export class AIDatingService {
  constructor(private readonly ai: AIEngine) {}

  async writeBio(input: BioInput, userId: string): Promise<{ bio: string }> {
    const validated = BioInputSchema.parse(input);

    const interestsText = validated.interests.join(', ');
    const personalityHint = validated.personality
      ? `\nPersonality: ${validated.personality}`
      : '';
    const vibeHint = validated.vibe ? `\nVibe: ${validated.vibe}` : '';

    const response = await this.ai.infer({
      prompt: `Write an attractive dating profile bio for someone with the following traits:\n\nInterests: ${interestsText}${personalityHint}${vibeHint}\n\nWrite a single, compelling dating bio paragraph (no more than 3-4 sentences). Do not include quotes around the bio.`,
      systemPrompt:
        'You are an expert dating profile writer. You write authentic, charming, and concise bios that help people make genuine connections.',
      userId,
      app: 'quantmax',
      feature: 'bio-writer',
      temperature: 0.8,
    });

    return { bio: response.content.trim() };
  }

  async generateIcebreakers(
    input: IcebreakerInput,
    userId: string,
  ): Promise<{ icebreakers: string[] }> {
    const validated = IcebreakerInputSchema.parse(input);

    const sharedText = validated.sharedInterests?.length
      ? `\nShared interests: ${validated.sharedInterests.join(', ')}`
      : '';

    const response = await this.ai.infer({
      prompt: `Given a match's dating profile bio:\n\n"${validated.matchBio}"${sharedText}\n\nGenerate ${validated.count} personalized opening messages. Each message should be on its own line without numbering or bullet points.`,
      systemPrompt:
        'You are a helpful dating assistant that writes natural, engaging opening messages.',
      userId,
      app: 'quantmax',
      feature: 'icebreakers',
      temperature: 0.8,
    });

    const icebreakers = response.content
      .split('\n')
      .map((line) =>
        line.replace(/^[\d]+[.)\s]+|^[-*•]\s*/, '').trim(),
      )
      .filter((line) => line.length > 0)
      .slice(0, validated.count);

    return { icebreakers };
  }
}
