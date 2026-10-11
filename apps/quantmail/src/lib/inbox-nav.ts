/**
 * CUST-P1-6 — classic-inbox navigation targets.
 *
 * The inbox treats the URL as the source of truth for the view (`view`,
 * `lens`) and the search (`q`). A lens switch — or a full view reset — starts
 * a new query context: its navigation target never carries `q`, and the search
 * state (`searchQuery` + `debouncedQuery`) is cleared alongside, in
 * `selectLens` / `resetInboxView` (`app/page.tsx`). These helpers are the pure,
 * unit-tested core of that contract: a stale `q` left in a target would
 * re-seed the searchbox on the next navigation while the panel shows the new
 * lens — URL, searchbox and panel desynced.
 */

/**
 * Classic-inbox URL for a lens switch. Never carries `q` — the search state is
 * cleared alongside the navigation (see `selectLens`).
 */
export function inboxLensTarget(lens: string): string {
  return lens === 'all' ? '/?view=inbox' : `/?view=inbox&lens=${lens}`;
}

/**
 * Classic-inbox URL for a full view reset ("Show all conversations"). Never
 * carries `q` — the search state is cleared alongside (see `resetInboxView`).
 */
export function inboxResetTarget(): string {
  return '/?view=inbox';
}

/**
 * Apply the `q` contract to a URL: a non-empty query sets `q`, an empty query
 * drops it, everything else is preserved.
 *
 * Returns the relative target for `router.replace`, or `null` when the URL
 * already matches and no navigation is needed. `href` must be absolute (the
 * call site passes `window.location.href`).
 */
export function syncSearchParam(href: string, query: string): string | null {
  const url = new URL(href);
  const current = url.searchParams.get('q') ?? '';
  const next = query.trim();
  if (current === next) return null;
  if (next) url.searchParams.set('q', next);
  else url.searchParams.delete('q');
  return url.pathname + url.search;
}

/**
 * SIA-P2-6 — the search-folder scope (`sf`).
 *
 * Search answers from the whole mailbox by default; the chip next to the
 * results lets the user narrow back to one folder. `sf` is the URL half of
 * that chip: it is only ever meaningful while a query is active, so narrowing
 * sets it and "All mail" (or no query) drops it. Same replace-not-push
 * contract as `syncSearchParam` above, and the same unit-test pinning.
 */
export type SearchFolderScope = 'all' | 'inbox' | 'archive' | 'spam' | 'snoozed';

export const SEARCH_FOLDER_OPTIONS: Array<{ key: SearchFolderScope; label: string }> = [
  { key: 'all', label: 'All mail' },
  { key: 'inbox', label: 'Inbox' },
  { key: 'archive', label: 'Archive' },
  { key: 'spam', label: 'Spam' },
  { key: 'snoozed', label: 'Snoozed' },
];

/** Unknown `sf` values degrade to "All mail" rather than a broken chip. */
export function normalizeSearchFolderParam(value: string | null): SearchFolderScope {
  return SEARCH_FOLDER_OPTIONS.some((option) => option.key === value)
    ? (value as SearchFolderScope)
    : 'all';
}

/**
 * Apply the `sf` contract to a URL: a narrowed scope sets `sf`, "All mail"
 * drops it, everything else is preserved.
 *
 * Returns the relative target for `router.replace`, or `null` when the URL
 * already matches and no navigation is needed. `href` must be absolute (the
 * call site passes `window.location.href`).
 */
export function syncSearchFolderParam(href: string, folder: SearchFolderScope): string | null {
  const url = new URL(href);
  const current = url.searchParams.get('sf') ?? '';
  const next = folder === 'all' ? '' : folder;
  if (current === next) return null;
  if (next) url.searchParams.set('sf', next);
  else url.searchParams.delete('sf');
  return url.pathname + url.search;
}
