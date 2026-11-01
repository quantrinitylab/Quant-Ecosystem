// ============================================================================
// thread-overflow — Slice 2 (thread view) pure helpers.
// ============================================================================
// Behaviour spec: Outlook iOS thread overflow, screen by screen, rebuilt in
// QuantMail's own code and theme. No Outlook artwork, icons, or code is used
// here — only the behaviour: the same 15 items, in the same order, with the
// same labels.
//
// Honesty contract for this file: an item is 'wired' only when a real
// backend/UI path exists for it today. Items without one are 'unavailable'
// and the UI must show an honest toast for them — never a fake success.
//   - Flag: NO flagged field exists on Email/EmailThread (only isStarred /
//     isPinned). Star is deliberately NOT relabelled as a flag.
//   - Move to Other: Focused is a client-side computed partition (slice 1's
//     matchesFocusedRule); no server-side focused-override field exists, so
//     a re-file cannot persist. Needs a later slice (field + migration).
//   - Create a Task: wired — the calendar task draft path
//     (handleCreateEventFromEmail('task')) is real.
//   - Report Junk: no mark-spam route exists (only not-spam rescue).
//   - Report Phishing: no report route exists (the safety banner only scans).
//   - Block: no block-sender route exists.
// Everything else in the list has a real path (see the view).

export type OverflowItemKind = 'wired' | 'unavailable';

export interface OverflowItemDef {
  id: string;
  label: string;
  kind: OverflowItemKind;
  /** Shown in the honest toast for unavailable items. */
  unavailableNote?: string;
}

/**
 * The spec's 15 overflow items, in the spec's exact order. 'Reorder' (the
 * sheet's link in Outlook) is intentionally NOT an item here: QuantMail has
 * no user-reorderable overflow menu, so a Reorder control would be a dead
 * button. It is documented as not built, not faked.
 */
export const THREAD_OVERFLOW_ITEMS: OverflowItemDef[] = [
  { id: 'move', label: 'Move', kind: 'wired' },
  {
    id: 'move-to-other',
    label: 'Move to Other',
    kind: 'unavailable',
    unavailableNote:
      'Focused filing is not stored on the server yet — it needs a focused-override field first.',
  },
  {
    id: 'flag',
    label: 'Flag',
    kind: 'unavailable',
    unavailableNote:
      'There is no flag field on mail yet — starring is not a flag and is not relabelled as one.',
  },
  { id: 'categorise', label: 'Categorise', kind: 'wired' },
  { id: 'pin', label: 'Pin', kind: 'wired' },
  { id: 'snooze', label: 'Snooze', kind: 'wired' },
  { id: 'create-task', label: 'Create a Task', kind: 'wired' },
  {
    id: 'report-junk',
    label: 'Report Junk',
    kind: 'unavailable',
    unavailableNote: 'There is no mark-as-spam route yet — only the not-spam rescue exists.',
  },
  {
    id: 'report-phishing',
    label: 'Report Phishing',
    kind: 'unavailable',
    unavailableNote: 'There is no phishing-report route yet — the safety banner only scans.',
  },
  {
    id: 'block',
    label: 'Block',
    kind: 'unavailable',
    unavailableNote: 'There is no block-sender route yet.',
  },
  { id: 'ignore', label: 'Ignore', kind: 'wired' },
  { id: 'print', label: 'Print', kind: 'wired' },
  { id: 'light-mode', label: 'View in Light Mode', kind: 'wired' },
  { id: 'reply', label: 'Reply', kind: 'wired' },
  { id: 'reply-all', label: 'Reply All', kind: 'wired' },
];

/** Reaction pills shown above the action bar. Generic emoji, QuantMail's own set. */
export const THREAD_REACTION_PILLS = ['👍', '❤️', '😂', '😮', '😢'] as const;

/** Inbox categories the backend accepts for PATCH /emails/:id/category. */
export const THREAD_CATEGORIES = ['primary', 'social', 'promotions', 'updates', 'forums'] as const;
export type ThreadCategory = (typeof THREAD_CATEGORIES)[number];

export function threadCategoryLabel(category: ThreadCategory): string {
  return category.charAt(0).toUpperCase() + category.slice(1);
}

/**
 * "This evening": today at 19:00 local. When 19:00 has already passed, the
 * honest fallback is tomorrow 09:00 (the same fallback the 'Later today'
 * preset uses when +3h rolls past midnight) — never a time in the past,
 * which the backend rejects.
 */
export function snoozeThisEvening(now: Date = new Date()): Date {
  const evening = new Date(now);
  evening.setHours(19, 0, 0, 0);
  if (evening.getTime() <= now.getTime()) {
    const morning = new Date(now);
    morning.setDate(morning.getDate() + 1);
    morning.setHours(9, 0, 0, 0);
    return morning;
  }
  return evening;
}

export interface MoveFolderLike {
  id: string;
  name: string;
  type: string;
}

/**
 * Move Conversation sheet grouping, per spec: Favourites first (Inbox, Sent),
 * then the rest of the folders. Search filters by name, case-insensitively.
 */
export function groupMoveFolders<T extends MoveFolderLike>(
  folders: T[],
  query: string,
): { favourites: T[]; folders: T[] } {
  const q = query.trim().toLowerCase();
  const visible = q ? folders.filter((f) => f.name.toLowerCase().includes(q)) : folders;
  const favourites = visible.filter((f) => f.type === 'INBOX' || f.type === 'SENT');
  const rest = visible.filter((f) => f.type !== 'INBOX' && f.type !== 'SENT');
  return { favourites, folders: rest };
}

export interface SnoozedLike {
  snoozedUntil?: Date | string | null;
}

/**
 * The thread's active snooze: the furthest future snoozedUntil across its
 * messages, or null when nothing is snoozed. Past values are not "snoozed"
 * — the wake time has already passed.
 */
export function activeSnoozedUntil<T extends SnoozedLike>(messages: T[], now: number = Date.now()): Date | null {
  let best: number | null = null;
  for (const message of messages) {
    if (!message.snoozedUntil) continue;
    const ms =
      message.snoozedUntil instanceof Date
        ? message.snoozedUntil.getTime()
        : Date.parse(message.snoozedUntil);
    if (Number.isFinite(ms) && ms > now && (best === null || ms > best)) best = ms;
  }
  return best === null ? null : new Date(best);
}

/** Compact byte size for attachment chips ("110 KB", "2.4 MB"). */
export function formatAttachmentSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
