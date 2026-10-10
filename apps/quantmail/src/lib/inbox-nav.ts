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
