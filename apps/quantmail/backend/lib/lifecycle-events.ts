/**
 * QM-BACK-006 — data-lifecycle domain events (M15, doc 23 EC-03).
 *
 * Versioned lifecycle facts, emitted transactionally through the outbox via
 * `emitOutbox` (same atomicity contract as K1 mail events: the domain write
 * and its outbox row commit in ONE transaction).
 *
 * Event naming follows doc 23 §4: product-owned, past-tense facts.
 * Payloads carry ids + actor scope only — never message bodies, file
 * contents, or secrets.
 *
 * Lifecycle (M15):
 *   CREATE -> ACTIVE -> RETAINED -> EXPIRED/DELETED
 *   CREATE -> ACTIVE -> HELD  (a hold blocks eligible deletion until released)
 */

import { z } from 'zod';

/** Spec'd lifecycle event names. */
export const LifecycleEvents = {
  /** A legal/compliance hold was placed on a custodian. */
  legalHoldPlaced: 'legalhold.placed.v1',
  /** A legal/compliance hold was released. */
  legalHoldReleased: 'legalhold.released.v1',
  /** A deletion was requested (async erasure begins; never promise immediate). */
  deletionRequested: 'data.deletion.requested.v1',
  /** Deletion side effects completed and verified. */
  deletionCompleted: 'data.deletion.completed.v1',
  /** Deletion was refused — e.g. an active legal hold. Audit-worthy. */
  deletionBlocked: 'data.deletion.blocked.v1',
  /** A data-export was requested (M15 export center). */
  exportRequested: 'data.export.requested.v1',
  /** The export artifact was produced and the request marked complete. */
  exportCompleted: 'data.export.completed.v1',
  /** Export generation failed; the request is terminal-failed, not silent. */
  exportFailed: 'data.export.failed.v1',
  /** A retention policy executed against expired data. */
  retentionPolicyApplied: 'data.retention.policy_applied.v1',
  /** A record aged past retention and was expired by policy. */
  retentionExpired: 'data.retention.expired.v1',
} as const;

export type LifecycleEventName =
  (typeof LifecycleEvents)[keyof typeof LifecycleEvents];

/** Aggregate types that carry lifecycle events. */
export type LifecycleAggregateType =
  | 'LegalHold'
  | 'Email'
  | 'DataExportRequest'
  | 'RetentionPolicyRecord'
  | 'LifecycleOperation'
  | 'User';

const basePayload = z.object({
  /** Actor that caused the transition: user id / service name. */
  actor: z.string().min(1),
  /** Why: human-readable reason / policy id. Never a secret. */
  reason: z.string().max(500).optional(),
});

export const LegalHoldPlacedPayload = basePayload.extend({
  holdId: z.string().min(1),
  custodianEmail: z.string().min(1),
  matterName: z.string().min(1),
});

export const LegalHoldReleasedPayload = basePayload.extend({
  holdId: z.string().min(1),
  custodianEmail: z.string().min(1),
  releaseReason: z.string().min(1),
});

export const DeletionRequestedPayload = basePayload.extend({
  targetId: z.string().min(1),
  targetKind: z.string().min(1),
  operationId: z.string().min(1),
});

export const DeletionCompletedPayload = basePayload.extend({
  targetId: z.string().min(1),
  targetKind: z.string().min(1),
  operationId: z.string().min(1),
  /** Derived indexes that were invalidated as part of completion. */
  invalidatedIndexes: z.array(z.string()).default([]),
});

export const DeletionBlockedPayload = basePayload.extend({
  targetId: z.string().min(1),
  targetKind: z.string().min(1),
  /** Machine-readable block code, e.g. LOCKED_LEGAL_HOLD. */
  blockCode: z.string().min(1),
  holdId: z.string().min(1).optional(),
});

export const ExportRequestedPayload = basePayload.extend({
  exportId: z.string().min(1),
  scope: z.string().min(1),
  operationId: z.string().min(1),
});

export const ExportCompletedPayload = basePayload.extend({
  exportId: z.string().min(1),
  scope: z.string().min(1),
  operationId: z.string().min(1),
  /** Pointer to the produced artifact (storage key / download id). */
  artifactRef: z.string().min(1),
});

export const ExportFailedPayload = basePayload.extend({
  exportId: z.string().min(1),
  scope: z.string().min(1),
  operationId: z.string().min(1),
  error: z.string().min(1).max(500),
});

export const RetentionPolicyAppliedPayload = basePayload.extend({
  policyId: z.string().min(1),
  policyName: z.string().min(1),
  action: z.enum(['ARCHIVE', 'PERMANENT_DELETE']),
  /** Counts — the sweep never promises per-item immediacy beyond the tx. */
  archived: z.number().int().nonnegative(),
  deleted: z.number().int().nonnegative(),
  blocked: z.number().int().nonnegative(),
});

export const RetentionExpiredPayload = basePayload.extend({
  targetId: z.string().min(1),
  targetKind: z.string().min(1),
  policyId: z.string().min(1),
  operationId: z.string().min(1),
});

export const LifecyclePayloadSchemas = {
  [LifecycleEvents.legalHoldPlaced]: LegalHoldPlacedPayload,
  [LifecycleEvents.legalHoldReleased]: LegalHoldReleasedPayload,
  [LifecycleEvents.deletionRequested]: DeletionRequestedPayload,
  [LifecycleEvents.deletionCompleted]: DeletionCompletedPayload,
  [LifecycleEvents.deletionBlocked]: DeletionBlockedPayload,
  [LifecycleEvents.exportRequested]: ExportRequestedPayload,
  [LifecycleEvents.exportCompleted]: ExportCompletedPayload,
  [LifecycleEvents.exportFailed]: ExportFailedPayload,
  [LifecycleEvents.retentionPolicyApplied]: RetentionPolicyAppliedPayload,
  [LifecycleEvents.retentionExpired]: RetentionExpiredPayload,
} as const;

/** Validate a lifecycle payload before it touches the outbox. Fail closed. */
export function parseLifecyclePayload(
  event: LifecycleEventName,
  payload: unknown,
): z.infer<(typeof LifecyclePayloadSchemas)[LifecycleEventName]> {
  const schema = LifecyclePayloadSchemas[event];
  return schema.parse(payload);
}
