/**
 * U3.3 — pure derivation for the removable applied-filter pills that
 * replace the U3.2 single chip beside the Filter trigger in
 * `apps/quantmail/src/app/page.tsx`.
 *
 * This module follows the U3.1/U3.2 precedent (`inbox-lens.ts`,
 * `filter-chip.ts`): the page delegates to these helpers, and the
 * tests pin the helpers without mounting the 4800-line page
 * component. The helpers are pure and deliberately narrow:
 *
 * - One pill per active narrowing: the turn first (only when a turn
 *   narrowing is on), then each active filter in canonical order
 *   (the page's `INBOX_FILTERS` order: Pinned, then Has attachment),
 *   never `Set` insertion order, so the same state always renders
 *   the same pills regardless of the order filters were ticked in.
 * - A pill holds no state and filters nothing. It is a display of
 *   state the page already owns (`activeTurn`, `activeFilters`).
 *   Its X removes ONLY that narrowing (turn pill → turn back to
 *   `any`; filter pill → that filter unticked); it never clears
 *   anything else. The popover footer's "Clear N narrowing(s)"
 *   remains the clear-all path in U3.3.
 * - Search `q` is not an input to any function here, by
 *   construction: a search query can never leak into a pill label.
 *   The active lens is likewise not an input to the pill
 *   derivation: pills persist across lens changes because lens
 *   switches clear `q` only, not turn/filters. (The lens IS an
 *   input to the empty-view description only, where naming the
 *   current view is the whole point — see `describeEmptyView`.)
 * - Clear-all and the filtered-empty state below are
 *   QuantWorkplace's own honest applied-state design. They are NOT
 *   claimed as Outlook copies: no clear-all control and no
 *   filtered-view zero-match empty state were observed in the
 *   Mobbin Outlook captures (only an inbox-zero state was).
 *   `narrowingCount` is never recomputed here; the page owns it.
 */

/** The turn values the page's `InboxTurn` type carries. */
export type FilterPillTurn = 'any' | 'needs_you' | 'waiting';

/** The filter values the page's `InboxFilter` type carries. */
export type FilterPillFilter = 'starred' | 'attachment';

/** One applied narrowing, as the page renders it. */
export type FilterPill =
  | { kind: 'turn'; key: 'turn:needs_you' | 'turn:waiting'; label: string }
  | { kind: 'filter'; key: 'filter:starred' | 'filter:attachment'; label: string };

/** Canonical filter order, matching the page's `INBOX_FILTERS`. */
const FILTER_ORDER: FilterPillFilter[] = ['starred', 'attachment'];

const TURN_LABELS: Record<Exclude<FilterPillTurn, 'any'>, string> = {
  needs_you: 'Your turn',
  waiting: 'Their turn',
};

const FILTER_LABELS: Record<FilterPillFilter, string> = {
  starred: 'Pinned',
  attachment: 'Has attachment',
};

/**
 * The pill list, in display order: the turn pill first (only when a
 * turn narrowing is on), then each active filter in canonical order.
 * Returns `[]` when nothing is narrowing, which is also the hidden
 * state — callers should not render a pill row from an empty list.
 */
export function deriveFilterPills(
  turn: FilterPillTurn,
  filters: ReadonlySet<FilterPillFilter> | readonly FilterPillFilter[],
): FilterPill[] {
  const pills: FilterPill[] = [];
  if (turn !== 'any') {
    pills.push({ kind: 'turn', key: `turn:${turn}`, label: TURN_LABELS[turn] });
  }
  const active = filters instanceof Set ? filters : new Set(filters);
  for (const key of FILTER_ORDER) {
    if (active.has(key)) {
      pills.push({ kind: 'filter', key: `filter:${key}`, label: FILTER_LABELS[key] });
    }
  }
  return pills;
}

/** Visible exactly when at least one pill exists. */
export function areFilterPillsVisible(pills: readonly FilterPill[]): boolean {
  return pills.length > 0;
}

/**
 * The state after removing exactly one pill — and nothing else.
 * The input set is never mutated: filter removal returns a fresh
 * `Set`. A turn pill resets the turn to `any`; a filter pill drops
 * that filter only; an unknown pill leaves the state unchanged.
 * Callers apply the returned pair with the page's existing setters.
 */
export function removeFilterPill(
  turn: FilterPillTurn,
  filters: ReadonlySet<FilterPillFilter>,
  pill: FilterPill,
): { turn: FilterPillTurn; filters: Set<FilterPillFilter> } {
  if (pill.kind === 'turn') {
    return { turn: 'any', filters: new Set(filters) };
  }
  const next = new Set(filters);
  next.delete(pill.key.replace('filter:', '') as FilterPillFilter);
  return { turn, filters: next };
}

/**
 * The filtered-empty state's honest description: it names the active
 * view so a zero-match list is never mistaken for an empty inbox.
 *
 * - With a search query (the page's search-empty branch names the
 *   query itself; this helper covers the same wording for tests and
 *   for any caller that renders the combined state): the query is
 *   named first, then the pills, then a non-All lens.
 * - Without a search: the lens is named, then the pills.
 * - With neither pills nor a non-All lens, it says so plainly
 *   rather than inventing a reason.
 *
 * The helper never claims a count and never names a filter that is
 * not in `pillLabels`: the page passes exactly the pills it renders.
 */
export function describeEmptyView(input: {
  lensLabel: string;
  pillLabels: readonly string[];
  searchQuery?: string;
}): string {
  const { lensLabel, pillLabels, searchQuery } = input;
  const query = (searchQuery ?? '').trim();
  const lens = lensLabel.trim();
  if (query) {
    let out = `No messages match search "${query}"`;
    if (pillLabels.length > 0) out += ` with ${joinLabels(pillLabels)}`;
    if (lens !== '' && lens !== 'All') out += ` in ${lens}`;
    return `${out}.`;
  }
  if (pillLabels.length > 0) {
    return `No conversation in ${lens !== '' ? lens : 'this view'} matches ${joinLabels(pillLabels)}.`;
  }
  if (lens !== '' && lens !== 'All') {
    return `Nothing in ${lens} yet.`;
  }
  return 'Nothing here yet.';
}

function joinLabels(labels: readonly string[]): string {
  if (labels.length === 1) return labels[0] as string;
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`;
}
