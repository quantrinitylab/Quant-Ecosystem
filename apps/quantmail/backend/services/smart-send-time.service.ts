import { z } from 'zod';
import type { AIEngine } from '@quant/ai';
import { asKind, asLevel } from '@quant/ai';
import type { RememberingMemoryBackend } from './ai-style-learner.service';
import { createAppError } from '@quant/server-core';

export const RecipientPatternSchema = z.object({
  recipientEmail: z.string(),
  averageResponseTimeMinutes: z.number(),
  mostActiveHours: z.array(z.number()),
  mostActiveDays: z.array(z.string()),
  timezone: z.string().optional(),
});

export const OptimalTimeSchema = z.object({
  recipientEmail: z.string(),
  suggestedTime: z.string(),
  reason: z.string(),
  confidence: z.number().min(0).max(1),
  alternativeTimes: z.array(z.string()),
});

export type RecipientPattern = z.infer<typeof RecipientPatternSchema>;
export type OptimalTime = z.infer<typeof OptimalTimeSchema>;

// ─── Recipient pattern persistence port (flagship memory integration) ───────
// How a recipient engages (active hours, response latency, timezone) is a
// learned user memory. Without persistence getRecipientPatterns() can only
// return a hardcoded stub.

export interface RecipientPatternStore {
  get(userId: string, recipientEmail: string): Promise<RecipientPattern | null>;
  set(userId: string, pattern: RecipientPattern): Promise<void>;
}

const SENDTIME_MEMORY_PREFIX = 'quantmail-sendtime-pattern';

/** Persists recipient engagement patterns as user memories. */
export class MemoryBackedPatternStore implements RecipientPatternStore {
  constructor(private readonly memory: RememberingMemoryBackend) {}

  async get(userId: string, recipientEmail: string): Promise<RecipientPattern | null> {
    const results = await this.memory.recall({
      actor: userId,
      query: `${SENDTIME_MEMORY_PREFIX} ${recipientEmail}`,
    });
    for (const r of results) {
      const idx = r.content.indexOf('{');
      if (idx < 0) continue;
      try {
        const parsed = RecipientPatternSchema.safeParse(JSON.parse(r.content.slice(idx)));
        if (parsed.success && parsed.data.recipientEmail === recipientEmail) return parsed.data;
      } catch {
        /* skip malformed row */
      }
    }
    return null;
  }

  async set(userId: string, pattern: RecipientPattern): Promise<void> {
    const content = `${SENDTIME_MEMORY_PREFIX} ${pattern.recipientEmail} ${JSON.stringify(pattern)}`;
    if (this.memory.remember) {
      await this.memory.remember({
        actor: userId,
        content,
        kind: asKind('entity'),
        level: asLevel('user'),
        session: 'quantmail-sendtime',
      });
    } else {
      await this.memory.observe({
        actor: userId,
        session: 'quantmail-sendtime',
        role: 'system',
        content,
      });
    }
  }
}

export class SmartSendTimeService {
  /** Optional persistence port. Absent = original stub behavior. */
  private readonly store: RecipientPatternStore | undefined;

  constructor(
    private readonly ai: AIEngine,
    store?: RecipientPatternStore,
  ) {
    this.store = store;
  }

  /** Record a learned engagement pattern (best-effort; never throws). */
  async saveRecipientPattern(userId: string, pattern: RecipientPattern): Promise<void> {
    if (!this.store) return;
    try {
      await this.store.set(userId, pattern);
    } catch {
      /* best-effort by design */
    }
  }

  async predictOptimalTime(
    recipientEmail: string,
    userId: string,
    engagementHistory?: RecipientPattern,
  ): Promise<OptimalTime> {
    const historyText = engagementHistory
      ? `Average response time: ${engagementHistory.averageResponseTimeMinutes} minutes
Most active hours: ${engagementHistory.mostActiveHours.join(', ')}
Most active days: ${engagementHistory.mostActiveDays.join(', ')}
Timezone: ${engagementHistory.timezone || 'unknown'}`
      : 'No engagement history available.';

    const response = await this.ai.infer({
      prompt: `Based on this recipient's engagement patterns, predict the optimal send time.

Recipient: ${recipientEmail}
${historyText}

Respond ONLY with valid JSON:
{
  "recipientEmail": "${recipientEmail}",
  "suggestedTime": "ISO datetime string",
  "reason": "why this time is optimal",
  "confidence": 0.0 to 1.0,
  "alternativeTimes": ["ISO datetime 1", "ISO datetime 2"]
}`,
      systemPrompt:
        'You are an email send-time optimization assistant. Predict when emails are most likely to be read and responded to. Always respond with valid JSON only.',
      userId,
      app: 'quantmail',
      feature: 'smart-send-time',
      temperature: 0.3,
      maxTokens: 256,
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(response.content);
    } catch {
      throw createAppError('Failed to parse AI send time response', 500, 'AI_PARSE_ERROR');
    }

    const result = OptimalTimeSchema.safeParse(parsed);
    if (!result.success) {
      throw createAppError('AI returned invalid optimal time result', 500, 'AI_VALIDATION_ERROR');
    }

    return result.data;
  }

  async getRecipientPatterns(recipientEmail: string, userId: string): Promise<RecipientPattern> {
    // Remembered engagement pattern beats the hardcoded default.
    if (this.store) {
      const remembered = await this.store.get(userId, recipientEmail);
      if (remembered) return remembered;
    }
    // Fallback: the original default profile (unchanged).
    return {
      recipientEmail,
      averageResponseTimeMinutes: 45,
      mostActiveHours: [9, 10, 14, 15],
      mostActiveDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday'],
      timezone: 'America/New_York',
    };
  }
}
