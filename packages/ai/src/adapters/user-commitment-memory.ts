// ============================================================================
// AI Adapters — UserCommitmentMemory (the cross-app commitments channel)
//
// Third shared channel (after style and contact): things the user promised to
// do. Producers: QuantMail follow-up detection, QuantMeet action items.
// Consumers: QuantMail reminders, future daily-brief/calendar surfaces.
//
// Semantics inherited from the reminder store proven in quantmail #21:
// APPEND-ONLY status rows (Law 2) — a status change writes a new row with the
// same commitment id; listActive projects the LAST row per id.
//
// Storage: `user-commitment <id> {json}`, kind=episodic, level=user.
// ============================================================================

import { z } from 'zod';
import { asKind, asLevel } from '../core/memory-port';
import type { RememberRequest } from '../core/memory-port';
import type { MemoryBackend } from '../core/memory-facade';

export const UserCommitmentSchema = z.object({
  id: z.string(),
  userId: z.string(),
  description: z.string(),
  /** ISO datetime; null = no due date detected. */
  dueDate: z.string().nullable(),
  /** Where the commitment was made: 'quantmail' | 'quantmeet' | future apps. */
  source: z.string(),
  status: z.enum(['active', 'completed', 'dismissed']),
  createdAt: z.string(),
});

export type UserCommitment = z.infer<typeof UserCommitmentSchema>;

/** A MemoryBackend that may also support explicit writes (MemoryService does). */
export interface CommitmentMemoryBackend extends MemoryBackend {
  remember?(input: RememberRequest): Promise<void>;
}

export const USER_COMMITMENT_MEMORY_PREFIX = 'user-commitment';

export class UserCommitmentMemory {
  constructor(private readonly memory: CommitmentMemoryBackend) {}

  /** Append a commitment row (new commitment OR status change — same id). */
  async add(commitment: UserCommitment): Promise<void> {
    const content = `${USER_COMMITMENT_MEMORY_PREFIX} ${commitment.id} ${JSON.stringify(commitment)}`;
    if (this.memory.remember) {
      await this.memory.remember({
        actor: commitment.userId,
        content,
        kind: asKind('episodic'),
        level: asLevel('user'),
        session: `commitments-${commitment.source}`,
      });
    } else {
      await this.memory.observe({
        actor: commitment.userId,
        session: `commitments-${commitment.source}`,
        role: 'system',
        content,
      });
    }
  }

  /** Active commitments across ALL sources — last row per id wins (Law 2). */
  async listActive(userId: string): Promise<UserCommitment[]> {
    const results = await this.memory.recall({
      actor: userId,
      query: USER_COMMITMENT_MEMORY_PREFIX,
    });
    const latest = new Map<string, UserCommitment>();
    for (const r of results) {
      const idx = r.content.indexOf('{');
      if (idx < 0) continue;
      try {
        const parsed = UserCommitmentSchema.safeParse(JSON.parse(r.content.slice(idx)));
        if (parsed.success && parsed.data.userId === userId) {
          latest.set(parsed.data.id, parsed.data);
        }
      } catch {
        /* skip malformed row */
      }
    }
    return Array.from(latest.values()).filter((c) => c.status === 'active');
  }
}
