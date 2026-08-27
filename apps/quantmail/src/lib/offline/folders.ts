/**
 * Folder membership rules.
 *
 * A mailbox view is a *predicate over message fields*, not a server-assigned
 * bucket. That single decision is what lets an optimistic mutation say only what
 * changed (`isArchived: true`) and have every cached list — inbox, archive,
 * search, snoozed — independently work out whether the message still belongs in
 * it. Without it each action would need bespoke add/remove logic per view, and
 * the inevitable gap would show a message in two places at once.
 *
 * Shared by the React Query cache updates in `useMailMutations` and by the
 * IndexedDB seeding in `useInbox`, so a cold offline start and a live optimistic
 * update apply exactly the same rules.
 */

import type { Email } from '../../types';

/** Query key prefixes whose data is an `Email[]`. */
export const EMAIL_LIST_PREFIXES = [['inbox'], ['email-search']] as const;

/**
 * Extract the folder from a React Query key.
 *
 * The inbox key is `['inbox', label, category, folderType, page]` — see
 * `useInbox`. Search keys have no folder, and `undefined` means "no folder
 * filter", which {@link belongsInFolder} treats as everything but the trash.
 */
export function folderTypeOf(queryKey: readonly unknown[]): string | undefined {
  if (queryKey[0] !== 'inbox') return undefined;
  const folderType = queryKey[3];
  return typeof folderType === 'string' ? folderType : undefined;
}

/** Whether a message belongs in a folder view, judged purely from its fields. */
export function belongsInFolder(email: Email, folderType: string | undefined): boolean {
  const isTrashed = Boolean(email.trashedAt);
  switch (folderType) {
    case 'TRASH':
      return isTrashed;
    case 'ARCHIVE':
      return !isTrashed && email.isArchived === true;
    case 'SNOOZED':
      return !isTrashed && Boolean(email.snoozedUntil);
    case 'INBOX':
      return !isTrashed && !email.isArchived && !email.snoozedUntil;
    default:
      // Search results and label views: everything except the trash.
      return !isTrashed;
  }
}

/**
 * Rebuild one cached list against a set of patched messages.
 *
 * Messages already present are updated, and dropped if they no longer belong;
 * messages that have just moved *into* this folder are appended. Callers sort for
 * display, so append position does not matter.
 */
export function reconcileList(
  list: Email[],
  patched: Map<string, Email>,
  folderType: string | undefined,
): Email[] {
  const next: Email[] = [];
  const seen = new Set<string>();

  for (const email of list) {
    seen.add(email.id);
    const updated = patched.get(email.id) ?? email;
    if (belongsInFolder(updated, folderType)) next.push(updated);
  }

  for (const [id, email] of patched) {
    if (seen.has(id)) continue;
    if (belongsInFolder(email, folderType)) next.push(email);
  }

  return next;
}
