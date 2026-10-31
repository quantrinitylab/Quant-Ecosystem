/**
 * QuantMail — the stored "Default reply behavior" preference (Gmail's
 * Settings → General → "Default reply behavior": Reply vs Reply all).
 *
 * History: the old settings page carried a "Default Reply Action" control
 * with no persistence at all — it was removed rather than left lying, and
 * the finding that followed was that nothing replaced it, so every thread
 * reply started from the same default with no way to pin Reply-all-first
 * for group-thread users. This file is the replacement, and it exists
 * precisely so the setting cannot drift back into a control with no reader:
 * the writer (Settings → General) and every reader (the thread view's
 * Reply button, its quick-reply bar) go through here, and the key lives
 * in exactly one place.
 *
 * Storage is this browser's localStorage, like the theme, density and
 * assistant-tier preferences — not the account — because the habit being
 * pinned ("I almost always answer the whole group") is a per-device
 * habit, and because there is no server-side user-preference field for
 * it: inventing one would mean a migration plus a backend route for a
 * value nothing server-side reads. The backend reply endpoint already
 * accepts `replyAll` (POST /emails/:id/reply), so the quick-reply bar
 * needs no backend change to honour this — it passes the flag.
 *
 * Unknown, missing or unreadable values fall back to `'reply'`: the
 * sender-only reply is the safe default (a reply-all sent by accident
 * goes to people who were never meant to see it; a reply sent when
 * reply-all was meant is one extra tap away via the thread menu).
 */

export const REPLY_BEHAVIOR_STORAGE_KEY = 'quant-default-reply-behavior';

export const REPLY_BEHAVIORS = ['reply', 'reply-all'] as const;

export type ReplyBehavior = (typeof REPLY_BEHAVIORS)[number];

/**
 * The only values this build recognises. Anything else — a typo, a value
 * from a future build, a hand-edited key — is the sender-only default,
 * never a crash and never a silent reply-all.
 */
export function normalizeReplyBehavior(value: unknown): ReplyBehavior {
  return value === 'reply-all' ? 'reply-all' : 'reply';
}

export interface ReplyBehaviorOption {
  value: ReplyBehavior;
  label: string;
  description: string;
}

export const REPLY_BEHAVIOR_OPTIONS: ReplyBehaviorOption[] = [
  {
    value: 'reply',
    label: 'Reply',
    description: 'Answer only the sender. The thread menu still offers Reply all for one message.',
  },
  {
    value: 'reply-all',
    label: 'Reply all',
    description:
      'Answer the sender and copy everyone else on the thread. On a one-to-one conversation both choices send to the same person.',
  },
];

/** Minimal storage surface, so tests can pass a fake without a DOM. */
export interface ReplyBehaviorStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStorage(): ReplyBehaviorStorage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    // Safari in private mode throws on access, not on write. An unreadable
    // preference is the same as an unset one.
    return null;
  }
}

export function readReplyBehavior(storage?: ReplyBehaviorStorage | null): ReplyBehavior {
  const store = storage === undefined ? defaultStorage() : storage;
  if (!store) return 'reply';
  try {
    return normalizeReplyBehavior(store.getItem(REPLY_BEHAVIOR_STORAGE_KEY));
  } catch {
    return 'reply';
  }
}

export function writeReplyBehavior(
  behavior: ReplyBehavior,
  storage?: ReplyBehaviorStorage | null,
): void {
  const store = storage === undefined ? defaultStorage() : storage;
  if (!store) return;
  try {
    store.setItem(REPLY_BEHAVIOR_STORAGE_KEY, behavior);
  } catch {
    /* A preference we cannot persist still applies to this session's reads
       only if the caller also holds it in state — the settings page does. */
  }
}

/**
 * Whether the quick-reply bar's in-place send must go to everyone on the
 * thread. Kept as a named predicate rather than an inline `===` so the
 * thread view's send path and any future reply surface read the same
 * sentence, and so the rule is unit-testable in one place.
 */
export function isReplyAllDefault(behavior: ReplyBehavior): boolean {
  return behavior === 'reply-all';
}
