/**
 * U3.1 — pure inbox-lens helpers, extracted verbatim from
 * `apps/quantmail/src/app/page.tsx` (InboxPageContent) so the U3.1
 * regression tests can pin them without mounting the 4600-line page
 * component. This follows the repo's existing precedent (e.g.
 * `inbox-nav.ts` + `inbox-nav-selected-target.test.ts`): the page
 * delegates to these helpers, the tests pin the helpers.
 *
 * Behaviour is intentionally unchanged from the page: do not "improve"
 * these functions here — a behaviour change belongs in the page with
 * its own test, not in a silent edit to this module.
 */

/** Minimal shape a folder needs for lens/merge decisions. */
export interface LensFolderLike {
  id: string;
}

/**
 * Normalises a `lens` query param into the lens it selects. The top strip
 * (QuantPillarTopBar) spells two of its lenses differently from the
 * inbox's own vocabulary — `promos` for `promotions` — and adds
 * `important` and `teams`, which the inbox now understands. Anything
 * unrecognised selects `all` rather than stranding the list on a lens
 * that filters nothing.
 *
 * U3.1: a `folder_*` key is accepted syntactically here, without
 * checking it against the loaded folders — the normaliser runs before
 * the folder list exists (initial state and the sync effect both precede
 * the load), so validating here would bounce every folder deep link
 * against an empty list. Existence is reconciled after load by
 * `reconcileFolderLens` instead. `drafts` is deliberately NOT accepted:
 * the Drafts pill is gone and drafts live at /drafts, so a stale
 * `?lens=drafts` is redirected to the canonical All view by
 * `resolveLensSync`, not silently mapped.
 */
export function normalizeLensParam(p: string | null): string {
  if (typeof p === 'string' && p.startsWith('folder_')) return p;
  switch (p) {
    case 'primary':
    case 'unread':
    case 'important':
    case 'teams':
    case 'updates':
    case 'social':
    case 'promotions':
    case 'promos':
    case 'forums':
    case 'contacts':
    case 'groups':
    case 'snoozed':
    case 'spam':
      return p === 'promos' ? 'promotions' : p;
    default:
      return 'all';
  }
}

/**
 * The lens-sync effect's decision for a `lens` query param, mirroring
 * the page's sync effect exactly:
 * - `drafts` → lens `all` AND a clean replace to `/?view=inbox`
 *   (the caller performs the replace; this function only decides it).
 *   Only `drafts` gets this redirect; garbage lenses keep the
 *   default→all state mapping with the URL untouched.
 * - anything else → `normalizeLensParam(p)`, no redirect.
 */
export function resolveLensSync(p: string | null): {
  lens: string;
  redirectToAll: boolean;
} {
  if (p === 'drafts') return { lens: 'all', redirectToAll: true };
  return { lens: normalizeLensParam(p), redirectToAll: false };
}

/**
 * U3.1 F1 — merge in-flight optimistic folders into a loaded folder
 * list, exactly as the page's mount load effect does. Rows already in
 * the merged list are not duplicated. The function takes ONLY the
 * merged list and the in-flight rows: it never sees the localStorage
 * cache snapshot, so by construction it cannot resurrect a folder
 * deleted on another device — the failure mode a naive union with the
 * stale cache would have. The caller clears the in-flight ref after
 * the merge, as the page does.
 */
export function mergeInFlightFolders<T extends LensFolderLike>(
  merged: T[],
  inFlight: Iterable<T>,
): T[] {
  const next = [...merged];
  for (const folder of inFlight) {
    if (!next.some((f) => f.id === folder.id)) next.push(folder);
  }
  return next;
}

/**
 * U3.1 — post-load folder-lens reconciliation, mirroring the page's
 * folders-loaded effect. Returns `'reset'` only when all three hold:
 * the folder list has actually loaded, the active lens is a `folder_*`
 * lens, and no loaded folder carries that id (a deleted folder's deep
 * link, a stale saved state). In every other case — including
 * `foldersLoaded === false`, where the list may still be empty or a
 * stale cache — the lens is kept, so a valid folder deep link never
 * bounces against an unloaded list. The caller resets to All with a
 * clean replace to `/?view=inbox` on `'reset'`.
 */
export function reconcileFolderLens(
  activeLens: string,
  foldersLoaded: boolean,
  customFolders: LensFolderLike[],
): 'keep' | 'reset' {
  if (!foldersLoaded) return 'keep';
  if (typeof activeLens !== 'string' || !activeLens.startsWith('folder_')) return 'keep';
  const folderId = activeLens.replace('folder_', '');
  if (customFolders.some((folder) => folder.id === folderId)) return 'keep';
  return 'reset';
}

/**
 * U3.1 — the single roving index space for the tablist: the lens
 * pills followed by the visible folder tabs, in this order. Overflow
 * menu items are not tabs and are not in this space; the menu has its
 * own arrow handling. The page's `onLensKeyDown` walks this array with
 * `@quant/shared-ui`'s `nextRovingIndex`, so arrows cross the
 * pill/folder boundary instead of stopping at the last pill.
 */
export function combinedLensKeys(
  pillKeys: string[],
  visibleFolders: LensFolderLike[],
): string[] {
  return [...pillKeys, ...visibleFolders.map((folder) => `folder_${folder.id}`)];
}
