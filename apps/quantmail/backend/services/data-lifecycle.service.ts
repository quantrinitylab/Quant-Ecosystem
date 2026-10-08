/**
 * QM-BACK-006 — data-lifecycle domain service (M15, doc 23 EC-03).
 *
 * Every lifecycle transition writes its domain row AND its versioned outbox
 * event in ONE transaction (doc 23 runtime law 1), reusing the K1 `emitOutbox`
 * primitive. Completion is VERIFIED through `lifecycle_operations` rows —
 * publication alone is never treated as completion (doc 23 laws 7/8).
 *
 * Covered transitions:
 * - legal hold place / release            -> legalhold.placed/released.v1
 * - data export request / complete / fail -> data.export.requested/completed/failed.v1
 * - retention sweep                       -> data.retention.policy_applied.v1
 *                                           (+ data.deletion.completed.v1 /
 *                                             data.retention.expired.v1 per item)
 * - deletion refused by an active hold    -> data.deletion.blocked.v1
 *
 * Event payloads carry ids + actor scope only — never message bodies, file
 * contents, or secrets.
 */

import { createAppError } from '@quant/server-core';
import { emitOutbox } from '../lib/outbox-events';
import {
  LifecycleEvents,
  parseLifecyclePayload,
} from '../lib/lifecycle-events';

/** Structural Prisma surface this service needs (mirrors OutboxTx style). */
export interface LifecycleDb {
  $transaction<T>(cb: (tx: LifecycleTx) => Promise<T>): Promise<T>;
}

export interface LifecycleTx {
  legalHold: {
    create(args: unknown): Promise<Record<string, unknown>>;
    findUnique(args: unknown): Promise<Record<string, unknown> | null>;
    findFirst(args: unknown): Promise<Record<string, unknown> | null>;
    findMany(args: unknown): Promise<Record<string, unknown>[]>;
    update(args: unknown): Promise<Record<string, unknown>>;
  };
  dataExportRequest: {
    create(args: unknown): Promise<Record<string, unknown>>;
    findUnique(args: unknown): Promise<Record<string, unknown> | null>;
    update(args: unknown): Promise<Record<string, unknown>>;
    count(args: unknown): Promise<number>;
  };
  retentionPolicyRecord: {
    findMany(args: unknown): Promise<Record<string, unknown>[]>;
    create(args: unknown): Promise<Record<string, unknown>>;
  };
  lifecycleOperation: {
    create(args: unknown): Promise<Record<string, unknown>>;
    update(args: unknown): Promise<Record<string, unknown>>;
    findUnique(args: unknown): Promise<Record<string, unknown> | null>;
  };
  projectorCheckpoint: {
    upsert(args: unknown): Promise<Record<string, unknown>>;
    findUnique(args: unknown): Promise<Record<string, unknown> | null>;
  };
  email: {
    findMany(args: unknown): Promise<Record<string, unknown>[]>;
    update(args: unknown): Promise<Record<string, unknown>>;
    count(args: unknown): Promise<number>;
  };
  emailThread: { count(args: unknown): Promise<number> };
  contact: { count(args: unknown): Promise<number> };
  file: { count(args: unknown): Promise<number> };
  emailFolder: {
    findFirst(args: unknown): Promise<Record<string, unknown> | null>;
    create(args: unknown): Promise<Record<string, unknown>>;
  };
  outboxEvent: { create(args: unknown): Promise<unknown> };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Max items a single sweep run touches per policy — bounded, honest work. */
export const RETENTION_SWEEP_BATCH_LIMIT = 500;

export interface PlaceHoldInput {
  custodianEmail: string;
  matterName: string;
  reason: string;
  placedBy: string;
}

function normalizeEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (!EMAIL_RE.test(normalized)) {
    throw createAppError('Valid custodianEmail is required', 400, 'INVALID_EMAIL');
  }
  return normalized;
}

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

