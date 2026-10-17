/**
 * fix/qm-blob-editor-parent-sha: the blob editor's optimistic-concurrency token.
 *
 * The backend `parentSha` MUST be the commit SHA the file was read at (the
 * branch HEAD at load time, resolved server-side as `headSha`). Three shapes
 * that all made blob-editor commits fail:
 * - the raw ref string ("main") as parentSha → 400 "parentSha must be a 40-char SHA"
 * - the blob (file-content) hash as parentSha → 409 STALE_PARENT_SHA (a blob
 *   hash never equals the branch head)
 * - '' → parentSha null → 409 STALE_PARENT_SHA on any non-empty branch
 *
 * These helpers keep the mapping in one place so the contract cannot drift
 * back to `payload.data.sha` (the raw ref) or the tree's blob hash.
 */

/** Head SHA from a successful GET /:id/file payload. Never the raw ref. */
export function headShaFromBlobPayload(payload: unknown): string {
  const data = (payload as { data?: { headSha?: unknown } } | null)?.data;
  return typeof data?.headSha === 'string' ? data.headSha : '';
}

/**
 * Head SHA from a failed GET /:id/file payload. The backend's 404
 * FILE_NOT_FOUND carries the resolved head in `error.details.headSha` so
 * creating a NEW file on a non-empty branch can still send a valid
 * parentSha.
 */
export function headShaFromBlobError(payload: unknown): string {
  const details = (payload as { error?: { details?: { headSha?: unknown } } } | null)?.error
    ?.details;
  return typeof details?.headSha === 'string' ? details.headSha : '';
}

/**
 * Maps the editor's captured head SHA to the `parentSha` request field.
 * Empty/unknown → null, which the backend accepts only for unborn (empty)
 * branches — an honest 409 otherwise, never a silent misuse.
 */
export function toParentShaParam(expectedHeadSha: string | null | undefined): string | null {
  return expectedHeadSha || null;
}

/**
 * fix/qm-quantgit-commit-new-branch: the base commit a "commit to new
 * branch" flow creates the branch at.
 *
 * The follow-up file commit sends parentSha = expectedHeadSha (the commit
 * the file was read at — the browsed historical commit in browse-at-old-
 * commit mode, or the current branch head in the inline editor). The new
 * branch MUST therefore be created AT expectedHeadSha. The old code created
 * it at selectedRepo.latestCommitSha, so the backend's strict
 * expectedHeadSha !== currentHeadSha check 409'd (STALE_PARENT_SHA) every
 * commit-to-new-branch whose read-time head differed from the repo's latest
 * commit (old-commit browsing, non-default branches, stale repo list).
 * Falls back to latestCommitSha only when the read-time head is unknown,
 * preserving the old behavior for that path.
 */
export function newBranchBaseSha(
  expectedHeadSha: string | null | undefined,
  latestCommitSha: string | null | undefined,
): string | undefined {
  return expectedHeadSha || latestCommitSha || undefined;
}
