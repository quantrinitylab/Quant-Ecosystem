// ============================================================================
// AI Adapters — UserInboxCategoryMemory (the learned inbox-partition channel)
//
// When a user moves a message into a different inbox tab, that is a correction
// of how their mail should be sorted — and it is a durable, user-owned fact,
// not a per-session guess. This channel remembers "for THIS user, mail from
// <sender> belongs in <category>", so QuantMail's inbound categorizer can honor
// the user's own past decisions before falling back to built-in heuristics.
//
// This is the piece the static rule engine could not have: Gmail's tabs are
// fixed heuristics; here the sort adapts to the individual and the memory is
// owned by the user (Law 4 — the memory subsystem is the transport; apps never
// import each other).
//
// Storage: `user-inbox-category <sender> {json}`, kind=preference, level=user.
// ============================================================================

import { z } from 'zod';
import { asKind, asLevel } from '../core/memory-port';
import type { RememberRequest } from '../core/memory-port';
import type { MemoryBackend } from '../core/memory-facade';

/** The five inbox partitions QuantMail's SmartInboxService sorts into. */
export const INBOX_CATEGORIES = ['primary', 'social', 'promotions', 'updates', 'forums'] as const;

export const UserInboxCategoryCorrectionSchema = z.object({
  /** Lowercased sender address the correction is keyed on. */
  sender: z.string().min(1),
  /** The category the user says mail from this sender belongs in. */
  category: z.enum(INBOX_CATEGORIES),
  /** ISO timestamp of the most recent correction, for audit / last-write-wins. */
  correctedAt: z.string(),
});

export type UserInboxCategoryCorrection = z.infer<typeof UserInboxCategoryCorrectionSchema>;

/** A MemoryBackend that may also support explicit writes (MemoryService does). */
export interface InboxCategoryMemoryBackend extends MemoryBackend {
  remember?(input: RememberRequest): Promise<void>;
}

export const USER_INBOX_CATEGORY_MEMORY_PREFIX = 'user-inbox-category';

export class UserInboxCategoryMemory {
  constructor(private readonly memory: InboxCategoryMemoryBackend) {}

  /** Normalize a sender so `Alice <A@Example.COM>`-style noise cannot split rows. */
  private static normalizeSender(sender: string): string {
    const angle = sender.match(/<([^>]+)>/);
    const raw = (angle?.[1] ?? sender).trim().toLowerCase();
    return raw;
  }

  /**
   * The category this user has previously assigned to mail from `sender`, or
   * null if they never corrected it. Most-recent correction wins.
   */
  async get(userId: string, sender: string): Promise<UserInboxCategoryCorrection | null> {
    const key = UserInboxCategoryMemory.normalizeSender(sender);
    const results = await this.memory.recall({
      actor: userId,
      query: `${USER_INBOX_CATEGORY_MEMORY_PREFIX} ${key}`,
    });
    let best: UserInboxCategoryCorrection | null = null;
    for (const r of results) {
      const idx = r.content.indexOf('{');
      if (idx < 0) continue;
      try {
        const parsed = UserInboxCategoryCorrectionSchema.safeParse(
          JSON.parse(r.content.slice(idx)),
        );
        if (!parsed.success || parsed.data.sender !== key) continue;
        if (!best || parsed.data.correctedAt > best.correctedAt) best = parsed.data;
      } catch {
        /* skip malformed row */
      }
    }
    return best;
  }

  /** Record that this user sorts mail from `sender` into `category`. */
  async set(
    userId: string,
    sender: string,
    category: (typeof INBOX_CATEGORIES)[number],
  ): Promise<void> {
    const correction: UserInboxCategoryCorrection = {
      sender: UserInboxCategoryMemory.normalizeSender(sender),
      category,
      correctedAt: new Date().toISOString(),
    };
    const content = `${USER_INBOX_CATEGORY_MEMORY_PREFIX} ${correction.sender} ${JSON.stringify(correction)}`;
    if (this.memory.remember) {
      await this.memory.remember({
        actor: userId,
        content,
        kind: asKind('preference'),
        level: asLevel('user'),
        session: 'user-inbox-category',
      });
    } else {
      await this.memory.observe({
        actor: userId,
        session: 'user-inbox-category',
        role: 'system',
        content,
      });
    }
  }
}