/**
 * Place a legal hold AND emit `legalhold.placed.v1` in one transaction.
 * The lifecycle operation is created `completed` in the same tx — placement
 * has no async tail, so requested==completed atomically and honestly.
 */
export async function placeLegalHoldWithEvent(
  db: LifecycleDb,
  input: PlaceHoldInput,
): Promise<Record<string, unknown>> {
  const custodianEmail = normalizeEmail(input.custodianEmail);
  const matterName = input.matterName?.trim();
  if (!matterName) throw createAppError('matterName is required', 400, 'VALIDATION_ERROR');
  if (!input.placedBy?.trim()) throw createAppError('placedBy is required', 400, 'VALIDATION_ERROR');

  return db.$transaction(async (tx) => {
    const hold = await tx.legalHold.create({
      data: {
        custodianEmail,
        matterName,
        reason: input.reason?.trim() || 'Regulatory compliance inquiry',
        placedBy: input.placedBy,
        active: true,
      },
    });
    const holdId = String(hold.id);

    const operation = await tx.lifecycleOperation.create({
      data: {
        operationType: 'legalhold',
        aggregateType: 'LegalHold',
        aggregateId: holdId,
        status: 'completed',
        requestedBy: input.placedBy,
        completedAt: new Date(),
      },
    });

    const payload = parseLifecyclePayload(LifecycleEvents.legalHoldPlaced, {
      actor: input.placedBy,
      holdId,
      custodianEmail,
      matterName,
    });
    await emitOutbox(tx, {
      event: LifecycleEvents.legalHoldPlaced,
      aggregateType: 'LegalHold',
      aggregateId: holdId,
      payload: { ...payload, operationId: String(operation.id) },
    });

    return {
      id: holdId,
      custodianEmail,
      matterName,
      reason: String(hold.reason ?? ''),
      placedBy: String(hold.placedBy ?? ''),
      active: true,
      createdAt: toIso(hold.createdAt),
      operationId: String(operation.id),
    };
  });
}

/**
 * Release a legal hold AND emit `legalhold.released.v1` in one transaction.
 * Fail-closed: unknown id -> 404, already released -> 400.
 */
export async function releaseLegalHoldWithEvent(
  db: LifecycleDb,
  holdId: string,
  releaseReason: string,
  releasedBy: string,
): Promise<Record<string, unknown>> {
  if (!releasedBy?.trim()) throw createAppError('releasedBy is required', 400, 'VALIDATION_ERROR');

  return db.$transaction(async (tx) => {
    const existing = await tx.legalHold.findUnique({ where: { id: holdId } });
    if (!existing) throw createAppError('Legal hold record not found', 404, 'LEGAL_HOLD_NOT_FOUND');
    if (!existing.active) throw createAppError('Legal hold is already released', 400, 'ALREADY_RELEASED');

    const reason = releaseReason?.trim() || `Released by ${releasedBy}`;
    const updated = await tx.legalHold.update({
      where: { id: holdId },
      data: { active: false, releasedAt: new Date(), releaseReason: reason },
    });

    const operation = await tx.lifecycleOperation.create({
      data: {
        operationType: 'legalhold',
        aggregateType: 'LegalHold',
        aggregateId: holdId,
        status: 'completed',
        requestedBy: releasedBy,
        completedAt: new Date(),
      },
    });

    const payload = parseLifecyclePayload(LifecycleEvents.legalHoldReleased, {
      actor: releasedBy,
      holdId,
      custodianEmail: String(existing.custodianEmail ?? ''),
      releaseReason: reason,
    });
    await emitOutbox(tx, {
      event: LifecycleEvents.legalHoldReleased,
      aggregateType: 'LegalHold',
      aggregateId: holdId,
      payload: { ...payload, operationId: String(operation.id) },
    });

    return {
      id: holdId,
      active: false,
      releasedAt: toIso(updated.releasedAt),
      releaseReason: reason,
      operationId: String(operation.id),
    };
  });
}

