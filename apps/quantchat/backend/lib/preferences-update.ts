// ============================================================================
// QuantChat - Atomic User.preferences updates (QC-F-371)
//
// `User.preferences` is a single JSON column written by four independent
// read-modify-write cycles:
//   - settings PUT /            (routes/settings.ts)
//   - settings POST /blocked    (routes/settings.ts, QC-F-317)
//   - settings DELETE /blocked  (routes/settings.ts)
//   - AutoReplyService.setEnabled (services/auto-reply.service.ts)
//
// Pre-fix each writer read the whole snapshot with findUnique, mutated it
// in memory, and wrote the whole snapshot back with an unconditional
// user.update — no transaction, no version guard. Two overlapping writes
// raced: whichever committed LAST silently overwrote the other's change,
// and the lost change was usually a safety record (a block or a privacy
// tightening), with both requests answering success. Block enforcement
// reads fresh preferences, so a block erased from the column meant the
// user was un-blocked everywhere with no trace anywhere.
//
// This helper is the single write path for the column. Every mutation
// runs inside a Serializable interactive transaction: the row is re-read
// INSIDE the transaction, the caller's pure mutation is applied to that
// fresh snapshot, and the result is written back in the same transaction.
// Serializable isolation makes the second writer's transaction fail with
// P2034 instead of silently clobbering the first; the helper retries a
// bounded number of times, re-reading fresh state on every attempt, so
// both changes land. There is no non-transactional fallback: the real
// PrismaClient always provides $transaction, and a silent downgrade to
// the old racy behaviour would reintroduce exactly this defect.
// ============================================================================

/** Transaction-scoped client surface the mutation callback may use. */
export interface PreferencesTxClient {
  user: {
    findUnique: (args: {
      where: { id: string };
      select: Record<string, true>;
    }) => Promise<{ preferences?: unknown; [key: string]: unknown } | null>;
    update: (args: {
      where: { id: string };
      data: { preferences: unknown };
    }) => Promise<unknown>;
  };
}

/** Full store surface: the tx client plus interactive transactions. */
export interface PreferencesStore extends PreferencesTxClient {
  $transaction: <T>(
    fn: (tx: PreferencesTxClient) => Promise<T>,
    options?: { isolationLevel?: string },
  ) => Promise<T>;
}

/**
 * What a mutation returns: the full replacement preferences object to
 * persist (or `null` for an idempotent no-op that must not write), plus
 * the caller-facing result derived from the FRESH snapshot.
 */
export interface PreferencesMutation<TResult> {
  nextPreferences: unknown;
  result: TResult;
}

/** Total attempts (1 initial + retries) for a write-conflicted update. */
export const PREFERENCES_UPDATE_MAX_ATTEMPTS = 3;

/** Prisma P2034: transaction write conflict / deadlock (safe to retry). */
export function isTransactionWriteConflict(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code: unknown }).code === 'P2034'
  );
}

/**
 * Atomically update one user's preferences.
 *
 * Returns the mutation's `result`, or `null` when the user row does not
 * exist (callers map that to their existing 404). Errors thrown by the
 * mutation (e.g. QC-F-317's fail-closed 503 on a malformed blocked list)
 * propagate unchanged and roll the transaction back — nothing is written.
 * A mutation returning `nextPreferences: null` commits no write.
 */
export async function updateUserPreferences<TResult>(
  store: PreferencesStore,
  userId: string,
  mutate: (
    tx: PreferencesTxClient,
    currentPreferences: unknown,
  ) => Promise<PreferencesMutation<TResult>> | PreferencesMutation<TResult>,
): Promise<TResult | null> {
  for (let attempt = 1; attempt <= PREFERENCES_UPDATE_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await store.$transaction(
        async (tx) => {
          const row = await tx.user.findUnique({
            where: { id: userId },
            select: { preferences: true },
          });
          if (!row) return null;
          const { nextPreferences, result } = await mutate(tx, row.preferences);
          if (nextPreferences !== null) {
            await tx.user.update({
              where: { id: userId },
              data: { preferences: nextPreferences },
            });
          }
          return result;
        },
        { isolationLevel: 'Serializable' },
      );
    } catch (error) {
      if (
        attempt < PREFERENCES_UPDATE_MAX_ATTEMPTS &&
        isTransactionWriteConflict(error)
      ) {
        continue;
      }
      throw error;
    }
  }
  // Unreachable: the loop either returns a value or throws.
  throw new Error('updateUserPreferences: unreachable state');
}
