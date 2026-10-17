/**
 * QM-BACK-002 — atomic optimistic-concurrency update helper.
 *
 * Uses a single conditional `updateMany` (WHERE id AND version = expected) so
 * the check-and-increment is race-free even at READ COMMITTED: two
 * concurrent writers cannot both succeed — the loser's update matches zero
 * rows and gets VERSION_CONFLICT with the fresh version for recovery.
 *
 * When no expectedVersion is given the update is unguarded (legacy callers
 * keep working) but the version column is still incremented so the column
 * stays truthful for future guarded writes.
 */
import { createAppError } from '@quant/server-core';
import { versionConflictError } from './mutation-context';

export type VersionedResource = 'Email' | 'EmailThread';

export interface VersionedUpdateArgs {
  id: string;
  resource: VersionedResource;
  /** Code used when the row vanished between the auth read and the write. */
  notFoundCode: string;
  notFoundMessage: string;
  expectedVersion?: number;
  /**
   * fix/qm-send-transmit-before-flip: when true, the conditional update also
   * requires `isDraft: true AND isSent: false` — the atomic send-once guard.
   * A zero-row match on an existing row means the send already flipped, so
   * the caller gets 409 EMAIL_ALREADY_SENT instead of re-executing (and
   * re-transmitting) the send. This is what makes a retry after a crash —
   * or after the idempotency claim TTL lapsed — safe.
   */
  requireUnsent?: boolean;
  /** Domain changes; `version: { increment: 1 }` is added automatically. */
  data: Record<string, unknown>;
}

export interface VersionedDelegate<T> {
  updateMany(args: {
    where: { id: string; version?: number; isDraft?: boolean; isSent?: boolean };
    data: Record<string, unknown>;
  }): Promise<{ count: number }>;
  findUnique(args: { where: { id: string } }): Promise<T | null>;
}

export interface VersionedTx {
  email: VersionedDelegate<unknown>;
  emailThread: VersionedDelegate<unknown>;
}

function notFound(args: VersionedUpdateArgs): never {
  throw createAppError(args.notFoundMessage, 404, args.notFoundCode);
}

/**
 * Perform the guarded update inside the caller's transaction and return the
 * fresh row. Throws VERSION_CONFLICT (409) on a stale expectedVersion, and
 * EMAIL_ALREADY_SENT (409) when `requireUnsent` is set and the row already
 * flipped to sent.
 */
export async function versionedUpdate<T>(
  tx: VersionedTx,
  args: VersionedUpdateArgs,
): Promise<T> {
  const delegate = (
    args.resource === 'Email' ? tx.email : tx.emailThread
  ) as VersionedDelegate<T>;
  const data = { ...args.data, version: { increment: 1 } };

  const where: { id: string; version?: number; isDraft?: boolean; isSent?: boolean } = {
    id: args.id,
  };
  if (args.expectedVersion !== undefined) {
    where.version = args.expectedVersion;
  }
  if (args.requireUnsent) {
    where.isDraft = true;
    where.isSent = false;
  }

  const res = await delegate.updateMany({ where, data });
  if (res.count === 0) {
    const current = await delegate.findUnique({ where: { id: args.id } });
    if (!current) notFound(args);
    if (args.requireUnsent) {
      const state = current as { isDraft?: unknown; isSent?: unknown };
      if (state.isSent === true || state.isDraft === false) {
        // fix/qm-send-transmit-before-flip: the flip already committed on an
        // earlier attempt (crash between flip and transmit, or a retry past
        // the idempotency claim TTL). 409 here — never re-transmit.
        throw createAppError(
          'This email was already sent — it will not be sent again',
          409,
          'EMAIL_ALREADY_SENT',
        );
      }
    }
    const currentVersion = (current as { version?: unknown }).version;
    throw versionConflictError(
      args.resource,
      args.id,
      args.expectedVersion ?? -1,
      typeof currentVersion === 'number' ? currentVersion : -1,
    );
  }
  const row = await delegate.findUnique({ where: { id: args.id } });
  // count > 0 guarantees the row exists; this is a type-narrowing guard.
  if (!row) notFound(args);
  return row;
}
