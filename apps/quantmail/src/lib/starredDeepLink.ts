/**
 * Reconciles the `?filter=starred` deep-link param with the classic inbox's
 * Pinned filter chip.
 *
 * The chip is ALSO user-toggleable (the "Narrow this view" checkboxes), so the
 * "clear" decision must only fire when the deep link was the one that applied
 * it — a blanket clear on param-absence would wipe a hand-picked filter on any
 * unrelated param change (e.g. switching lens tabs).
 *
 * Decisions:
 * - `apply` — the URL says ?filter=starred: turn the Pinned chip on.
 * - `clear` — the URL no longer says it, but the deep link turned it on:
 *   turn it back off so the Pinned filter does not stick after leaving
 *   /?view=inbox&filter=starred for a plain /?view=inbox.
 * - `keep`  — neither: leave the chip (possibly user-set) alone.
 */
export type StarredFilterReconcileDecision = 'apply' | 'clear' | 'keep';

export function reconcileStarredFilterParam(
  filterParam: string | null,
  deepLinkApplied: boolean,
): StarredFilterReconcileDecision {
  if (filterParam === 'starred') return 'apply';
  if (deepLinkApplied) return 'clear';
  return 'keep';
}
