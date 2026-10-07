import { z } from 'zod';
import type { AIEngine } from '@quant/ai';
import { createAppError } from '@quant/server-core';

export const ComposeContextSchema = z.object({
  recipient: z.string().optional(),
  subject: z.string().optional(),
  tone: z.enum(['professional', 'casual', 'friendly', 'urgent']).optional(),
  format: z.enum(['brief', 'detailed', 'bullet_points']).optional(),
});

export const ComposeResultSchema = z.object({
  subject: z.string(),
  body: z.string(),
  confidence: z.number().min(0).max(1),
});

export const ImproveResultSchema = z.object({
  body: z.string(),
  changes: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});

export type ComposeContext = z.infer<typeof ComposeContextSchema>;
export type ComposeResult = z.infer<typeof ComposeResultSchema>;
export type ImproveResult = z.infer<typeof ImproveResultSchema>;

export class AIComposeService {
  constructor(private readonly ai: AIEngine) {}

  async composeFromBullets(
    bullets: string[],
    context: ComposeContext,
    userId: string,
  ): Promise<ComposeResult> {
    const validatedContext = ComposeContextSchema.parse(context);

    const bulletList = bullets.map((b) => `- ${b}`).join('\n');
    const toneInstruction = validatedContext.tone
      ? `Use a ${validatedContext.tone} tone.`
      : 'Use a professional tone.';

    const response = await this.ai.infer({
      prompt: `Convert these bullet points into a well-written email. ${toneInstruction}

Bullet points:
${bulletList}

${validatedContext.recipient ? `Recipient: ${validatedContext.recipient}` : ''}
${validatedContext.subject ? `Subject: ${validatedContext.subject}` : ''}

Respond ONLY with valid JSON:
{
  "subject": "email subject line",
  "body": "the full email body text",
  "confidence": 0.0 to 1.0
}`,
      systemPrompt:
        'You are an email composition assistant. Convert bullet points into well-structured, professional emails. Always respond with valid JSON only.',
      userId,
      app: 'quantmail',
      feature: 'email-compose',
      temperature: 0.6,
      maxTokens: 1024,
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(response.content);
    } catch {
      throw createAppError('Failed to parse AI compose response', 500, 'AI_PARSE_ERROR');
    }

    const result = ComposeResultSchema.safeParse(parsed);
    if (!result.success) {
      throw createAppError('AI returned invalid compose result', 500, 'AI_VALIDATION_ERROR');
    }

    return result.data;
  }

  async improveEmail(draft: string, instructions: string, userId: string): Promise<ImproveResult> {
    const response = await this.ai.infer({
      prompt: `Improve this email draft based on the instructions.

Draft:
${draft}

Instructions: ${instructions}

Respond ONLY with valid JSON:
{
  "body": "the improved email body",
  "changes": ["change 1 description", "change 2 description"],
  "confidence": 0.0 to 1.0
}`,
      systemPrompt:
        'You are an email editing assistant. Improve emails based on specific instructions while preserving the original meaning. Always respond with valid JSON only.',
      userId,
      app: 'quantmail',
      feature: 'email-compose',
      temperature: 0.5,
      maxTokens: 1024,
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(response.content);
    } catch {
      throw createAppError('Failed to parse AI improve response', 500, 'AI_PARSE_ERROR');
    }

    const result = ImproveResultSchema.safeParse(parsed);
    if (!result.success) {
      throw createAppError('AI returned invalid improve result', 500, 'AI_VALIDATION_ERROR');
    }

    return result.data;
  }
}
