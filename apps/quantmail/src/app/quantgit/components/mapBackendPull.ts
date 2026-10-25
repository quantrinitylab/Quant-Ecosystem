import type { PRItem } from '../types';

/**
 * Map one raw backend PR list row to the UI's PRItem shape.
 *
 * Review-requirement verdict honesty (qm-review-required-chip, CODEX
 * fail-closed contract): the verdict is TRUE | FALSE | NULL end-to-end,
 * where NULL means UNKNOWN — a verdict source was unreadable on the
 * backend, or the payload predates the verdict field. Only a real boolean
 * survives this pass-through; null/undefined/anything else becomes null
 * (unknown). It must NEVER collapse into false: false asserts "no review
 * required" while null asserts "could not determine", and the row chip
 * renders only on an exact `true`. The previous mapping
 * (`item.reviewRequired === true`) silently rewrote unknown as false and
 * destroyed the distinction the backend now preserves.
 *
 * The sibling pass-throughs follow the same honesty rule: null diff stats
 * stay null (never invented zeros), unrecognized checksStatus normalizes
 * to 'unknown', and a null comment count stays null (never an invented 0).
 */
export function mapBackendPullToPRItem(item: any): PRItem {
  return {
    id: item.number || item.id,
    title: item.title,
    state:
      item.status === 'merged' ? 'merged' : item.status === 'closed' ? 'closed' : 'open',
    author: item.author || 'user',
    branchSource: item.branchSource || 'main',
    branchTarget: item.branchTarget || 'main',
    // checksStatus honesty (#1071): normalize unrecognized values to 'unknown'
    // so an untyped leak never reaches the PR detail modal's CI cell.
    checksStatus: (['passing', 'pending', 'failing', 'unknown'] as string[]).includes(
      item.checksStatus,
    )
      ? item.checksStatus
      : 'unknown',
    // Pass through honestly: null (unknown) stays null, never becomes an invented 0.
    commentsCount: item.commentsCount ?? null,
    // Review-requirement verdict: only a real boolean survives; anything
    // else is unknown (null) — never rewritten to false.
    reviewRequired: typeof item.reviewRequired === 'boolean' ? item.reviewRequired : null,
    createdAt: item.createdAt || 'recently',
    body: item.body || '',
    // Diff stats: pass through honestly — the list endpoint reports
    // null (unknown) and must never become invented +12/-2 counts.
    additions: item.additions ?? undefined,
    deletions: item.deletions ?? undefined,
    changedFiles: item.changedFiles ?? undefined,
  };
}
