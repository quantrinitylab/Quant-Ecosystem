// ============================================================================
// quantmail — the auto-advance preference: where a triage action lands you
// ============================================================================
//
// Gmail's Settings → General → "Auto-advance" answers one power-triage
// question: after you delete or archive a conversation from its thread view,
// do you go to the next (older) conversation, the previous (newer) one, or
// back to the conversation list? QuantMail had no such setting anywhere —
// `grep autoAdvance` across the app returned nothing — so every archive and
// delete from `/thread/<id>` bounced straight back to the list, and a
// high-volume triager paid an extra click per message to return and pick the
// next thread.
//
// This module owns the preference end to end, following the same shape as
// `ai-intent-preference.ts` (one key, one normaliser, SSR-safe reads) and the
// injectable-storage shape of `searchHistory.ts` so the logic is unit-testable
// under vitest's node environment, where `window` does not exist:
//
// - The Settings → General picker writes through `writeAutoAdvance`.
// - `/thread/<id>` reads through `readAutoAdvance` at triage time (not at
//   mount — reading at the moment of the action means a setting changed in
//   another tab applies to the very next triage, with no reload).
// - `resolveAutoAdvanceTarget` is the pure decision the thread page applies:
//   a target thread id, or `null` for "back to the list".
//
// Scope honesty, stated plainly because the finding names four actions:
// archive and delete are the thread-view triage actions that leave the thread
// (plus "Move to inbox" for an archived conversation, which is the same
// leave-the-thread shape). Mute and move-to-folder do not exist as thread-view
// actions — `ConversationalThreadView` deliberately omits them because no
// conversation mute/move endpoint exists — so this setting does not claim to
// cover them. When one lands, it should reuse this same preference and this
// same resolver rather than inventing a second one.
//
// Default is `'list'`: that is today's behaviour, so shipping the setting
// changes nothing for anyone who never touches it. A user opts into
// `'older'` or `'newer'` explicitly.
//
// Fallbacks are always "back to the list", never a silent jump in the other
// direction: if the chosen direction has no neighbour (first/last thread in
// the corpus, or the current thread is not in the inbox+archive corpus the
// view groups — e.g. opened from spam, trash or sent), advancing to the
// opposite neighbour would contradict the setting the user just picked.
// ============================================================================

/** Storage key. Written once here so the picker and the reader cannot drift. */
export const AUTO_ADVANCE_STORAGE_KEY = 'quant-auto-advance';

/**
 * Where a thread-view triage action lands:
 * - `'older'` — the next conversation down the inbox list (Gmail's "next").
 * - `'newer'` — the previous conversation up the inbox list.
 * - `'list'` — back to the conversation list (today's behaviour).
 */
export type AutoAdvance = 'older' | 'newer' | 'list';

export const AUTO_ADVANCE_MODES: readonly AutoAdvance[] = ['older', 'newer', 'list'];

/** Neighbours in the inbox's own conversation order (newest first). */
export interface AdjacentThreads {
  /** The newer conversation (up the inbox list), or null at the top. */
  previous: string | null;
  /** The older conversation (down the inbox list), or null at the bottom. */
  next: string | null;
}

/** Minimal storage surface, so tests can inject a Map-backed store. */
export interface AutoAdvanceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStorage(): AutoAdvanceStorage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    // Safari in private mode throws on access, not on write.
    return null;
  }
}

/** Unknown, missing or legacy values fall back to `'list'` (today's behaviour). */
export function normalizeAutoAdvance(value: unknown): AutoAdvance {
  return value === 'older' || value === 'newer' ? value : 'list';
}

export function readAutoAdvance(storage: AutoAdvanceStorage | null = defaultStorage()): AutoAdvance {
  if (!storage) return 'list';
  try {
    return normalizeAutoAdvance(storage.getItem(AUTO_ADVANCE_STORAGE_KEY));
  } catch {
    return 'list';
  }
}

export function writeAutoAdvance(
  mode: AutoAdvance,
  storage: AutoAdvanceStorage | null = defaultStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(AUTO_ADVANCE_STORAGE_KEY, mode);
  } catch {
    /* A preference we cannot persist still applies nowhere — the reader
       defaults to 'list', which is the safe, existing behaviour. */
  }
}

export interface AutoAdvanceOption {
  value: AutoAdvance;
  label: string;
  description: string;
}

export const AUTO_ADVANCE_OPTIONS: readonly AutoAdvanceOption[] = [
  {
    value: 'older',
    label: 'Next (older) conversation',
    description: 'After archive or delete, open the next conversation down the list.',
  },
  {
    value: 'newer',
    label: 'Previous (newer) conversation',
    description: 'After archive or delete, open the previous conversation up the list.',
  },
  {
    value: 'list',
    label: 'Back to conversation list',
    description: 'After archive or delete, return to the list, as today.',
  },
];

/**
 * The thread to open after a triage action, or `null` for "back to the list".
 * `'newer'` maps to the view's `previous` (up the list = newer) and `'older'`
 * to its `next` (down the list = older) — the view's naming is positional,
 * this setting's naming is temporal, and this is the one place they meet.
 */
export function resolveAutoAdvanceTarget(
  mode: AutoAdvance,
  adjacent: AdjacentThreads,
): string | null {
  if (mode === 'newer') return adjacent.previous;
  if (mode === 'older') return adjacent.next;
  return null;
}
