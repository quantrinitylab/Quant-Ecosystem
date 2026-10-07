import { z } from 'zod';
import { UserStyleMemory } from '@quant/ai';
import type { AIEngine, MemoryBackend, RememberRequest } from '@quant/ai';

/** A MemoryBackend that also supports explicit writes (MemoryService does). */
export interface RememberingMemoryBackend extends MemoryBackend {
  remember?(input: RememberRequest): Promise<void>;
}
import { createAppError } from '@quant/server-core';

export const SentEmailSchema = z.object({
  subject: z.string(),
  body: z.string(),
  to: z.string(),
  date: z.string().optional(),
});

export const StyleProfileSchema = z.object({
  userId: z.string(),
  tone: z.string(),
  averageSentenceLength: z.number(),
  vocabularyLevel: z.string(),
  greetingStyle: z.string(),
  closingStyle: z.string(),
  formality: z.number().min(0).max(1),
  traits: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});

export const StyledDraftSchema = z.object({
  body: z.string(),
  matchScore: z.number().min(0).max(1),
  adjustments: z.array(z.string()),
});

export type SentEmail = z.infer<typeof SentEmailSchema>;
export type StyleProfile = z.infer<typeof StyleProfileSchema>;
export type StyledDraft = z.infer<typeof StyledDraftSchema>;

// ─── Style profile persistence port (M11c flagship integration) ─────────────
// The user's writing style IS a user memory. The port lets the profile live in
// the memory subsystem without coupling this service to any backend (Law 4/5).

export interface StyleProfileStore {
  get(userId: string): Promise<StyleProfile | null>;
  set(userId: string, profile: StyleProfile): Promise<void>;
}

/** Default store: the original ephemeral Map. Byte-identical behavior. */
export class InMemoryStyleStore implements StyleProfileStore {
  private profiles = new Map<string, StyleProfile>();
  async get(userId: string): Promise<StyleProfile | null> {
    return this.profiles.get(userId) ?? null;
  }
  async set(userId: string, profile: StyleProfile): Promise<void> {
    this.profiles.set(userId, profile);
  }
}

/**
 * Memory-subsystem-backed store: delegates to the SHARED UserStyleMemory
 * channel (@quant/ai) so every app — QuantChat smart replies, QuantDocs
 * compose, future surfaces — reads the same durable style memory that
 * QuantMail learns. One agent, shared memory, across apps.
 */
export class MemoryBackedStyleStore implements StyleProfileStore {
  private readonly channel: UserStyleMemory;
  constructor(memory: RememberingMemoryBackend) {
    this.channel = new UserStyleMemory(memory);
  }

  async get(userId: string): Promise<StyleProfile | null> {
    return this.channel.get(userId);
  }

  async set(userId: string, profile: StyleProfile): Promise<void> {
    await this.channel.set(userId, profile);
  }
}

export class AIStyleLearnerService {
  /** Style persistence port. Default preserves the original in-memory behavior. */
  private readonly store: StyleProfileStore;

  constructor(
    private readonly ai: AIEngine,
    store?: StyleProfileStore,
  ) {
    this.store = store ?? new InMemoryStyleStore();
  }

  async analyzeSentItems(sentEmails: SentEmail[], userId: string): Promise<StyleProfile> {
    const validated = sentEmails.map((e) => SentEmailSchema.parse(e));

    const sampleText = validated
      .slice(0, 10)
      .map((e) => `To: ${e.to}\nSubject: ${e.subject}\n${e.body}`)
      .join('\n---\n');

    const response = await this.ai.infer({
      prompt: `Analyze these sent emails and create a writing style profile for the user.

Sent emails sample:
${sampleText}

Respond ONLY with valid JSON:
{
  "userId": "${userId}",
  "tone": "predominant tone",
  "averageSentenceLength": 15,
  "vocabularyLevel": "simple|moderate|advanced",
  "greetingStyle": "typical greeting used",
  "closingStyle": "typical closing used",
  "formality": 0.0 to 1.0,
  "traits": ["trait 1", "trait 2"],
  "confidence": 0.0 to 1.0
}`,
      systemPrompt:
        'You are a writing style analyst. Identify writing patterns and preferences from email samples. Always respond with valid JSON only.',
      userId,
      app: 'quantmail',
      feature: 'style-learner',
      temperature: 0.3,
      maxTokens: 512,
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(response.content);
    } catch {
      throw createAppError('Failed to parse AI style analysis response', 500, 'AI_PARSE_ERROR');
    }

    const result = StyleProfileSchema.safeParse(parsed);
    if (!result.success) {
      throw createAppError('AI returned invalid style profile', 500, 'AI_VALIDATION_ERROR');
    }

    await this.store.set(userId, result.data);
    return result.data;
  }

  async getStyleProfile(userId: string): Promise<StyleProfile> {
    const profile = await this.store.get(userId);
    if (!profile) {
      throw createAppError(
        'No style profile found. Analyze sent items first.',
        404,
        'PROFILE_NOT_FOUND',
      );
    }
    return profile;
  }

  async generateStyledDraft(content: string, userId: string): Promise<StyledDraft> {
    const profile = await this.store.get(userId);
    const styleContext = profile
      ? `User's style: ${profile.tone} tone, ${profile.vocabularyLevel} vocabulary, formality: ${profile.formality}, greeting: "${profile.greetingStyle}", closing: "${profile.closingStyle}"`
      : 'No style profile available. Use professional defaults.';

    const response = await this.ai.infer({
      prompt: `Write an email draft matching the user's writing style.

Content to express: ${content}

${styleContext}

Respond ONLY with valid JSON:
{
  "body": "the email draft in user's style",
  "matchScore": 0.0 to 1.0,
  "adjustments": ["adjustment 1", "adjustment 2"]
}`,
      systemPrompt:
        'You are an email writing assistant that mimics a user writing style. Always respond with valid JSON only.',
      userId,
      app: 'quantmail',
      feature: 'style-learner',
      temperature: 0.6,
      maxTokens: 1024,
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(response.content);
    } catch {
      throw createAppError('Failed to parse AI styled draft response', 500, 'AI_PARSE_ERROR');
    }

    const result = StyledDraftSchema.safeParse(parsed);
    if (!result.success) {
      throw createAppError('AI returned invalid styled draft', 500, 'AI_VALIDATION_ERROR');
    }

    return result.data;
  }
}
