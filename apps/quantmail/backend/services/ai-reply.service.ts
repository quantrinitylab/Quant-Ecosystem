import { z } from 'zod';
import { UserStyleMemory } from '@quant/ai';
import type { AIEngine, UserStyleProfile } from '@quant/ai';
import { createAppError } from '@quant/server-core';

export const ReplyInputSchema = z.object({
  subject: z.string(),
  body: z.string(),
  from: z.string(),
  to: z.string().optional(),
});

export const ReplyOptionsSchema = z.object({
  tone: z.enum(['professional', 'casual', 'friendly', 'brief']).optional(),
  maxLength: z.number().optional(),
  includeGreeting: z.boolean().optional(),
});

export const ReplyResultSchema = z.object({
  subject: z.string(),
  body: z.string(),
  confidence: z.number().min(0).max(1),
});

export type ReplyInput = z.infer<typeof ReplyInputSchema>;
export type ReplyOptions = z.infer<typeof ReplyOptionsSchema>;
export type ReplyResult = z.infer<typeof ReplyResultSchema>;

/** Anything that can produce the user's cross-app style profile. */
export interface StyleSource {
  get(userId: string): Promise<UserStyleProfile | null>;
}

export class AIReplyService {
  /** Optional style memory - the home-app loop: mail learns, mail replies use it. */
  private readonly style: StyleSource | undefined;

  constructor(
    private readonly ai: AIEngine,
    style?: StyleSource,
  ) {
    this.style = style;
  }

  async draftReply(
    originalEmail: ReplyInput,
    userId: string,
    options?: ReplyOptions,
  ): Promise<ReplyResult> {
    const validated = ReplyInputSchema.parse(originalEmail);
    const opts = options ? ReplyOptionsSchema.parse(options) : {};

    let toneInstruction = opts.tone ? `Use a ${opts.tone} tone.` : 'Use a professional tone.';
    const lengthInstruction = opts.maxLength ? `Keep the reply under ${opts.maxLength} words.` : '';

    // The system prompt promises "matching the user writing style" - now it
    // actually can. Explicit tone wins; remembered style replaces only the
    // generic professional default. Best-effort.
    if (!opts.tone && this.style) {
      try {
        const hints = UserStyleMemory.toPromptHints(await this.style.get(userId));
        if (hints) toneInstruction = hints;
      } catch {
        /* best-effort by design */
      }
    }

    const response = await this.ai.infer({
      prompt: `Draft a reply to this email. ${toneInstruction} ${lengthInstruction}

Original Email:
From: ${validated.from}
Subject: ${validated.subject}
Body: ${validated.body}

Respond ONLY with valid JSON:
{
  "subject": "Re: original subject",
  "body": "the reply body text",
  "confidence": 0.0 to 1.0
}`,
      systemPrompt:
        'You are an email writing assistant that drafts replies matching the user writing style. Always respond with valid JSON only.',
      userId,
      app: 'quantmail',
      feature: 'email-reply',
      temperature: 0.6,
      maxTokens: 1024,
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(response.content);
    } catch {
      throw createAppError('Failed to parse AI reply response', 500, 'AI_PARSE_ERROR');
    }

    const result = ReplyResultSchema.safeParse(parsed);
    if (!result.success) {
      throw createAppError('AI returned invalid reply result', 500, 'AI_VALIDATION_ERROR');
    }

    return result.data;
  }
}
