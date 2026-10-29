/**
 * U3.2 — pure derivation for the single active-filter chip beside the
 * Filter trigger in `apps/quantmail/src/app/page.tsx`.
 *
 * This module follows the U3.1 precedent (`inbox-lens.ts`): the page
 * delegates to these helpers, and the tests pin the helpers without
 * mounting the 4800-line page component. The helpers are pure and
 * deliberately narrow:
 *
 * - The chip holds no state and does not filter anything. It is a
 *   display of state the page already owns (`activeTurn`,
 *   `activeFilters`, `narrowingCount`), and activating it only opens
 *   the existing Filter popover. There is deliberately no clear action
 *   here: the popover footer's "Clear N narrowing(s)" remains the sole
 *   clear path in U3.2 (no per-narrowing chip clear).
 * - The label is derived SOLELY from `activeTurn` + `activeFilters`.
 *   Search `q` is not an input to any function here, by construction:
 *   a search query can never leak into the chip label. The active lens
 *   is likewise not an input: the chip persists across lens changes
 *   because lens switches clear search `q` only, not turn/filters.
 * - Filter order in the label is canonical (the page's
 *   `INBOX_FILTERS` order: Pinned, then Has attachment), never
 *   `Set` insertion order, so the same state always renders the same
 *   label regardless of the order filters were ticked in.
 * - `narrowingCount` is passed through, never recomputed here, so
 *   the chip count cannot drift from the trigger badge and the
 *   popover footer, which both read the same page value.
 */

/** The turn values the page's `InboxTurn` type carries. */
export type FilterChipTurn = 'any' | 'needs_you' | 'waiting';

/** The filter values the page's `InboxFilter` type carries. */
export type FilterChipFilter = 'starred' | 'attachment';

/** Canonical filter order, matching the page's `INBOX_FILTERS`. */
const FILTER_ORDER: FilterChipFilter[] = ['starred', 'attachment'];

const TURN_LABELS: Record<Exclude<FilterChipTurn, 'any'>, string> = {
  needs_you: 'Your turn',
  waiting: 'Their turn',
};

const FILTER_LABELS: Record<FilterChipFilter, string> = {
  starred: 'Pinned',
  attachment: 'Has attachment',
};

/**
 * The chip's label parts, in display order: the turn part first (only
 * when a turn narrowing is on), then each active filter in canonical
 * order. Returns `[]` when nothing is narrowing, which is also the
 * hidden state — callers should not render a chip from an empty list.
 */
export function filterChipLabelParts(
  turn: FilterChipTurn,
  filters: ReadonlySet<FilterChipFilter> | readonly FilterChipFilter[],
): string[] {
  const parts: string[] = [];
  if (turn !== 'any') parts.push(TURN_LABELS[turn]);
  const active = filters instanceof Set ? filters : new Set(filters);
  for (const key of FILTER_ORDER) {
    if (active.has(key)) parts.push(FILTER_LABELS[key]);
  }
  return parts;
}

/** The chip label: label parts joined with a middle dot, or `''`. */
export function filterChipLabel(
  turn: FilterChipTurn,
  filters: ReadonlySet<FilterChipFilter> | readonly FilterChipFilter[],
): string {
  return filterChipLabelParts(turn, filters).join(' · ');
}

/** Visible exactly when at least one narrowing is on. */
export function isFilterChipVisible(narrowingCount: number): boolean {
  return narrowingCount > 0;
}

/**
 * The whole chip derivation in one call: `null` when hidden, otherwise
 * the label and the passed-through count. The page renders exactly
 * this — it adds no label of its own — so the chip can never show a
 * count or a label the helpers did not derive.
 */
export function deriveFilterChip(
  turn: FilterChipTurn,
  filters: ReadonlySet<FilterChipFilter> | readonly FilterChipFilter[],
  narrowingCount: number,
): { label: string; count: number } | null {
  if (!isFilterChipVisible(narrowingCount)) return null;
  return { label: filterChipLabel(turn, filters), count: narrowingCount };
}
