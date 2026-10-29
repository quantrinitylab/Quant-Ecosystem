/**
 * U3.4 — category narrowing, pure functions only.
 *
 * This module holds no state, no React, no I/O. The inbox page owns
 * the committed selection (`activeCategories`) and the picker's
 * draft; this file only answers three questions: does a thread
 * match the selection, what pills does the selection produce, and
 * what is the selection with one category taken out.
 *
 * HONESTY RULE (carried into the UI copy by the picker): categories
 * are heuristic. A thread's `category` resolves from the server's
 * `aiCategory` where present, otherwise from the client classifier
 * in `threading.ts`, and no cron writes `aiCategory` automatically —
 * there is a manual backfill endpoint with zero callers in src.
 * So a category is a best-effort guess, never ground truth, and the
 * picker says so. Threads with no category at all are shown when
 * nothing is selected, and match nothing once any category is.
 *
 * Selectable categories exclude 'spam' deliberately: spam is
 * already its own lens (and a Spam link on the strip), not a
 * category bucket. Offering it here would double the Spam lens
 * and let a category narrowing silently re-include spam threads
 * the lens had excluded.
 */
import type { EmailCategory } from '../types';

export type SelectableCategory = Exclude<EmailCategory, 'spam'>;

/** Canonical order: pills and picker rows always render in this order. */
export const CATEGORY_ORDER: readonly SelectableCategory[] = [
  'primary',
  'social',
  'promotions',
  'updates',
  'forums',
] as const;

export interface CategoryMeta {
  /** Short label, shown on pills, picker rows and the popover entry. */
  label: string;
  /** Colour dot, QuantWorkplace's own palette — not a competitor's. */
  color: string;
}

export const CATEGORY_META: Record<SelectableCategory, CategoryMeta> = {
  primary: { label: 'Primary', color: '#FF6B35' },
  social: { label: 'Social', color: '#38BDF8' },
  promotions: { label: 'Promotions', color: '#F59E0B' },
  updates: { label: 'Updates', color: '#34A853' },
  forums: { label: 'Forums', color: '#A78BFA' },
};

/**
 * OR within categories, AND with everything else (the page ANDs this
 * result with lens + turn + filters in `narrowThreads`).
 *
 * - Nothing selected: everything matches, including threads with no
 *   category — an empty selection is "no narrowing", not "show
 *   uncategorised only".
 * - Something selected: a thread matches iff its category is one of
 *   the selected ones. A thread with no category matches nothing,
 *   and a spam thread matches nothing either, because 'spam' can
 *   never be in the selection.
 */
export function matchesCategories(
  threadCategory: EmailCategory | undefined,
  selected: ReadonlySet<SelectableCategory>,
): boolean {
  if (selected.size === 0) return true;
  if (threadCategory === undefined) return false;
  return (selected as ReadonlySet<EmailCategory>).has(threadCategory);
}

export interface CategoryPill {
  /** Stable key, `category:<category>` — the page strips the prefix for removal. */
  key: `category:${SelectableCategory}`;
  label: string;
  color: string;
}

/**
 * Pills for the committed selection, in canonical order regardless
 * of the order the user ticked them in. An empty selection yields
 * no pills, which is how the pill row hides itself.
 */
export function deriveCategoryPills(selected: ReadonlySet<SelectableCategory>): CategoryPill[] {
  return CATEGORY_ORDER.filter((category) => selected.has(category)).map((category) => ({
    key: `category:${category}` as const,
    label: CATEGORY_META[category].label,
    color: CATEGORY_META[category].color,
  }));
}

/**
 * A new set with one category removed; the input is never mutated,
 * so the page can pass its previous state straight through React's
 * functional updater. Removing an absent category returns an equal
 * (but new) set, never an error.
 */
export function removeCategory(
  selected: ReadonlySet<SelectableCategory>,
  category: SelectableCategory,
): Set<SelectableCategory> {
  const next = new Set(selected);
  next.delete(category);
  return next;
}
