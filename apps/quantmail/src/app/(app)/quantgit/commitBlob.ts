// fix/qm-commitblob-false-success — honest file-commit validation.
//
// handleCommitBlob used to swallow network failures (TypeError "Failed to
// fetch") and 404s via message-substring matching in its catch, then fell
// through to showToast(`Committed ${path}`) + closeBlobEditor(): the user
// was told the commit landed and their draft was discarded while nothing
// was committed.
//
// Contract:
// - assertCommitResponse validates the POST/PATCH/DELETE /api/repos/:id/file
//   response and returns the payload ONLY when the backend confirmed the
//   commit ({ success: true }). Every unconfirmed state throws an honest,
//   user-facing Error.
// - toCommitFailure converts transport-level failures (fetch rejection)
//   into honest user-facing Errors instead of the raw "Failed to fetch".
//   Everything else passes through untouched.

/**
 * Validate the file-commit response. Throws an honest Error for every
 * state where the commit is NOT confirmed; returns the payload only on a
 * confirmed commit. Callers must treat a throw as "nothing was committed"
 * and keep the blob editor open with its content intact.
 */
export function assertCommitResponse(response: Response, payload: any): any {
  if (response.ok && payload?.success) {
    return payload;
  }

  if (response.status === 409 || payload?.error?.code === 'STALE_BLOB') {
    throw new Error('This file changed on the server. Reload it before committing.');
  }

  if (response.status === 404) {
    // A 404 on the file endpoint means the commit target does not exist —
    // nothing was committed. Never fall through to a "Committed" toast.
    throw new Error(
      'Commit failed: the repository file endpoint was not found (404). ' +
        'Your changes are still in the editor — nothing was committed.',
    );
  }

  if (payload?.error?.message) {
    throw new Error(payload.error.message);
  }

  // Fail closed: non-OK without a server message, or OK with an
  // unparseable/unconfirmed body, must never read as success.
  throw new Error(
    response.ok
      ? 'The server did not confirm the commit. ' +
          'Your changes are still in the editor — nothing was committed.'
      : `Commit failed (HTTP ${response.status}). ` +
          'Your changes are still in the editor — nothing was committed.',
  );
}

/**
 * Convert a commit-request failure into an honest user-facing Error.
 * Transport failures (offline/timeout: "Failed to fetch") become plain
 * language; every other error — including ones whose message happens to
 * contain "404" — propagates untouched (never swallowed).
 */
export function toCommitFailure(err: unknown): Error {
  if (err instanceof Error) {
    if (err.message.includes('Failed to fetch')) {
      return new Error(
        'Could not reach the server — check your connection and try again. ' +
          'Your changes are still in the editor; nothing was committed.',
      );
    }
    return err;
  }
  return new Error(
    'The commit could not be confirmed. ' +
      'Your changes are still in the editor — nothing was committed.',
  );
}
