// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  CATEGORY_META,
  CATEGORY_ORDER,
  deriveCategoryPills,
  matchesCategories,
  removeCategory,
  type SelectableCategory,
} from '../lib/category-filter';

/**
 * U3.4 — the category narrowing is pure, so it is pinned here the
 * way U3.1 pinned its helpers: the 4800-line page component cannot
 * be mounted cheaply, so the page delegates to `category-filter.ts`
 * and these tests pin exactly the functions the page actually calls.
 * Page-level behaviour (Apply commits, X abandons, footer Clear is
 * clear-all, pills beside the Filter trigger) is page wiring, not
 * covered here — it needs a mounted-component test or a live check
 * with a dedicated test handle, both still owed.
 */

const set = (...categories: SelectableCategory[]): Set<SelectableCategory> =>
  new Set(categories);

describe('U3.4 matchesCategories: OR within categories', () => {
  it('matches everything when nothing is selected, including uncategorised threads', () => {
    expect(matchesCategories('primary', set())).toBe(true);
    expect(matchesCategories('forums', set())).toBe(true);
    expect(matchesCategories('spam', set())).toBe(true);
    expect(matchesCategories(undefined, set())).toBe(true);
  });

  it('matches only the selected category when one is selected', () => {
    const selected = set('social');
    expect(matchesCategories('social', selected)).toBe(true);
    expect(matchesCategories('primary', selected)).toBe(false);
    expect(matchesCategories('updates', selected)).toBe(false);
  });

  it('matches any of several selected categories (OR, not AND)', () => {
    const selected = set('primary', 'promotions');
    expect(matchesCategories('primary', selected)).toBe(true);
    expect(matchesCategories('promotions', selected)).toBe(true);
    expect(matchesCategories('social', selected)).toBe(false);
  });

  it('hides uncategorised threads once any category is selected', () => {
    expect(matchesCategories(undefined, set('primary'))).toBe(false);
  });

  it('never matches a spam thread once any category is selected (spam is a lens, not a category)', () => {
    expect(matchesCategories('spam', set('primary'))).toBe(false);
    expect(matchesCategories('spam', set('primary', 'social', 'promotions', 'updates', 'forums'))).toBe(false);
  });
});

describe('U3.4 deriveCategoryPills: canonical order, labels, colours', () => {
  it('returns no pills for an empty selection', () => {
    expect(deriveCategoryPills(set())).toEqual([]);
  });

  it('orders pills canonically regardless of tick order', () => {
    const pills = deriveCategoryPills(set('forums', 'primary', 'social'));
    expect(pills.map((pill) => pill.key)).toEqual([
      'category:primary',
      'category:social',
      'category:forums',
    ]);
  });

  it('labels and colours come from the shared meta table', () => {
    const pills = deriveCategoryPills(set('updates'));
    expect(pills).toEqual([
      { key: 'category:updates', label: CATEGORY_META.updates.label, color: CATEGORY_META.updates.color },
    ]);
  });

  it('covers exactly the five selectable categories, in order', () => {
    expect(CATEGORY_ORDER).toEqual(['primary', 'social', 'promotions', 'updates', 'forums']);
    const pills = deriveCategoryPills(set(...CATEGORY_ORDER));
    expect(pills).toHaveLength(5);
    expect(pills.map((pill) => pill.label)).toEqual(
      CATEGORY_ORDER.map((category) => CATEGORY_META[category].label),
    );
  });
});

describe('U3.4 removeCategory: one removal, nothing else moves', () => {
  it('removes only the named category and never mutates the input', () => {
    const before = set('primary', 'social', 'forums');
    const after = removeCategory(before, 'social');
    expect(after).toEqual(set('primary', 'forums'));
    expect(before).toEqual(set('primary', 'social', 'forums'));
    expect(after).not.toBe(before);
  });

  it('removing an absent category returns an equal new set', () => {
    const before = set('primary');
    const after = removeCategory(before, 'forums');
    expect(after).toEqual(before);
    expect(after).not.toBe(before);
  });

  it('removing the last category leaves an empty selection, which matches everything again', () => {
    const after = removeCategory(set('updates'), 'updates');
    expect(after.size).toBe(0);
    expect(matchesCategories('social', after)).toBe(true);
    expect(matchesCategories(undefined, after)).toBe(true);
  });
});
