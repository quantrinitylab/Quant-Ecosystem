import { z } from 'zod';
import type { AIEngine } from '@quant/ai';
import { createAppError } from '@quant/server-core';
import type { RememberingMemoryBackend } from './ai-style-learner.service';

export const InteractionSchema = z.object({
  date: z.string(),
  subject: z.string(),
  direction: z.enum(['sent', 'received']),
  snippet: z.string(),
});

export const ContactContextSchema = z.object({
  contactEmail: z.string(),
  totalInteractions: z.number(),
  firstContact: z.string(),
  lastContact: z.string(),
  relationship: z.string(),
  topTopics: z.array(z.string()),
  sentiment: z.string(),
  confidence: z.number().min(0).max(1),
});

export type Interaction = z.infer<typeof InteractionSchema>;
export type ContactContext = z.infer<typeof ContactContextSchema>;

// ─── Contact context persistence port (flagship memory integration) ─────────
// The relationship with a contact IS a user memory. Without persistence every
// analysis is discarded: the LLM cost is re-paid and continuity is lost.

export interface ContactContextStore {
  get(userId: string, contactEmail: string): Promise<ContactContext | null>;
  set(userId: string, context: ContactContext): Promise<void>;
}

const CONTACT_MEMORY_PREFIX = 'quantmail-contact-context';

/** Persists contact context as a user memory via the memory subsystem. */
export class MemoryBackedContactStore implements ContactContextStore {
  constructor(private readonly memory: RememberingMemoryBackend) {}

  async get(userId: string, contactEmail: string): Promise<ContactContext | null> {
    const results = await this.memory.recall({
      actor: userId,
      query: `${CONTACT_MEMORY_PREFIX} ${contactEmail}`,
    });
    for (const r of results) {
      const idx = r.content.indexOf('{');
      if (idx < 0) continue;
      try {
        const parsed = ContactContextSchema.safeParse(JSON.parse(r.content.slice(idx)));
        if (parsed.success && parsed.data.contactEmail === contactEmail) return parsed.data;
      } catch {
        /* skip malformed row */
      }
    }
    return null;
  }

  async set(userId: string, context: ContactContext): Promise<void> {
    const content = `${CONTACT_MEMORY_PREFIX} ${context.contactEmail} ${JSON.stringify(context)}`;
    if (this.memory.remember) {
      await this.memory.remember({
        actor: userId,
        content,
        kind: 'entity',
        level: 'user',
        session: 'quantmail-contacts',
      });
    } else {
      await this.memory.observe({
        actor: userId,
        session: 'quantmail-contacts',
        role: 'system',
        content,
      });
    }
  }
}

export class AIContactContextService {
  /** Optional persistence port. Absent = original stateless behavior. */
  private readonly store: ContactContextStore | undefined;

  constructor(
    private readonly ai: AIEngine,
    store?: ContactContextStore,
  ) {
    this.store = store;
  }

  async getContactContext(
    contactEmail: string,
    userId: string,
    interactions?: Interaction[],
  ): Promise<ContactContext> {
    // Remembered relationship beats hallucinating from nothing: when the
    // caller has NO interaction data and we have a stored context, return it
    // instead of asking the model to analyze an empty history.
    if (this.store && (!interactions || interactions.length === 0)) {
      const remembered = await this.store.get(userId, contactEmail);
      if (remembered) return remembered;
    }

    const interactionList = interactions || [];

    const interactionText = interactionList
      .map((i) => `${i.date} [${i.direction}] ${i.subject}: ${i.snippet}`)
      .join('\n');

    const response = await this.ai.infer({
      prompt: `Analyze the interaction history with this contact and provide context.

Contact: ${contactEmail}
Interactions:
${interactionText || 'No prior interactions found.'}

Respond ONLY with valid JSON:
{
  "contactEmail": "${contactEmail}",
  "totalInteractions": ${interactionList.length},
  "firstContact": "date of first interaction",
  "lastContact": "date of most recent interaction",
  "relationship": "description of the relationship",
  "topTopics": ["topic 1", "topic 2"],
  "sentiment": "overall sentiment of interactions",
  "confidence": 0.0 to 1.0
}`,
      systemPrompt:
        'You are a contact relationship analyst. Provide insights about email relationships. Always respond with valid JSON only.',
      userId,
      app: 'quantmail',
      feature: 'contact-context',
      temperature: 0.3,
      maxTokens: 512,
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(response.content);
    } catch {
      throw createAppError('Failed to parse AI contact context response', 500, 'AI_PARSE_ERROR');
    }

    const result = ContactContextSchema.safeParse(parsed);
    if (!result.success) {
      throw createAppError('AI returned invalid contact context', 500, 'AI_VALIDATION_ERROR');
    }

    // Best-effort persistence: a failed memory write must never fail the request.
    if (this.store) {
      try {
        await this.store.set(userId, result.data);
      } catch {
        /* best-effort by design */
      }
    }

    return result.data;
  }

  async getRecentInteractions(
    contactEmail: string,
    userId: string,
    limit?: number,
  ): Promise<Interaction[]> {
    // In a real implementation, this would query the email database
    return [];
  }
}
