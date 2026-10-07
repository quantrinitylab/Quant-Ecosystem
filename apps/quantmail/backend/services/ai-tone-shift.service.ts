import { z } from 'zod';
import type { AIEngine } from '@quant/ai';
import { createAppError } from '@quant/server-core';

export const ToneSchema = z.enum(['formal', 'casual', 'diplomatic', 'urgent', 'friendly']);

export const ToneShiftResultSchema = z.object({
  rewrittenText: z.string(),
  originalTone: z.string(),
  targetTone: z.string(),
  confidence: z.number().min(0).max(1),
});

export const ToneDetectionResultSchema = z.object({
  tone: z.string(),
  confidence: z.number().min(0).max(1),
  indicators: z.array(z.string()),
});

export type Tone = z.infer<typeof ToneSchema>;
export type ToneShiftResult = z.infer<typeof ToneShiftResultSchema>;
export type ToneDetectionResult = z.infer<typeof ToneDetectionResultSchema>;

export class AIToneShiftService {
  constructor(private readonly ai: AIEngine) {}

  async shiftTone(emailText: string, targetTone: Tone, userId: string): Promise<ToneShiftResult> {
    const validatedTone = ToneSchema.parse(targetTone);

    const response = await this.ai.infer({
      prompt: `Rewrite this email text in a ${validatedTone} tone while preserving the original meaning.

Original text:
${emailText}

Respond ONLY with valid JSON:
{
  "rewrittenText": "the rewritten email",
  "originalTone": "detected original tone",
  "targetTone": "${validatedTone}",
  "confidence": 0.0 to 1.0
}`,
      systemPrompt:
        'You are an email tone expert that rewrites emails to match a target tone. Always respond with valid JSON only.',
      userId,
      app: 'quantmail',
      feature: 'email-tone-shift',
      temperature: 0.6,
      maxTokens: 1024,
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(response.content);
    } catch {
      throw createAppError('Failed to parse AI tone shift response', 500, 'AI_PARSE_ERROR');
    }

    const result = ToneShiftResultSchema.safeParse(parsed);
    if (!result.success) {
      throw createAppError('AI returned invalid tone shift result', 500, 'AI_VALIDATION_ERROR');
    }

    return result.data;
  }

  async detectCurrentTone(emailText: string, userId: string): Promise<ToneDetectionResult> {
    const response = await this.ai.infer({
      prompt: `Analyze the tone of this email text.

Text:
${emailText}

Respond ONLY with valid JSON:
{
  "tone": "the detected tone (formal/casual/diplomatic/urgent/friendly)",
  "confidence": 0.0 to 1.0,
  "indicators": ["indicator 1", "indicator 2"]
}`,
      systemPrompt: 'You are an email tone analysis expert. Always respond with valid JSON only.',
      userId,
      app: 'quantmail',
      feature: 'email-tone-shift',
      temperature: 0.2,
      maxTokens: 256,
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(response.content);
    } catch {
      throw createAppError('Failed to parse AI tone detection response', 500, 'AI_PARSE_ERROR');
    }

    const result = ToneDetectionResultSchema.safeParse(parsed);
    if (!result.success) {
      throw createAppError('AI returned invalid tone detection result', 500, 'AI_VALIDATION_ERROR');
    }

    return result.data;
  }
}
