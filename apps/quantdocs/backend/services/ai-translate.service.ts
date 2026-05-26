import { z } from 'zod';
import type { AIEngine } from '@quant/ai';
import { createAppError } from '@quant/server-core';

export const TranslateResultSchema = z.object({
  translated: z.string(),
  sourceLanguage: z.string(),
  confidence: z.number().min(0).max(1),
});

export type TranslateResult = z.infer<typeof TranslateResultSchema>;

export class AITranslateService {
  constructor(private readonly ai: AIEngine) {}

  async translate(
    content: string,
    targetLanguage: string,
    preserveFormatting: boolean,
    userId: string,
  ): Promise<TranslateResult> {
    const formattingInstruction = preserveFormatting
      ? 'Preserve all formatting, HTML tags, and structure in the translated text.'
      : 'Translate the plain text content.';

    const response = await this.ai.infer({
      prompt: `Translate the following content to ${targetLanguage}. ${formattingInstruction}

Content:
${content}

Respond ONLY with valid JSON:
{
  "translated": "the translated content",
  "sourceLanguage": "detected source language",
  "confidence": 0.0 to 1.0
}`,
      systemPrompt:
        'You are a professional translation assistant. Translate content accurately while preserving meaning and tone. Always respond with valid JSON only.',
      userId,
      app: 'quantdocs',
      feature: 'ai-translate',
      temperature: 0.3,
      maxTokens: 2048,
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(response.content);
    } catch {
      throw createAppError('Failed to parse AI translate response', 500, 'AI_PARSE_ERROR');
    }

    const result = TranslateResultSchema.safeParse(parsed);
    if (!result.success) {
      throw createAppError('AI returned invalid translate result', 500, 'AI_VALIDATION_ERROR');
    }

    return result.data;
  }
}
