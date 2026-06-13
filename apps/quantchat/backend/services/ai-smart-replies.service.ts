import type { AIEngine } from '@quant/ai';
import { z } from 'zod';

export const SmartReplyInputSchema = z.object({
  conversationId: z.string(),
  recentMessages: z.array(
    z.object({
      sender: z.string(),
      content: z.string(),
    }),
  ),
  count: z.number().int().min(1).max(10).optional().default(3),
});

export const SmartReplyResultSchema = z.object({
  suggestions: z.array(z.string()),
});

export type SmartReplyInput = z.infer<typeof SmartReplyInputSchema>;
export type SmartReplyResult = z.infer<typeof SmartReplyResultSchema>;

export class AISmartRepliesService {
  constructor(private readonly ai: AIEngine) {}

  async generateReplies(input: SmartReplyInput, userId: string): Promise<SmartReplyResult> {
    const validated = SmartReplyInputSchema.parse(input);

    const conversationText = validated.recentMessages
      .map((m) => `${m.sender}: ${m.content}`)
      .join('\n');

    const response = await this.ai.infer({
      prompt: `Here is a recent conversation:\n\n${conversationText}\n\nSuggest ${validated.count} short, contextual reply options that the user could send next. Each suggestion should be on its own line without numbering or bullet points.`,
      systemPrompt:
        'You are a helpful chat assistant that writes short, natural reply suggestions.',
      userId,
      app: 'quantchat',
      feature: 'smart-replies',
      temperature: 0.7,
    });

    const suggestions = response.content
      .split('\n')
      .map((line) => line.replace(/^[\d]+[.)\s]+|^[-*•]\s*/, '').trim())
      .filter((line) => line.length > 0)
      .slice(0, validated.count);

    return { suggestions };
  }
}
