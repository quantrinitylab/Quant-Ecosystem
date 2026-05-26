import { z } from 'zod';
import type { AIEngine } from '@quant/ai';
import { createAppError } from '@quant/server-core';

export const CodeReviewInputSchema = z.object({
  diff: z.string().max(100000),
  prTitle: z.string().optional(),
  prDescription: z.string().optional(),
  language: z.string().optional(),
});

export type CodeReviewInput = z.infer<typeof CodeReviewInputSchema>;

export interface ReviewFinding {
  filePath: string;
  line: number;
  severity: 'critical' | 'warning' | 'suggestion' | 'praise';
  message: string;
  suggestedFix?: string;
}

export interface CodeReviewResult {
  findings: ReviewFinding[];
  summary: string;
  score: number;
}

const ReviewResultSchema = z.object({
  findings: z.array(
    z.object({
      filePath: z.string(),
      line: z.number(),
      severity: z.enum(['critical', 'warning', 'suggestion', 'praise']),
      message: z.string(),
      suggestedFix: z.string().optional(),
    }),
  ),
  summary: z.string(),
  score: z.number().min(0).max(100),
});

export class AICodeReviewService {
  constructor(private readonly ai: AIEngine) {}

  async reviewDiff(input: CodeReviewInput, userId: string): Promise<CodeReviewResult> {
    const validated = CodeReviewInputSchema.parse(input);

    const response = await this.ai.infer({
      prompt: `Review the following code diff and provide detailed findings.

${validated.prTitle ? `PR Title: ${validated.prTitle}` : ''}
${validated.prDescription ? `PR Description: ${validated.prDescription}` : ''}
${validated.language ? `Language: ${validated.language}` : ''}

Diff:
${validated.diff}

Respond ONLY with valid JSON matching this schema:
{
  "findings": [{ "filePath": string, "line": number, "severity": "critical"|"warning"|"suggestion"|"praise", "message": string, "suggestedFix"?: string }],
  "summary": "overall review summary",
  "score": 0-100
}`,
      systemPrompt:
        'You are an expert code reviewer. Analyze diffs for bugs, security issues, performance problems, and style. Provide actionable feedback with file paths and line numbers. Always respond with valid JSON only.',
      userId,
      app: 'quantmail',
      feature: 'code-review',
      temperature: 0.3,
      maxTokens: 2048,
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(response.content);
    } catch {
      throw createAppError('Failed to parse AI code review response', 500, 'AI_PARSE_ERROR');
    }

    const result = ReviewResultSchema.safeParse(parsed);
    if (!result.success) {
      throw createAppError('AI returned invalid code review result', 500, 'AI_VALIDATION_ERROR');
    }

    return result.data;
  }
}
