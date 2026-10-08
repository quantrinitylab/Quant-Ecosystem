// ============================================================================
// Lifecycle Invalidation Handler — derived-index invalidation (QM-BACK-006)
//
// When a lifecycle transition erases data (mail.message.deleted.v1 with
// hard=true, data.deletion.completed.v1), the derived search indexes must drop
// the document — otherwise search keeps returning deleted data. Purges are
// naturally idempotent (deleting a missing doc is a no-op), so at-least-once
// redelivery is safe (doc 23 runtime law 3).
//
// After a durable purge the handler records a projector checkpoint so a
// crashed consumer resumes from the checkpoint instead of replaying from zero
// (doc 23 §7; projector_checkpoints table).
// ============================================================================

import { z } from 'zod';
import type { SearchClient, VectorClient } from '@quant/search';

/** Event types this handler invalidates on. */
export const INVALIDATION_EVENT_TYPES = [
  'mail.message.deleted.v1',
  'data.deletion.completed.v1',
] as const;

/** aggregateType -> derived index/collection mapping. Extend per product. */
const INVALIDATION_TARGETS: Record<string, { index: string; collection: string }> = {
  Email: { index: 'emails', collection: 'emails' },
};

const MailDeletedPayload = z.object({
  hard: z.boolean().optional(),
  emailId: z.string().optional(),
  userId: z.string().optional(),
});

const DeletionCompletedPayload = z.object({
  targetId: z.string(),
  targetKind: z.string(),
});

export interface CheckpointStore {
  recordCheckpoint(consumerId: string, lastEventId: string): Promise<void>;
  getCheckpoint(consumerId: string): Promise<string | null>;
}

/** In-memory checkpoint store for tests / single-process dev. */
export class MemoryCheckpointStore implements CheckpointStore {
  private readonly checkpoints = new Map<string, string>();
  async recordCheckpoint(consumerId: string, lastEventId: string): Promise<void> {
    this.checkpoints.set(consumerId, lastEventId);
  }
  async getCheckpoint(consumerId: string): Promise<string | null> {
    return this.checkpoints.get(consumerId) ?? null;
  }
}

export interface InvalidationEvent {
  /** Outbox event id — used as the checkpoint cursor. */
  id: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: unknown;
}

export type InvalidationOutcome =
  | { action: 'purged'; target: string }
  | { action: 'skipped'; reason: string };

export const INVALIDATION_CONSUMER_ID = 'search-indexer:lifecycle-invalidation';

/**
 * LifecycleInvalidationHandler
 *
 * Purges derived-index documents for erased aggregates and checkpoints the
 * event cursor. Safe to call with duplicate events.
 */
export class LifecycleInvalidationHandler {
  constructor(
    private readonly searchClient: Pick<SearchClient, 'deleteDocument'>,
    private readonly vectorClient: Pick<VectorClient, 'deletePoints'>,
    private readonly checkpoints: CheckpointStore = new MemoryCheckpointStore(),
  ) {}

  async handleInvalidation(event: InvalidationEvent): Promise<InvalidationOutcome> {
    const outcome = await this.purge(event);
    if (outcome.action === 'purged') {
      await this.checkpoints.recordCheckpoint(INVALIDATION_CONSUMER_ID, event.id);
    }
    return outcome;
  }

  private async purge(event: InvalidationEvent): Promise<InvalidationOutcome> {
    if (event.eventType === 'mail.message.deleted.v1') {
      const parsed = MailDeletedPayload.safeParse(event.payload);
      if (!parsed.success) return { action: 'skipped', reason: 'unparseable payload' };
      // Soft deletes (trash moves) stay searchable; only hard erasure purges.
      if (parsed.data.hard !== true) return { action: 'skipped', reason: 'soft delete stays indexed' };
      const emailId = parsed.data.emailId ?? event.aggregateId;
      return this.purgeTarget('Email', emailId);
    }

    if (event.eventType === 'data.deletion.completed.v1') {
      const parsed = DeletionCompletedPayload.safeParse(event.payload);
      if (!parsed.success) return { action: 'skipped', reason: 'unparseable payload' };
      return this.purgeTarget(parsed.data.targetKind, parsed.data.targetId);
    }

    return { action: 'skipped', reason: `not an invalidation event: ${event.eventType}` };
  }

  private async purgeTarget(
    aggregateType: string,
    aggregateId: string,
  ): Promise<InvalidationOutcome> {
    const target = INVALIDATION_TARGETS[aggregateType];
    if (!target) return { action: 'skipped', reason: `no index mapping for ${aggregateType}` };
    if (!aggregateId) return { action: 'skipped', reason: 'missing aggregate id' };

    await this.searchClient.deleteDocument(target.index, aggregateId);
    await this.vectorClient.deletePoints(target.collection, [aggregateId]);
    return { action: 'purged', target: `${target.index}:${aggregateId}` };
  }
}
