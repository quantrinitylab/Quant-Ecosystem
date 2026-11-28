import { findConversation, type ConversationThread } from './threading';

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
 * CUST-P1-4 — classic-inbox URL for the `x` (select) shortcut fired from a
 * thread view (/thread/[id], /people/[personId]). RootPage renders PeopleHome
 * unless `?view=inbox` is present, and `?selected=` is only consumed inside
 * InboxPageContent — a bare `/?selected=<id>` lands on PeopleHome where the
 * param is silently dropped and the row never pre-selects. `view=inbox` is
 * load-bearing here, not cosmetic.
 *
 * Lens carry (spam-lens-select-lens P1): the inbox pre-selects only rows in
 * the current lens corpus (isChecked={selectedIds.has(thread.id)} on the
 * rendered rows), so a thread that lives in a non-default lens must have that
 * lens carried as `?lens=` — the inbox understands it via normalizeLensParam
 * (app/page.tsx). Without it, `x` from a `?lens=spam` person thread lands in
 * the inbox with no row selected and the thread context silently dropped —
 * the same lens-loss class as the fixed spam-lens dead-end #917. `all` and
 * falsy lenses are dropped so the default target stays bare.
 */
export function inboxSelectTarget(threadId: string, lens?: string): string {
  const lensPart = lens && lens !== 'all' ? `&lens=${encodeURIComponent(lens)}` : '';
  return `/?view=inbox${lensPart}&selected=${encodeURIComponent(threadId)}`;
}

/**
 * CUST-P1-4 follow-up (x-shortcut-preselect P2): resolve an incoming
 * `?selected=` value to the inbox row it names.
 *
 * Rows check `selectedIds.has(thread.id)`, and a row's `id` is its newest
 * message's id — so the value the `x` shortcut carries is a row id only by
 * accident. The people view sends `lastMessage.threadId || lastMessage.id`:
 * a server thread id matches no row id, and a legacy fallback message id
 * matches only when it happens to be the newest message of its row. Either
 * way the old `setSelectedIds(new Set([selected]))` landed the user on the
 * inbox with zero rows checked, silently.
 *
 * `findConversation` already resolves every id a caller might hold — a
 * row's own id, any message id inside it, a row's threadId, any message's
 * threadId — against the same grouping the rows came from, so this returns
 * the row itself and the call site selects `row.id`. That is deliberately
 * NOT `conversationIds` (page.tsx): that mapper answers the opposite
 * question, row -> every message id it stands for, for bulk actions. Stuffing
 * its output into `selectedIds` would check the row but also inflate the
 * selection count to the message count and break shift-click anchoring, which
 * both assume `selectedIds` holds row ids.
 *
 * Pools are tried in folder order (inbox, archived, spam, snoozed — the
 * `conversationIds` order plus snoozed, which `x` can also arrive from via
 * a lens-carrying thread view). Returns null when no pool names the id, so
 * the call site can tell "not loaded yet" apart from "not here": it waits
 * while a folder query is still loading and only then falls back to the raw
 * value, preserving today's behaviour for ids outside these pools.
 */
export function findPreselectThread(
  selected: string | null | undefined,
  pools: ReadonlyArray<readonly ConversationThread[] | null | undefined>,
): ConversationThread | null {
  if (!selected) return null;
  for (const pool of pools) {
    // Copy: `findConversation` takes a mutable array, and pools arrive as
    // readonly memoised lists — it never mutates, so a shallow copy is safe.
    const found = findConversation([...(pool ?? [])], selected);
    if (found) return found;
  }
  return null;
}

/**
 * Thread-page `x` (select) lens carry (thread-lens-select P1).
 *
 * /thread/[id] is opened with `returnTo` encoding the source path — including
 * `?lens=` when the thread came from a lens view (app/page.tsx builds
 * `/thread/<id>?returnTo=<encoded currentPath>` and that currentPath carries
 * `?view=inbox&lens=<spam|groups|contacts...>`; ConversationalThreadView's
 * pane variant does the same when opening the full thread page). The `x`
 * shortcut must carry that lens into inboxSelectTarget so the inbox
 * pre-selects the row in the right corpus; without it, `x` from a
 * `?lens=spam` thread lands in the default all-lens inbox where the
 * spam-only threadId has no row and the pre-select silently no-ops — the same
 * lens-loss class as the fixed spam-lens dead-end #917 and the people-page
 * sibling fixed via inboxSelectTarget's lens param. Returns the raw lens
 * value, or undefined when there is none; pass the result straight to
 * inboxSelectTarget, which drops `all` and falsy values. Never throws.
 */
export function lensFromReturnTo(returnTo: string | null): string | undefined {
  if (!returnTo) return undefined;
  try {
    return new URL(returnTo, 'https://quantmail.in').searchParams.get('lens') || undefined;
  } catch {
    return undefined;
  }
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