/** True when any active hold names one of the given participant addresses. */
export async function isUnderLegalHoldTx(
  tx: LifecycleTx,
  addresses: string[],
): Promise<{ held: boolean; holdId?: string }> {
  const normalized = addresses.map((a) => a.trim().toLowerCase()).filter(Boolean);
  if (!normalized.length) return { held: false };
  const hold = await tx.legalHold.findFirst({
    where: { custodianEmail: { in: normalized }, active: true },
  });
  return hold ? { held: true, holdId: String(hold.id) } : { held: false };
}

/**
 * Request a data export (M15 export center). Creates the request row +
 * operation row + `data.export.requested.v1` in one transaction. The request
 * stays `requested` until `completeDataExport`/`failDataExport` runs — the
 * API never reports completion before the artifact exists.
 */
export async function requestDataExport(
  db: LifecycleDb,
  userId: string,
  scope = 'mailbox-inventory',
): Promise<{ exportId: string; operationId: string }> {
  if (!userId?.trim()) throw createAppError('userId is required', 400, 'VALIDATION_ERROR');

  return db.$transaction(async (tx) => {
    const req = await tx.dataExportRequest.create({
      data: { userId, scope, status: 'requested' },
    });
    const exportId = String(req.id);
    const operation = await tx.lifecycleOperation.create({
      data: {
        operationType: 'export',
        aggregateType: 'DataExportRequest',
        aggregateId: exportId,
        status: 'requested',
        requestedBy: userId,
      },
    });
    const payload = parseLifecyclePayload(LifecycleEvents.exportRequested, {
      actor: userId,
      exportId,
      scope,
      operationId: String(operation.id),
    });
    await emitOutbox(tx, {
      event: LifecycleEvents.exportRequested,
      aggregateType: 'DataExportRequest',
      aggregateId: exportId,
      payload,
    });
    return { exportId, operationId: String(operation.id) };
  });
}

/**
 * Build the v1 export artifact: a data-inventory manifest (M15 "what data
 * exists, why it is retained") from LIVE database counts. No content bodies —
 * counts and retention posture only.
 */
export async function generateInventoryManifest(
  tx: LifecycleTx,
  userId: string,
): Promise<Record<string, unknown>> {
  const [emails, threads, contacts, files, holds, exports, policies] = await Promise.all([
    tx.email.count({ where: { userId, deletedAt: null } }),
    tx.emailThread.count({ where: { userId } }),
    tx.contact.count({ where: { userId } }),
    tx.file.count({ where: { userId } }),
    tx.legalHold.findMany({ where: { placedBy: userId, active: true } }).then((r) => r.length),
    tx.dataExportRequest.count({ where: { userId } }),
    tx.retentionPolicyRecord.findMany({ where: { userId, enabled: true } }).then((r) => r.length),
  ]);

  return {
    version: 'mailbox-inventory.v1',
    userId,
    generatedAt: new Date().toISOString(),
    classes: {
      emails: { count: emails, retention: 'policy-driven (see retention_policies)' },
      threads: { count: threads, retention: 'follows member emails' },
      contacts: { count: contacts, retention: 'until user deletes' },
      driveFiles: { count: files, retention: 'until user deletes' },
    },
    compliance: {
      activeLegalHoldsPlacedByUser: holds,
      priorExports: exports,
      activeRetentionPolicies: policies,
    },
    note: 'Counts only. Message bodies, file contents and secrets are never included in lifecycle payloads.',
  };
}

/**
 * Mark an export complete — ONLY after the artifact was actually produced.
 * Emits `data.export.completed.v1` with the artifact pointer.
 */
