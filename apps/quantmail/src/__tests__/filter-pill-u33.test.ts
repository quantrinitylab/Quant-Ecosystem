// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  areFilterPillsVisible,
  deriveFilterPills,
  describeEmptyView,
  removeFilterPill,
} from '../lib/filter-pill';

/**
 * U3.3 — removable applied-filter pills replacing the U3.2 chip.
 *
 * Pinned at the helper level (the U3.1/U3.2 precedent: the page
 * delegates to `src/lib/filter-pill.ts`, so these tests pin the
 * derivation the page actually renders, without mounting the
 * 4800-line page). What is fixed here:
 * - one pill per narrowing, turn first, filters in canonical order;
 * - empty at zero narrowings (no pill row), pills above zero;
 * - per-pill X removes ONLY that narrowing (turn pill → turn `any`,
 *   filter pill → that filter only), never mutates the input set,
 *   and is not a clear-all (clear-all stays the popover footer);
 * - pill derivation takes no search query and no lens — the
 *   signatures themselves are the pin, so pills persist across lens
 *   changes and never count a search;
 * - the filtered-empty description names the active lens + pills +
 *   search honestly, and invents nothing when there is nothing to name.
 */

describe('U3.3 (1) one pill per narrowing, turn first, canonical order', () => {
  it('is empty at zero narrowings', () => {
    expect(deriveFilterPills('any', new Set())).toEqual([]);
    expect(areFilterPillsVisible(deriveFilterPills('any', new Set()))).toBe(false);
  });

  it('labels a turn-only narrowing as one pill', () => {
    expect(deriveFilterPills('needs_you', new Set())).toEqual([
      { kind: 'turn', key: 'turn:needs_you', label: 'Your turn' },
    ]);
    expect(deriveFilterPills('waiting', new Set())).toEqual([
      { kind: 'turn', key: 'turn:waiting', label: 'Their turn' },
    ]);
  });

  it('labels filters-only narrowings as one pill each', () => {
    expect(deriveFilterPills('any', new Set(['starred']))).toEqual([
      { kind: 'filter', key: 'filter:starred', label: 'Pinned' },
    ]);
    expect(deriveFilterPills('any', new Set(['attachment']))).toEqual([
      { kind: 'filter', key: 'filter:attachment', label: 'Has attachment' },
    ]);
  });

  it('orders turn first, then filters canonically, not by insertion order', () => {
    expect(deriveFilterPills('waiting', new Set(['attachment', 'starred']))).toEqual([
      { kind: 'turn', key: 'turn:waiting', label: 'Their turn' },
      { kind: 'filter', key: 'filter:starred', label: 'Pinned' },
      { kind: 'filter', key: 'filter:attachment', label: 'Has attachment' },
    ]);
    expect(areFilterPillsVisible(deriveFilterPills('any', new Set(['starred'])))).toBe(true);
  });
});

describe('U3.3 (2) per-pill X removes only that narrowing', () => {
  it('turn pill resets the turn and keeps the filters', () => {
    const filters = new Set(['starred', 'attachment'] as const);
    const next = removeFilterPill('needs_you', filters, {
      kind: 'turn',
      key: 'turn:needs_you',
      label: 'Your turn',
    });
    expect(next.turn).toBe('any');
    expect(next.filters).toEqual(new Set(['starred', 'attachment']));
  });

  it('filter pill drops only that filter and keeps turn + others', () => {
    const filters = new Set(['starred', 'attachment'] as const);
    const next = removeFilterPill('waiting', filters, {
      kind: 'filter',
      key: 'filter:starred',
      label: 'Pinned',
    });
    expect(next.turn).toBe('waiting');
    expect(next.filters).toEqual(new Set(['attachment']));
  });

  it('never mutates the input set', () => {
    const filters = new Set(['starred', 'attachment'] as const);
    removeFilterPill('any', filters, {
      kind: 'filter',
      key: 'filter:starred',
      label: 'Pinned',
    });
    expect(filters).toEqual(new Set(['starred', 'attachment']));
  });

  it('removing the last pill empties the row', () => {
    const next = removeFilterPill('needs_you', new Set([]), {
      kind: 'turn',
      key: 'turn:needs_you',
      label: 'Your turn',
    });
    expect(deriveFilterPills(next.turn, next.filters)).toEqual([]);
  });
});

describe('U3.3 (3) pill derivation takes no search and no lens', () => {
  it('signatures are the pin', () => {
    // deriveFilterPills accepts (turn, filters) only. There is no
    // parameter a search query or a lens could arrive through, so a
    // search-active view and a lens change cannot change the pills
    // for the same turn/filters — pills persist across lens changes.
    expect(deriveFilterPills.length).toBe(2);
    expect(removeFilterPill.length).toBe(3);
  });
});

describe('U3.3 (4) filtered-empty state names the active view honestly', () => {
  it('names lens + pills, no search', () => {
    expect(
      describeEmptyView({ lensLabel: 'All', pillLabels: ['Your turn', 'Pinned'] }),
    ).toBe('No conversation in All matches Your turn and Pinned.');
    expect(describeEmptyView({ lensLabel: 'Unread', pillLabels: ['Has attachment'] })).toBe(
      'No conversation in Unread matches Has attachment.',
    );
  });

  it('names the search query first, then pills, then a non-All lens', () => {
    expect(
      describeEmptyView({
        lensLabel: 'Unread',
        pillLabels: ['Pinned'],
        searchQuery: 'invoice',
      }),
    ).toBe('No messages match search "invoice" with Pinned in Unread.');
    expect(
      describeEmptyView({ lensLabel: 'All', pillLabels: [], searchQuery: 'invoice' }),
    ).toBe('No messages match search "invoice".');
  });

  it('invents nothing when there is nothing to name', () => {
    expect(describeEmptyView({ lensLabel: 'Spam', pillLabels: [] })).toBe(
      'Nothing in Spam yet.',
    );
    expect(describeEmptyView({ lensLabel: 'All', pillLabels: [] })).toBe(
      'Nothing here yet.',
    );
  });

  it('joins three labels with an Oxford comma', () => {
    expect(
      describeEmptyView({
        lensLabel: 'All',
        pillLabels: ['Your turn', 'Pinned', 'Has attachment'],
      }),
    ).toBe('No conversation in All matches Your turn, Pinned, and Has attachment.');
  });
});
