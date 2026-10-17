/**
 * fix/qm-commit-existing-branch-check: honest interpretation of the
 * branch-create step inside handleCommitBlob (commit-to-new-branch flow).
 *
 * Root cause: the POST /:id/branches response was never inspected —
 * apiFetch/authenticatedFetch returns the Response without throwing on HTTP
 * errors, and the try/catch only covered transport failures. So a 409
 * BRANCH_EXISTS (the requested branch name was already taken) was silently
 * swallowed, and the follow-up file commit proceeded onto the PRE-EXISTING
 * branch — while the UI promised "Create a new branch for this commit and
 * start a pull request".
 *
 * Contract: resolves when the branch was created (non-409). Throws
 * BranchExistsError on a 409 so the caller can STOP before the file commit
 * runs — never commit to a branch this flow did not create. Transport
 * failures (network error, timeout) propagate untouched so the caller can
 * keep its honest offline-fallback behavior.
 */

/** Thrown when the branch-create POST answers 409 — the name is taken. */
export class BranchExistsError extends Error {
  readonly branchName: string;

  constructor(branchName: string, detail?: string) {
    super(
      `Branch "${branchName}" already exists — pick a different name. No commit was made.` +
        (detail ? ` (${detail})` : ''),
    );
    this.name = 'BranchExistsError';
    this.branchName = branchName;
  }
}

/**
 * Interprets the result of the branch-create POST. `createBranch` performs
 * the POST and returns the raw Response; it MUST propagate network errors.
 *
 * - 2xx → the branch was created: resolve.
 * - 409 → the name (or branch state) conflicts: throw BranchExistsError.
 *   The backend answers 409 with `error.code: 'BRANCH_EXISTS'`; a bare 409
 *   (unparseable body) or an unexpected 409 code is treated as a conflict
 *   too — stopping is safer than silently committing onto a branch this
 *   flow did not create.
 * - any other non-409 status → resolve, same as the old fire-and-forget
 *   behavior (the follow-up file commit carries its own honest errors).
 */
export async function assertBranchCreated(
  createBranch: () => Promise<Response>,
  branchName: string,
): Promise<void> {
  const res = await createBranch();
  if (res.status !== 409) return;
  const body: unknown = await res.json().catch(() => null);
  const errorObj =
    body !== null && typeof body === 'object' && 'error' in body
      ? (body as { error?: { code?: unknown } | null }).error
      : null;
  const code = typeof errorObj?.code === 'string' ? errorObj.code : undefined;
  if (!code || code === 'BRANCH_EXISTS') {
    throw new BranchExistsError(branchName);
  }
  throw new BranchExistsError(branchName, `server returned 409 ${code}`);
}