export async function completeDataExport(
  db: LifecycleDb,
  exportId: string,
  actor: string,
  artifactRef: string,
): Promise<void> {
  await db.$transaction(async (tx) => {
    const req = await tx.dataExportRequest.findUnique({ where: { id: exportId } });
    if (!req) throw createAppError('Export request not found', 404, 'EXPORT_NOT_FOUND');
    if (req.status !== 'requested') {
      throw createAppError(`Export is already ${String(req.status)}`, 409, 'EXPORT_STATE_CONFLICT');
    }
    await tx.dataExportRequest.update({
      where: { id: exportId },
      data: { status: 'completed', artifactRef, completedAt: new Date() },
    });
    const operation = await tx.lifecycleOperation.create({
      data: {
        operationType: 'export',
        aggregateType: 'DataExportRequest',
        aggregateId: exportId,
        status: 'completed',
        requestedBy: actor,
        completedAt: new Date(),
      },
    });
    const payload = parseLifecyclePayload(LifecycleEvents.exportCompleted, {
      actor,
      exportId,
      scope: String(req.scope ?? 'mailbox-inventory'),
      operationId: String(operation.id),
      artifactRef,
    });
    await emitOutbox(tx, {
      event: LifecycleEvents.exportCompleted,
      aggregateType: 'DataExportRequest',
      aggregateId: exportId,
      payload,
    });
  });
}

/** Mark an export failed — terminal, with the error recorded. Never silent. */
export async function failDataExport(
  db: LifecycleDb,
  exportId: string,
  actor: string,
  error: string,
): Promise<void> {
  await db.$transaction(async (tx) => {
    const req = await tx.dataExportRequest.findUnique({ where: { id: exportId } });
    if (!req) throw createAppError('Export request not found', 404, 'EXPORT_NOT_FOUND');
    await tx.dataExportRequest.update({
      where: { id: exportId },
      data: { status: 'failed', error: error.slice(0, 500), completedAt: new Date() },
    });
    const operation = await tx.lifecycleOperation.create({
      data: {
        operationType: 'export',
        aggregateType: 'DataExportRequest',
        aggregateId: exportId,
        status: 'failed',
        requestedBy: actor,
        completedAt: new Date(),
        error: error.slice(0, 500),
      },
    });
    const payload = parseLifecyclePayload(LifecycleEvents.exportFailed, {
      actor,
      exportId,
      scope: String(req.scope ?? 'mailbox-inventory'),
      operationId: String(operation.id),
      error: error.slice(0, 500),
    });
    await emitOutbox(tx, {
      event: LifecycleEvents.exportFailed,
      aggregateType: 'DataExportRequest',
      aggregateId: exportId,
      payload,
    });
  });
}

export interface RetentionSweepResult {
  policiesRun: number;
  archived: number;
  deleted: number;
  blocked: number;
}

/**
 * Execute enabled retention policies (M15). For each policy, emails older than
 * `durationDays` (by receivedAt, falling back to createdAt) that are not
 * already deleted are transitioned:
 * - ARCHIVE         -> moved to the Archive folder (+ mail.thread.archived.v1
 *                      stays the mail-domain fact; the policy summary below is
 *                      the lifecycle fact)
 * - PERMANENT_DELETE-> deletedAt stamped (+ data.deletion.completed.v1 and
 *                      data.retention.expired.v1 per item — the erasure proof)
 *
 * Items whose participants are under an ACTIVE legal hold are SKIPPED and
 * counted as blocked — a hold always wins over expiry (M15). One
 * `data.retention.policy_applied.v1` summary event per policy per run.
 * Bounded: at most RETENTION_SWEEP_BATCH_LIMIT items per policy per run.
 */
