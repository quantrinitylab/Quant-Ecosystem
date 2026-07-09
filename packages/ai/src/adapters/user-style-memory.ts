// ============================================================================
// AI Adapters — UserStyleMemory (the cross-app style channel)
//
// THE moat thesis made concrete: one agent, shared memory, across apps.
// QuantMail LEARNS the user's writing style; QuantChat (and any other app)
// READS it — through the memory subsystem, never through app-to-app coupling
// (Law 4). The style profile is a durable, recallable, exportable user memory.
//
// Storage format: `user-style-profile {json}` under kind=preference,
// level=user. Writers prefer the explicit remember() path (no extraction
// gamble); observe() is the fallback for plain MemoryBackend implementations.
// ============================================================================

import { z } from 'zod';
import type { MemoryBackend } from '../core/memory-facade';
import { asKind, asLevel } from '../core/memory-port';
import type { RememberRequest } from '../core/memory-port';

export const UserStyleProfileSchema = z.object({
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

export type UserStyleProfile = z.infer<typeof UserStyleProfileSchema>;

/** A MemoryBackend that may also support explicit writes (MemoryService does). */
export interface StyleMemoryBackend extends MemoryBackend {
  remember?(input: RememberRequest): Promise<void>;
}

export const USER_STYLE_MEMORY_PREFIX = 'user-style-profile';

export class UserStyleMemory {
  constructor(private readonly memory: StyleMemoryBackend) {}

  async get(userId: string): Promise<UserStyleProfile | null> {
    const results = await this.memory.recall({ actor: userId, query: USER_STYLE_MEMORY_PREFIX });
    for (const r of results) {
      const idx = r.content.indexOf('{');
      if (idx < 0) continue;
      try {
        const parsed = UserStyleProfileSchema.safeParse(JSON.parse(r.content.slice(idx)));
        if (parsed.success && parsed.data.userId === userId) return parsed.data;
      } catch {
        /* skip malformed row */
      }
    }
    return null;
  }

  async set(userId: string, profile: UserStyleProfile): Promise<void> {
    const content = `${USER_STYLE_MEMORY_PREFIX} ${JSON.stringify(profile)}`;
    if (this.memory.remember) {
      await this.memory.remember({
        actor: userId,
        content,
        kind: asKind('preference'),
        level: asLevel('user'),
        session: 'user-style',
      });
    } else {
      await this.memory.observe({
        actor: userId,
        session: 'user-style',
        role: 'system',
        content,
      });
    }
  }

  /** Render compact style hints for prompt injection (empty string if none). */
  static toPromptHints(profile: UserStyleProfile | null): string {
    if (!profile) return '';
    return (
      `The user's writing style: ${profile.tone} tone, ${profile.vocabularyLevel} vocabulary, ` +
      `formality ${profile.formality.toFixed(1)}/1.0, traits: ${profile.traits.join(', ') || 'none'}. ` +
      `Match this style.`
    );
  }
}
