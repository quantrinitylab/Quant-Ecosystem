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

  /**
   * Extracts a JSON object from raw model output. Models instructed to
   * "respond with ONLY valid JSON" still frequently wrap it in ```json
   * fences or prepend/append prose — a bare JSON.parse then throws and the
   * user sees "Could not generate summary" for a summary that actually
   * exists. This unwraps fences and finds the outermost {...} before
   * parsing. Pure and unit-tested.
   */
  static extractJsonObject(raw: string): unknown {
    let text = raw.trim();
    // Strip ```json ... ``` or ``` ... ``` fences.
    const fenceMatch = text.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
    if (fenceMatch) {
      text = fenceMatch[1].trim();
    }
    // Fast path: already clean JSON.
    try {
      return JSON.parse(text);
    } catch {
      /* fall through to brace matching */
    }
    // Find the outermost balanced {...} span.
    const start = text.indexOf('{');
    if (start === -1) {
      throw createAppError('Failed to parse AI summary response', 500, 'AI_PARSE_ERROR');
    }
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === '\\') {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }
      if (ch === '"') {
        inString = true;
      } else if (ch === '{') {
        depth++;
      } else if (ch === '}') {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(text.slice(start, i + 1));
          } catch {
            throw createAppError('Failed to parse AI summary response', 500, 'AI_PARSE_ERROR');
          }
        }
      }
    }
    throw createAppError('Failed to parse AI summary response', 500, 'AI_PARSE_ERROR');
  }

  /**
   * BB-P1-5: the endpoint is wired end-to-end; on hosts with no AI provider
   * credentials `ai.infer` throws a "not configured" error. That used to
   * surface as a generic 500/INTERNAL_ERROR ("Could not generate summary. Try
   * again."), which is a lie when retry can never help. Reclassify it as a
   * 503 AI_UNAVAILABLE so the client can render an honest disabled state.
   */
  private static toHonestError(err: unknown): never {
    const message = err instanceof Error ? err.message : String(err);
    if (/not configured/i.test(message)) {
      throw createAppError(
        'AI summarization is not available on this server',
        503,
        'AI_UNAVAILABLE',
      );
    }
    throw err;
  }

  async summarizeThread(messages: ThreadMessage[], userId: string): Promise<SummarizeResult> {
    const validated = messages.map((m) => ThreadMessageSchema.parse(m));

    const threadText = validated
      .map((m, i) => `[${i + 1}] From: ${m.from}\nSubject: ${m.subject}\n${m.body}`)
      .join('\n---\n');

    let response: Awaited<ReturnType<AIEngine['infer']>>;
    try {
      response = await this.ai.infer({
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
    } catch (err) {
      AISummarizeService.toHonestError(err);
    }

    let parsed: unknown;
    try {
      parsed = AISummarizeService.extractJsonObject(response.content);
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

    let response: Awaited<ReturnType<AIEngine['infer']>>;
    try {
      response = await this.ai.infer({
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
    } catch (err) {
      AISummarizeService.toHonestError(err);
    }

    let parsed: unknown;
    try {
      parsed = AISummarizeService.extractJsonObject(response.content);
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