export async function runRetentionSweep(
  db: LifecycleDb,
  actor = 'system:retention-sweep',
  now: Date = new Date(),
): Promise<RetentionSweepResult> {
  const result: RetentionSweepResult = { policiesRun: 0, archived: 0, deleted: 0, blocked: 0 };

  await db.$transaction(async (tx) => {
    const policies = await tx.retentionPolicyRecord.findMany({ where: { enabled: true } });

    for (const policy of policies) {
      const policyId = String(policy.id);
      const durationDays = Number(policy.durationDays);
      if (!Number.isFinite(durationDays) || durationDays < 1) continue;
      const cutoff = new Date(now.getTime() - durationDays * 24 * 60 * 60 * 1000);
      const targetFolders: string[] = Array.isArray(policy.targetFolders)
        ? (policy.targetFolders as string[])
        : [];
      const matchAll = targetFolders.length === 0 || targetFolders.includes('ALL');

      // Candidates: aged, live emails. Folder scoping resolves names to ids.
      let folderIds: string[] | null = null;
      if (!matchAll) {
        // targetFolders holds folder NAMES; resolve via emailFolder lookup per name.
        // (Kept simple: match folderId against folders with these names for the policy owner.)
        folderIds = [];
        for (const name of targetFolders) {
          const folder = await tx.emailFolder.findFirst({
            where: { userId: String(policy.userId), name },
          });
          if (folder) folderIds.push(String(folder.id));
        }
        if (!folderIds.length) continue; // no matching folders -> nothing to do
      }

      const candidates = await tx.email.findMany({
        where: {
          deletedAt: null,
          isTrash: false,
          OR: [{ receivedAt: { lt: cutoff } }, { receivedAt: null, createdAt: { lt: cutoff } }],
          ...(folderIds ? { folderId: { in: folderIds } } : {}),
        },
        take: RETENTION_SWEEP_BATCH_LIMIT,
      });

      let archived = 0;
      let deleted = 0;
      let blocked = 0;

      let archiveFolderId: string | null = null;
      if (policy.action === 'ARCHIVE' && candidates.length) {
        const existing = await tx.emailFolder.findFirst({
          where: { userId: String(policy.userId), type: 'ARCHIVE' },
        });
        archiveFolderId =
          (existing?.id as string | undefined) ??
          String(
            (
              await tx.emailFolder.create({
                data: { userId: String(policy.userId), name: 'Archive', type: 'ARCHIVE' },
              })
            ).id,
          );
      }

      for (const email of candidates) {
        const emailId = String(email.id);
        const participants = [
          String(email.fromAddress ?? ''),
          ...((email.toAddresses as string[] | null) ?? []),
        ].filter(Boolean);
        const { held, holdId } = await isUnderLegalHoldTx(tx, participants);
        if (held) {
          blocked++;
          continue;
        }

        const operation = await tx.lifecycleOperation.create({
          data: {
            operationType: 'retention',
            aggregateType: 'Email',
            aggregateId: emailId,
            status: 'completed',
            requestedBy: actor,
            completedAt: new Date(),
          },
        });
        const operationId = String(operation.id);

        if (policy.action === 'PERMANENT_DELETE') {
          await tx.email.update({ where: { id: emailId }, data: { deletedAt: now } });
          const completedPayload = parseLifecyclePayload(LifecycleEvents.deletionCompleted, {
            actor,
            targetId: emailId,
            targetKind: 'Email',
            operationId,
            invalidatedIndexes: ['emails'],
          });
          await emitOutbox(tx, {
            event: LifecycleEvents.deletionCompleted,
            aggregateType: 'Email',
            aggregateId: emailId,
            payload: completedPayload,
          });
          const expiredPayload = parseLifecyclePayload(LifecycleEvents.retentionExpired, {
            actor,
            targetId: emailId,
            targetKind: 'Email',
            policyId,
            operationId,
          });
          await emitOutbox(tx, {
            event: LifecycleEvents.retentionExpired,
            aggregateType: 'Email',
            aggregateId: emailId,
            payload: expiredPayload,
          });
          deleted++;
        } else {
          await tx.email.update({
            where: { id: emailId },
            data: { folderId: archiveFolderId, isTrash: false, deletedAt: null },
          });
          archived++;
        }
      }

      const summaryPayload = parseLifecyclePayload(LifecycleEvents.retentionPolicyApplied, {
        actor,
        policyId,
        policyName: String(policy.name ?? ''),
        action: policy.action === 'PERMANENT_DELETE' ? 'PERMANENT_DELETE' : 'ARCHIVE',
        archived,
        deleted,
        blocked,
      });
      await emitOutbox(tx, {
        event: LifecycleEvents.retentionPolicyApplied,
        aggregateType: 'RetentionPolicyRecord',
        aggregateId: policyId,
        payload: summaryPayload,
      });

      result.policiesRun++;
      result.archived += archived;
      result.deleted += deleted;
      result.blocked += blocked;
    }
  });

  return result;
}

