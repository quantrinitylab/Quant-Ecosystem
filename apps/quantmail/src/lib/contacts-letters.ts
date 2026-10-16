import type { LetterGroup } from '../types';

/**
 * Pure helpers for the contacts A–Z index's honest counts.
 *
 * The page used to render `{letter} ({group.contacts.length})` from the
 * paginated list page, so a header reading "A (7)" on page 2 of 5 counted only
 * page 2's A-contacts while reading as a total. `GET /contacts/letters`
 * aggregates the true per-letter totals server-side across ALL matching
 * contacts; these helpers decide what the headers and the sidebar index show.
 */

/**
 * What the sidebar index renders: the server totals when they have loaded
 * (the true shape of the address book — letters whose contacts all sit on
 * other pages appear again), otherwise the page's own groups (loading, or the
 * contact-group view whose client-side group filter the endpoint does not
 * honour).
 */
export function buildLetterIndexGroups(
  pageGroups: LetterGroup[],
  serverGroups: LetterGroup[] | undefined,
): LetterGroup[] {
  return serverGroups ?? pageGroups;
}

/**
 * The number the sticky section header shows for one letter.
 *
 * - Server totals loaded → the TRUE total for the letter. The header's
 *   sections still render the current page's rows; the pager ("Page X of Y")
 *   already communicates that the stream is paged, exactly like it does for
 *   the overall contact total.
 * - Server totals enabled but still loading → `null`, and the header renders
 *   the bare letter. Showing the page count here, even briefly, would replay
 *   the original lie (a page count reading as a total).
 * - Server totals disabled (a contact group is selected — the group filter is
 *   applied client-side and the endpoint does not honour it) → the page's own
 *   count. The pagination note scopes the index to the page in that case.
 */
export function letterHeaderCount(
  letter: string,
  pageCount: number,
  serverTotals: Map<string, number> | null,
  totalsEnabled: boolean,
): number | null {
  if (!totalsEnabled) return pageCount;
  if (!serverTotals) return null;
  return serverTotals.get(letter) ?? pageCount;
}

/** Index the server's letter groups for O(1) header lookups. */
export function indexLetterTotals(groups: LetterGroup[] | undefined): Map<string, number> | null {
  if (!groups) return null;
  return new Map(groups.map((g) => [g.letter, g.count]));
}
