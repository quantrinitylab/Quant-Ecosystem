import { z } from 'zod';
import type { AIEngine } from '@quant/ai';
import { createAppError } from '@quant/server-core';

export const ThreadMessageSchema = z.object({
  from: z.string(),
  subject: z.string(),
  body: z.string(),
  date: z.string().optional(),
});

export const SummarizeResultSchema = z.object({
  summary: z.string(),
  keyPoints: z.array(z.string()),
  actionItems: z.array(z.string()),
  messageCount: z.number(),
});

export const SingleSummarizeResultSchema = z.object({
  summary: z.string(),
  keyPoints: z.array(z.string()),
});

export type ThreadMessage = z.infer<typeof ThreadMessageSchema>;
export type SummarizeResult = z.infer<typeof SummarizeResultSchema>;
export type SingleSummarizeResult = z.infer<typeof SingleSummarizeResultSchema>;

export class AISummarizeService {
  constructor(private readonly ai: AIEngine) {}

  async summarizeThread(messages: ThreadMessage[], userId: string): Promise<SummarizeResult> {
    const validated = messages.map((m) => ThreadMessageSchema.parse(m));

    const threadText = validated
      .map((m, i) => `[${i + 1}] From: ${m.from}\nSubject: ${m.subject}\n${m.body}`)
      .join('\n---\n');

    const response = await this.ai.infer({
      prompt: `Summarize this email thread of ${validated.length} messages into a concise summary.

Thread:
${threadText}

Respond ONLY with valid JSON:
{
  "summary": "2-3 sentence summary",
  "keyPoints": ["point 1", "point 2"],
  "actionItems": ["action 1", "action 2"],
  "messageCount": ${validated.length}
}`,
      systemPrompt:
        'You are an email summarization assistant. Create concise, accurate summaries of email threads. Always respond with valid JSON only.',
      userId,
      app: 'quantmail',
      feature: 'email-summarize',
      temperature: 0.3,
      maxTokens: 512,
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(response.content);
    } catch {
      throw createAppError('Failed to parse AI summary response', 500, 'AI_PARSE_ERROR');
    }

    const result = SummarizeResultSchema.safeParse(parsed);
    if (!result.success) {
      throw createAppError('AI returned invalid summary result', 500, 'AI_VALIDATION_ERROR');
    }

    return result.data;
  }

  async summarizeSingle(email: ThreadMessage, userId: string): Promise<SingleSummarizeResult> {
    const validated = ThreadMessageSchema.parse(email);

    const response = await this.ai.infer({
      prompt: `Summarize this email concisely.

From: ${validated.from}
Subject: ${validated.subject}
Body: ${validated.body}

Respond ONLY with valid JSON:
{
  "summary": "1-2 sentence summary",
  "keyPoints": ["point 1", "point 2"]
}`,
      systemPrompt:
        'You are an email summarization assistant. Create concise, accurate summaries. Always respond with valid JSON only.',
      userId,
      app: 'quantmail',
      feature: 'email-summarize',
      temperature: 0.3,
      maxTokens: 256,
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(response.content);
    } catch {
      throw createAppError('Failed to parse AI summary response', 500, 'AI_PARSE_ERROR');
    }

    const result = SingleSummarizeResultSchema.safeParse(parsed);
    if (!result.success) {
      throw createAppError('AI returned invalid summary result', 500, 'AI_VALIDATION_ERROR');
    }

    return result.data;
  }
}
