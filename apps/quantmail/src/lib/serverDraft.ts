/**
 * Server draft identity + optimistic-concurrency guard for composer autosave.
 *
 * Finding qm-draft-conflict-tabs: every composer kept only a per-tab draft id
 * (`serverDraftIdRef`) and updated it with no version, so two tabs (or two
 * devices) silently overwrote each other's drafts, and every failed update —
 * including a 409 VERSION_CONFLICT — was treated as "draft gone", dropping
 * the id so the next save minted ANOTHER draft. Duplicates multiplied.
 *
 * This module is framework-free (mirroring the DraftAutosaveController
 * precedent): it owns the version tracking and the guarded save protocol, the
 * components own the React wiring. The backend already implements the guard —
 * PUT /emails/:id reads `expectedVersion` from the body and answers 409
 * VERSION_CONFLICT (with the fresh `currentVersion` in error.details) when the
 * row moved under the writer. The client just never sent it.
 *
 * Protocol:
 * - create once (POST), adopt the returned id + version;
 * - update with `expectedVersion` (PUT);
 * - on 409: report the conflict to the UI, adopt the fresh version the server
 *   sent back, and retry ONCE with it (last-writer-wins, with a notice);
 * - on 404: the draft was deleted/sent elsewhere — report it, drop the id,
 *   and let the next save honestly create a fresh draft instead of 404ing
 *   forever and silently multiplying drafts.
 */
export interface ServerDraftIdentity {
  id: string;
  /** The row version the last successful write observed. Absent when unknown. */
  version?: number;
}

/**
 * Tracks which server draft this composer instance is saving to, plus the
 * version to send as `expectedVersion`. Kept in a ref; mutated imperatively
 * by the save path so the autosave timer always reads the latest.
 */
export class ServerDraftRef {
  private id: string | null = null;
  private version: number | null = null;

  /** Adopt a draft created (or claimed) elsewhere — same id, shared version. */
  adopt(id: string, version?: number | null): void {
    this.id = id;
    this.version = typeof version === 'number' ? version : null;
  }

  /** Record the version the server reported after a successful write. */
  noteSaved(version?: number | null): void {
    if (typeof version === 'number') this.version = version;
  }

  clear(): void {
    this.id = null;
    this.version = null;
  }

  getId(): string | null {
    return this.id;
  }

  /** The version to send as `expectedVersion`; undefined when unknown. */
  getExpectedVersion(): number | undefined {
    return this.version ?? undefined;
  }
}

/**
 * The minimal API response shape this module reads. Deliberately structural —
 * the real ApiResponse is a superset, and tests can pass plain objects.
 */
export interface GuardedApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    statusCode: number;
    details?: { currentVersion?: unknown } & Record<string, unknown>;
  };
}

/** True when the server rejected the write because another writer moved first. */
export function isVersionConflict(res: GuardedApiResponse<unknown>): boolean {
  return !res.success && res.error?.code === 'VERSION_CONFLICT';
}

/** True when the draft no longer exists server-side (deleted/sent elsewhere). */
export function isDraftGone(res: GuardedApiResponse<unknown>): boolean {
  return (
    !res.success &&
    (res.error?.code === 'EMAIL_NOT_FOUND' || res.error?.statusCode === 404)
  );
}

/**
 * The fresh version the 409 response carries in error.details. The backend's
 * versionConflictError always includes it; undefined means the client must
 * re-read the row (or surface the conflict as an honest save failure).
 */
export function conflictCurrentVersion(
  res: GuardedApiResponse<unknown>,
): number | undefined {
  const v = res.error?.details?.currentVersion;
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : undefined;
}

export interface GuardedSaveDeps {
  ref: ServerDraftRef;
  /** POST /emails/compose — mint the server draft once. */
  create: () => Promise<GuardedApiResponse<{ id: string; version?: number }>>;
  /**
   * PUT /emails/:id — must forward expectedVersion. Called with the ref's
   * current version, and again with the fresh version after a 409 retry.
   */
  update: (
    id: string,
    expectedVersion: number | undefined,
  ) => Promise<GuardedApiResponse<{ id: string; version?: number }>>;
  /**
   * Re-read the draft's current version (GET /emails/:id). Used only when a
   * 409 arrived WITHOUT the fresh version in its details — a fallback, not
   * the normal path.
   */
  rereadVersion?: (id: string) => Promise<number | undefined>;
  /** Another tab/device saved first. The UI should say so (last-writer-wins). */
  onConflict?: () => void;
  /** The draft was deleted or sent elsewhere. The UI should say so. */
  onDeleted?: () => void;
}

/**
 * Perform one guarded save. Returns true when the bytes are on the server.
 *
 * - No id yet → create, adopt id+version.
 * - Update with the tracked version.
 * - 409 → onConflict, adopt the fresh version, retry once (last-writer-wins).
 *   If the 409 carried no fresh version, rereadVersion is tried once; with no
 *   version at all the save honestly fails (no unguarded blind overwrite).
 * - 404 → onDeleted, clear the id so the next save mints exactly one fresh
 *   draft instead of 404ing forever.
 */
export async function saveServerDraft(deps: GuardedSaveDeps): Promise<boolean> {
  const { ref, create, update, rereadVersion, onConflict, onDeleted } = deps;

  const existingId = ref.getId();
  if (!existingId) {
    const res = await create();
    if (!res.success || !res.data?.id) return false;
    ref.adopt(res.data.id, res.data.version ?? null);
    return true;
  }

  const id = existingId;
  const expectedVersion = ref.getExpectedVersion();
  const res = await update(id, expectedVersion);
  if (res.success) {
    ref.noteSaved(res.data?.version);
    return true;
  }

  if (isVersionConflict(res)) {
    onConflict?.();
    let fresh = conflictCurrentVersion(res);
    if (fresh === undefined && rereadVersion) {
      try {
        fresh = await rereadVersion(id);
      } catch {
        fresh = undefined;
      }
    }
    if (fresh === undefined) {
      // No trustworthy version to write against — fail honestly rather than
      // overwrite blindly. The next content change retries with a notice.
      return false;
    }
    ref.adopt(id, fresh);
    const retry = await update(id, fresh);
    if (retry.success) {
      ref.noteSaved(retry.data?.version);
      return true;
    }
    if (isDraftGone(retry)) {
      onDeleted?.();
      ref.clear();
    }
    // A second 409 means another writer beat the retry too — surface it as a
    // failed save (the indicator says "Couldn't save") rather than looping.
    return false;
  }

  if (isDraftGone(res)) {
    onDeleted?.();
    ref.clear();
    return false;
  }

  return false;
}
