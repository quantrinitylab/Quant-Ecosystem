/**
 * QuantGit merge outcome interpretation.
 *
 * Keeps the PR surface honest: a merge is reported as successful ONLY when the
 * backend responds 2xx. On any non-ok response the backend's real error message
 * (if any) is surfaced, and the PR must stay open — never flip to 'merged' and
 * never show a success toast for a merge that did not happen.
 */

export type MergeOutcome = { merged: true } | { merged: false; toast: string };

/** Honest fallback when the backend gives no usable error detail. */
export function mergeFailureToast(prNumber: number): string {
  return `Could not merge pull request #${prNumber}. Please try again.`;
}

/**
 * Interpret a merge POST response. Returns { merged: true } only for a
 * genuinely successful (res.ok) response.
 */
export async function interpretMergeResult(res: Response, prNumber: number): Promise<MergeOutcome> {
  if (res.ok) return { merged: true };
  let detail = '';
  try {
    const errJson = (await res.json()) as unknown;
    const msg =
      errJson && typeof errJson === 'object'
        ? (errJson as { error?: { message?: unknown } }).error?.message
        : undefined;
    if (typeof msg === 'string' && msg.trim()) detail = msg.trim();
  } catch {
    // Fall through to the generic honest message below.
  }
  return { merged: false, toast: detail || mergeFailureToast(prNumber) };
}
