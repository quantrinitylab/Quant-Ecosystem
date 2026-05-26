import { z } from 'zod';
import type { AIEngine } from '@quant/ai';
import { createAppError } from '@quant/server-core';

export interface GrammarCorrection {
  original: string;
  corrected: string;
  explanation: string;
  position: { start: number; end: number };
}

export const GrammarCorrectionSchema = z.object({
  original: z.string(),
  corrected: z.string(),
  explanation: z.string(),
  position: z.object({
    start: z.number(),
    end: z.number(),
  }),
});

export const GrammarCheckResultSchema = z.object({
  corrections: z.array(GrammarCorrectionSchema),
  overallScore: z.number().min(0).max(100),
});

export type GrammarCheckResult = z.infer<typeof GrammarCheckResultSchema>;

export class AIGrammarService {
  constructor(private readonly ai: AIEngine) {}

  async checkGrammar(text: string, userId: string): Promise<GrammarCheckResult> {
    const response = await this.ai.infer({
      prompt: `Check the following text for grammar, spelling, and punctuation errors. Report each error with its position in the text.

Text:
${text}

Respond ONLY with valid JSON:
{
  "corrections": [
    {
      "original": "the incorrect text",
      "corrected": "the corrected text",
      "explanation": "why this is an error",
      "position": { "start": 0, "end": 10 }
    }
  ],
  "overallScore": 0 to 100 (100 means perfect grammar)
}`,
      systemPrompt:
        'You are a grammar checking assistant. Identify all grammar, spelling, and punctuation errors in the text. Always respond with valid JSON only.',
      userId,
      app: 'quantdocs',
      feature: 'ai-grammar',
      temperature: 0.3,
      maxTokens: 1024,
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(response.content);
    } catch {
      throw createAppError('Failed to parse AI grammar response', 500, 'AI_PARSE_ERROR');
    }

    const result = GrammarCheckResultSchema.safeParse(parsed);
    if (!result.success) {
      throw createAppError('AI returned invalid grammar result', 500, 'AI_VALIDATION_ERROR');
    }

    return result.data;
  }
}
