import { UserStyleMemory } from '@quant/ai';
import type { AIEngine, UserStyleProfile } from '@quant/ai';
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

/** Anything that can produce the user's cross-app style profile. */
export interface StyleSource {
  get(userId: string): Promise<UserStyleProfile | null>;
}

export class AISmartRepliesService {
  /** Optional cross-app style memory (learned in QuantMail, used here). */
  private readonly style: StyleSource | undefined;

  constructor(
    private readonly ai: AIEngine,
    style?: StyleSource,
  ) {
    this.style = style;
  }

  async generateReplies(input: SmartReplyInput, userId: string): Promise<SmartReplyResult> {
    const validated = SmartReplyInputSchema.parse(input);

    const conversationText = validated.recentMessages
      .map((m) => `${m.sender}: ${m.content}`)
      .join('\n');

    // Cross-app personalization: the style QuantMail learned, applied here.
    // Best-effort — a memory failure must never break smart replies.
    let styleHints = '';
    if (this.style) {
      try {
        styleHints = UserStyleMemory.toPromptHints(await this.style.get(userId));
      } catch {
        /* best-effort by design */
      }
    }

    const response = await this.ai.infer({
      prompt: `Here is a recent conversation:\n\n${conversationText}\n\nSuggest ${validated.count} short, contextual reply options that the user could send next. Each suggestion should be on its own line without numbering or bullet points.`,
      systemPrompt:
        'You are a helpful chat assistant that writes short, natural reply suggestions.' +
        (styleHints ? ` ${styleHints}` : ''),
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
