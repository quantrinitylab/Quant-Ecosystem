import { z } from 'zod';
import type { AIEngine } from '@quant/ai';
import { createAppError } from '@quant/server-core';

export const PRDescriptionInputSchema = z.object({
  commits: z.array(z.object({ sha: z.string(), message: z.string() })),
  diff: z.string().max(100000),
  title: z.string().optional(),
});

export type PRDescriptionInput = z.infer<typeof PRDescriptionInputSchema>;

export interface PRDescriptionResult {
  title: string;
  summary: string;
  changes: string[];
  testingNotes: string;
  breakingChanges: string[];
}

const PRDescriptionResultSchema = z.object({
  title: z.string(),
  summary: z.string(),
  changes: z.array(z.string()),
  testingNotes: z.string(),
  breakingChanges: z.array(z.string()),
});

export class AIPRDescriptionService {
  constructor(private readonly ai: AIEngine) {}

  async generateDescription(
    input: PRDescriptionInput,
    userId: string,
  ): Promise<PRDescriptionResult> {
    const validated = PRDescriptionInputSchema.parse(input);

    const commitsText = validated.commits
      .map((c) => `- ${c.sha.slice(0, 7)}: ${c.message}`)
      .join('\n');

    const response = await this.ai.infer({
      prompt: `Generate a comprehensive PR description for the following changes.

${validated.title ? `Title: ${validated.title}` : ''}

Commits:
${commitsText}

Diff:
${validated.diff}

Respond ONLY with valid JSON matching this schema:
{
  "title": "PR title",
  "summary": "brief summary of the PR",
  "changes": ["list of key changes"],
  "testingNotes": "how to test these changes",
  "breakingChanges": ["list of breaking changes, empty if none"]
}`,
      systemPrompt:
        'You are a PR description generator. Produce clear, comprehensive pull request descriptions that help reviewers understand the changes. Always respond with valid JSON only.',
      userId,
      app: 'quantmail',
      feature: 'pr-description',
      temperature: 0.4,
      maxTokens: 1024,
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(response.content);
    } catch {
      throw createAppError('Failed to parse AI PR description response', 500, 'AI_PARSE_ERROR');
    }

    const result = PRDescriptionResultSchema.safeParse(parsed);
    if (!result.success) {
      throw createAppError('AI returned invalid PR description result', 500, 'AI_VALIDATION_ERROR');
    }

    return result.data;
  }
}
