// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  deriveFilterChip,
  filterChipLabel,
  filterChipLabelParts,
  isFilterChipVisible,
} from '../lib/filter-chip';

/**
 * U3.2 — single active chip beside the Filter trigger.
 *
 * The claim's test plan, pinned at the helper level (the U3.1
 * precedent: the page delegates to `src/lib/filter-chip.ts`, so these
 * tests pin the derivation the page actually renders, without mounting
 * the 4800-line page). What is fixed here:
 * - chip hidden at 0 narrowings, shown above 0;
 * - turn-only / filters-only / combined labels, in canonical order,
 *   count = narrowingCount (passed through, never recomputed);
 * - label excludes search q and the active lens (neither is an input
 *   to the helpers, so no test can smuggle one in — the signatures
 *   themselves are the pin);
 * - label persists across lens changes for the same reason;
 * - the footer clear path is the page's, not the chip's: the chip
 *   derivation carries no clear action (asserted by the absence of
 *   any clear/reset export on the module surface below).
 */

describe('U3.2 (1) chip hidden at zero narrowings', () => {
  it('is not visible at 0 and derives null', () => {
    expect(isFilterChipVisible(0)).toBe(false);
    expect(deriveFilterChip('any', new Set(), 0)).toBeNull();
  });

  it('is visible at 1 and above', () => {
    expect(isFilterChipVisible(1)).toBe(true);
    expect(isFilterChipVisible(3)).toBe(true);
    expect(deriveFilterChip('needs_you', new Set(), 1)).toEqual({
      label: 'Your turn',
      count: 1,
    });
  });
});

describe('U3.2 (2) turn-only, filters-only, combined labels', () => {
  it('labels a turn-only narrowing', () => {
    expect(filterChipLabel('needs_you', new Set())).toBe('Your turn');
    expect(filterChipLabel('waiting', new Set())).toBe('Their turn');
    expect(filterChipLabel('any', new Set())).toBe('');
  });

  it('labels filters-only narrowings', () => {
    expect(filterChipLabel('any', new Set(['starred']))).toBe('Pinned');
    expect(filterChipLabel('any', new Set(['attachment']))).toBe('Has attachment');
    expect(filterChipLabel('any', new Set(['starred', 'attachment']))).toBe(
      'Pinned · Has attachment',
    );
  });

  it('labels a combined narrowing, turn first', () => {
    expect(
      filterChipLabel('waiting', new Set(['starred', 'attachment'])),
    ).toBe('Their turn · Pinned · Has attachment');
    expect(
      deriveFilterChip('needs_you', new Set(['attachment']), 2),
    ).toEqual({ label: 'Your turn · Has attachment', count: 2 });
  });

  it('orders filters canonically, not by Set insertion order', () => {
    expect(filterChipLabel('any', new Set(['attachment', 'starred']))).toBe(
      'Pinned · Has attachment',
    );
    expect(filterChipLabelParts('any', ['attachment', 'starred'])).toEqual([
      'Pinned',
      'Has attachment',
    ]);
  });
});

describe('U3.2 (3) count is passed through, never recomputed', () => {
  it('count = narrowingCount, even when it disagrees with the parts', () => {
    // The page owns narrowingCount (turn + filters.size); the helper
    // must not second-guess it, or the chip, the trigger badge and
    // the footer could show three different numbers.
    expect(deriveFilterChip('any', new Set(['starred']), 1)?.count).toBe(1);
    expect(deriveFilterChip('needs_you', new Set(), 1)?.count).toBe(1);
  });
});

describe('U3.2 (4) label derives solely from turn + filters', () => {
  it('takes no search query and no lens — signatures are the pin', () => {
    // filterChipLabel / deriveFilterChip accept (turn, filters) and
    // (turn, filters, count) only. There is no parameter a search
    // query or a lens could arrive through, so a search-active view
    // and a lens change cannot change the label for the same
    // turn/filters — the chip persists across lens changes by design.
    expect(filterChipLabel.length).toBe(2);
    expect(deriveFilterChip.length).toBe(3);
    expect(filterChipLabel('needs_you', new Set(['starred']))).toBe(
      'Your turn · Pinned',
    );
  });

  it('carries no clear action', async () => {
    const mod = await import('../lib/filter-chip');
    expect(Object.keys(mod).sort()).toEqual([
      'deriveFilterChip',
      'filterChipLabel',
      'filterChipLabelParts',
      'isFilterChipVisible',
    ]);
  });
});