/**
 * Record a deletion refused by policy (e.g. active legal hold) as an
 * audit-worthy fact: `data.deletion.blocked.v1` + a `blocked` operation row.
 * Called OUTSIDE the refused mutation's transaction (there is none — the
 * mutation never happened), in its own tx.
 */
export async function recordDeletionBlocked(
  db: LifecycleDb,
  input: {
    targetId: string;
    targetKind: string;
    actor: string;
    blockCode: string;
    holdId?: string;
    reason?: string;
  },
): Promise<{ operationId: string }> {
  return db.$transaction(async (tx) => {
    const operation = await tx.lifecycleOperation.create({
      data: {
        operationType: 'deletion',
        aggregateType: input.targetKind,
        aggregateId: input.targetId,
        status: 'blocked',
        requestedBy: input.actor,
        completedAt: new Date(),
        error: input.blockCode,
      },
    });
    const payload = parseLifecyclePayload(LifecycleEvents.deletionBlocked, {
      actor: input.actor,
      targetId: input.targetId,
      targetKind: input.targetKind,
      blockCode: input.blockCode,
      ...(input.holdId ? { holdId: input.holdId } : {}),
      ...(input.reason ? { reason: input.reason } : {}),
    });
    await emitOutbox(tx, {
      event: LifecycleEvents.deletionBlocked,
      aggregateType: input.targetKind as 'Email',
      aggregateId: input.targetId,
      payload: { ...payload, operationId: String(operation.id) },
    });
    return { operationId: String(operation.id) };
  });
}

/**
 * Consumer ack: mark a lifecycle operation's verified completion state.
 * Publication is not completion — a consumer (e.g. the search-indexer
 * invalidation projector) calls this AFTER its side effects are durable.
 */
export async function ackLifecycleOperation(
  db: LifecycleDb,
  operationId: string,
  status: 'completed' | 'failed',
  error?: string,
): Promise<void> {
  await db.$transaction(async (tx) => {
    const existing = await tx.lifecycleOperation.findUnique({ where: { id: operationId } });
    if (!existing) throw createAppError('Lifecycle operation not found', 404, 'OPERATION_NOT_FOUND');
    await tx.lifecycleOperation.update({
      where: { id: operationId },
      data: {
        status,
        completedAt: new Date(),
        ...(error ? { error: error.slice(0, 500) } : {}),
      },
    });
  });
}

/**
 * Projector checkpoint: record the last event a derived-index consumer
 * durably applied. Idempotent upsert — replay resumes from here.
 */
export async function recordProjectorCheckpoint(
  db: LifecycleDb,
  consumerId: string,
  lastEventId: string,
): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.projectorCheckpoint.upsert({
      where: { consumerId },
      create: { consumerId, lastEventId },
      update: { lastEventId },
    });
  });
}

export async function getProjectorCheckpoint(
  db: LifecycleDb,
  consumerId: string,
): Promise<string | null> {
  let lastEventId: string | null = null;
  await db.$transaction(async (tx) => {
    const row = await tx.projectorCheckpoint.findUnique({ where: { consumerId } });
    lastEventId = row ? String(row.lastEventId) : null;
  });
  return lastEventId;
}
