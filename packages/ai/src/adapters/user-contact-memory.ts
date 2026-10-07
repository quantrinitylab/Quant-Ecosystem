// ============================================================================
// AI Adapters — UserContactMemory (the cross-app relationship channel)
//
// Second shared memory channel (after UserStyleMemory): what the user's
// relationship with a contact looks like — analyzed in QuantMail, usable by
// QuantChat replies, QuantMeet prep, QuantCalendar scheduling. The memory
// subsystem is the transport (Law 4); apps never import each other.
//
// Storage: `user-contact-context <email> {json}`, kind=entity, level=user.
// ============================================================================

import { z } from 'zod';
import { asKind, asLevel } from '../core/memory-port';
import type { RememberRequest } from '../core/memory-port';
import type { MemoryBackend } from '../core/memory-facade';

export const UserContactContextSchema = z.object({
  contactEmail: z.string(),
  totalInteractions: z.number(),
  firstContact: z.string(),
  lastContact: z.string(),
  relationship: z.string(),
  topTopics: z.array(z.string()),
  sentiment: z.string(),
  confidence: z.number().min(0).max(1),
});

export type UserContactContext = z.infer<typeof UserContactContextSchema>;

/** A MemoryBackend that may also support explicit writes (MemoryService does). */
export interface ContactMemoryBackend extends MemoryBackend {
  remember?(input: RememberRequest): Promise<void>;
}

export const USER_CONTACT_MEMORY_PREFIX = 'user-contact-context';

export class UserContactMemory {
  constructor(private readonly memory: ContactMemoryBackend) {}

  async get(userId: string, contactEmail: string): Promise<UserContactContext | null> {
    const results = await this.memory.recall({
      actor: userId,
      query: `${USER_CONTACT_MEMORY_PREFIX} ${contactEmail}`,
    });
    for (const r of results) {
      const idx = r.content.indexOf('{');
      if (idx < 0) continue;
      try {
        const parsed = UserContactContextSchema.safeParse(JSON.parse(r.content.slice(idx)));
        if (parsed.success && parsed.data.contactEmail === contactEmail) return parsed.data;
      } catch {
        /* skip malformed row */
      }
    }
    return null;
  }

  async set(userId: string, context: UserContactContext): Promise<void> {
    const content = `${USER_CONTACT_MEMORY_PREFIX} ${context.contactEmail} ${JSON.stringify(context)}`;
    if (this.memory.remember) {
      await this.memory.remember({
        actor: userId,
        content,
        kind: asKind('entity'),
        level: asLevel('user'),
        session: 'user-contacts',
      });
    } else {
      await this.memory.observe({
        actor: userId,
        session: 'user-contacts',
        role: 'system',
        content,
      });
    }
  }

  /** Render compact relationship hints for prompt injection (empty if none). */
  static toPromptHints(ctx: UserContactContext | null): string {
    if (!ctx) return '';
    return (
      `Relationship context for ${ctx.contactEmail}: ${ctx.relationship}. ` +
      `Recent topics: ${ctx.topTopics.join(', ') || 'none'}. Overall sentiment: ${ctx.sentiment}.`
    );
  }
}
