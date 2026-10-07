import { z } from 'zod';
import type { AIEngine } from '@quant/ai';
import { createAppError } from '@quant/server-core';

export const CommitMessageInputSchema = z.object({
  diff: z.string().max(100000),
  context: z.string().max(100000).optional(),
});

export type CommitMessageInput = z.infer<typeof CommitMessageInputSchema>;

export interface CommitMessageResult {
  message: string;
  type: string;
  scope: string | null;
  description: string;
  body: string | null;
  breaking: boolean;
}

const CommitMessageResultSchema = z.object({
  message: z.string(),
  type: z.string(),
  scope: z.string().nullable(),
  description: z.string(),
  body: z.string().nullable(),
  breaking: z.boolean(),
});

export class AICommitMessageService {
  constructor(private readonly ai: AIEngine) {}

  async generateMessage(input: CommitMessageInput, userId: string): Promise<CommitMessageResult> {
    const validated = CommitMessageInputSchema.parse(input);

    const response = await this.ai.infer({
      prompt: `Generate a conventional commit message for the following diff.

${validated.context ? `Context: ${validated.context}` : ''}

Diff:
${validated.diff}

The commit message must follow the conventional commit format: type(scope): description

Respond ONLY with valid JSON matching this schema:
{
  "message": "full commit message string (type(scope): description)",
  "type": "feat|fix|chore|docs|refactor|test|perf|ci|build|style",
  "scope": "scope or null",
  "description": "short description",
  "body": "longer explanation or null",
  "breaking": false
}`,
      systemPrompt:
        'You are a commit message generator. Produce concise, meaningful conventional commit messages from diffs. Always respond with valid JSON only.',
      userId,
      app: 'quantmail',
      feature: 'commit-message',
      temperature: 0.3,
      maxTokens: 512,
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(response.content);
    } catch {
      throw createAppError('Failed to parse AI commit message response', 500, 'AI_PARSE_ERROR');
    }

    const result = CommitMessageResultSchema.safeParse(parsed);
    if (!result.success) {
      throw createAppError('AI returned invalid commit message result', 500, 'AI_VALIDATION_ERROR');
    }

    return result.data;
  }
}
