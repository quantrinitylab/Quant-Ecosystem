// ============================================================================
// QuantMail — learned inbox-category store (durable, per-user).
//
// Wraps the shared UserInboxCategoryMemory channel (@quant/ai) so a user's own
// corrections — "mail from this sender belongs in Updates, not Primary" —
// survive restarts and are honored by inbound categorization before the static
// SmartInboxService heuristics run. This is what lifts QuantMail's sorting from
// fixed tabs (Gmail-class) to sorting that adapts to the individual and is
// owned by the user's memory.
// ============================================================================

import { UserInboxCategoryMemory, type INBOX_CATEGORIES } from '@quant/ai';
import type { RememberingMemoryBackend } from './ai-style-learner.service';

export type LearnedInboxCategory = (typeof INBOX_CATEGORIES)[number];

/**
 * Port the inbound-ingest adapter consults. Kept minimal (one read, one write)
 * so ingest can depend on it without pulling the memory subsystem into scope,
 * and so tests can inject an in-memory double.
 */
export interface LearnedInboxCategoryStore {
  /** The category this user assigned to mail from `sender`, or null. */
  lookup(userId: string, sender: string): Promise<LearnedInboxCategory | null>;
  /** Record that this user sorts mail from `sender` into `category`. */
  record(userId: string, sender: string, category: LearnedInboxCategory): Promise<void>;
}

/** Memory-backed implementation over the shared @quant/ai channel. */
export class MemoryBackedLearnedInboxCategoryStore implements LearnedInboxCategoryStore {
  private readonly channel: UserInboxCategoryMemory;

  constructor(memory: RememberingMemoryBackend) {
    this.channel = new UserInboxCategoryMemory(memory);
  }

  async lookup(userId: string, sender: string): Promise<LearnedInboxCategory | null> {
    const correction = await this.channel.get(userId, sender);
    return correction ? correction.category : null;
  }

  async record(userId: string, sender: string, category: LearnedInboxCategory): Promise<void> {
    await this.channel.set(userId, sender, category);
  }
}
