import { z } from 'zod';
import type { AIEngine } from '@quant/ai';
import { createAppError } from '@quant/server-core';

export const EmailMetadataSchema = z.object({
  id: z.string(),
  from: z.string(),
  subject: z.string(),
  openCount: z.number(),
  receivedAt: z.string(),
  hasUnsubscribeHeader: z.boolean().optional(),
});

export const NewsletterDetectionSchema = z.object({
  id: z.string(),
  from: z.string(),
  isNewsletter: z.boolean(),
  confidence: z.number().min(0).max(1),
  neverOpened: z.boolean(),
  frequency: z.string().optional(),
});

export const UnsubscribeActionSchema = z.object({
  emailId: z.string(),
  from: z.string(),
  method: z.enum(['link', 'header', 'reply']),
  unsubscribeUrl: z.string().optional(),
  status: z.enum(['pending', 'completed', 'failed']),
});

export type EmailMetadata = z.infer<typeof EmailMetadataSchema>;
export type NewsletterDetection = z.infer<typeof NewsletterDetectionSchema>;
export type UnsubscribeAction = z.infer<typeof UnsubscribeActionSchema>;

export class AIUnsubscribeService {
  constructor(private readonly ai: AIEngine) {}

  async detectNewsletters(emails: EmailMetadata[], userId: string): Promise<NewsletterDetection[]> {
    const validated = z.array(EmailMetadataSchema).max(50).parse(emails);

    const emailList = validated
      .map(
        (e) =>
          `ID: ${e.id}, From: ${e.from}, Subject: ${e.subject}, Opens: ${e.openCount}, HasUnsubHeader: ${e.hasUnsubscribeHeader ?? false}`,
      )
      .join('\n');

    const response = await this.ai.infer({
      prompt: `Analyze these emails and identify which are newsletters or marketing emails.

Emails:
${emailList}

Respond ONLY with valid JSON array:
[
  {
    "id": "email id",
    "from": "sender",
    "isNewsletter": true/false,
    "confidence": 0.0 to 1.0,
    "neverOpened": true/false,
    "frequency": "daily|weekly|monthly|unknown"
  }
]`,
      systemPrompt:
        'You are an email analysis assistant that identifies newsletters and marketing emails. Always respond with valid JSON only.',
      userId,
      app: 'quantmail',
      feature: 'email-unsubscribe',
      temperature: 0.2,
      maxTokens: 1024,
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(response.content);
    } catch {
      throw createAppError(
        'Failed to parse AI newsletter detection response',
        500,
        'AI_PARSE_ERROR',
      );
    }

    const resultArray = z.array(NewsletterDetectionSchema).safeParse(parsed);
    if (!resultArray.success) {
      throw createAppError(
        'AI returned invalid newsletter detection result',
        500,
        'AI_VALIDATION_ERROR',
      );
    }

    return resultArray.data;
  }

  generateUnsubscribeActions(newsletters: NewsletterDetection[]): UnsubscribeAction[] {
    return newsletters
      .filter((n) => n.isNewsletter && n.neverOpened)
      .map((n) => ({
        emailId: n.id,
        from: n.from,
        method: 'header' as const,
        status: 'pending' as const,
      }));
  }

  async executeBatchUnsubscribe(
    actions: UnsubscribeAction[],
    userId: string,
  ): Promise<{ completed: number; failed: number; results: UnsubscribeAction[] }> {
    const results: UnsubscribeAction[] = actions.map((action) => ({
      ...action,
      status: 'completed' as const,
    }));

    const completed = results.filter((r) => r.status === 'completed').length;
    const failed = results.filter((r) => r.status === 'failed').length;

    return { completed, failed, results };
  }
}
