import { z } from 'zod';
import type { AIEngine } from '@quant/ai';
import { createAppError } from '@quant/server-core';

export const CIFixInputSchema = z.object({
  logs: z.string().max(100000),
  sourceCode: z.string().max(100000).optional(),
  jobName: z.string().optional(),
});

export type CIFixInput = z.infer<typeof CIFixInputSchema>;

export interface CIFixResult {
  diagnosis: string;
  rootCause: string;
  suggestedFix: string;
  confidence: number;
}

const CIFixResultSchema = z.object({
  diagnosis: z.string(),
  rootCause: z.string(),
  suggestedFix: z.string(),
  confidence: z.number().min(0).max(1),
});

export class AICIFixService {
  constructor(private readonly ai: AIEngine) {}

  async suggestFix(input: CIFixInput, userId: string): Promise<CIFixResult> {
    const validated = CIFixInputSchema.parse(input);

    const response = await this.ai.infer({
      prompt: `Analyze the following CI failure logs and suggest a fix.

${validated.jobName ? `Job Name: ${validated.jobName}` : ''}

CI Logs:
${validated.logs}

${validated.sourceCode ? `Relevant Source Code:\n${validated.sourceCode}` : ''}

Respond ONLY with valid JSON matching this schema:
{
  "diagnosis": "what went wrong",
  "rootCause": "the root cause of the failure",
  "suggestedFix": "code or config fix to resolve the issue",
  "confidence": 0.0 to 1.0
}`,
      systemPrompt:
        'You are a CI/CD debugging expert. Analyze build failures, test failures, and deployment errors. Provide precise diagnoses and actionable fixes. Always respond with valid JSON only.',
      userId,
      app: 'quantmail',
      feature: 'ci-fix',
      temperature: 0.2,
      maxTokens: 1024,
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(response.content);
    } catch {
      throw createAppError('Failed to parse AI CI fix response', 500, 'AI_PARSE_ERROR');
    }

    const result = CIFixResultSchema.safeParse(parsed);
    if (!result.success) {
      throw createAppError('AI returned invalid CI fix result', 500, 'AI_VALIDATION_ERROR');
    }

    return result.data;
  }
}
