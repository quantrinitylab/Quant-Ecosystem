import { describe, it, expect } from 'vitest';
import { VectorClock } from '../vector-clock.js';
import { AwOrSet } from '../aw-or-set.js';

describe('Task W35-03: Vector Clock & AW-OR-Set CRDT for Multi-Tab Offline State', () => {
  describe('Vector Clock', () => {
    it('ticks counter monotonically on the local node', () => {
      const clock = new VectorClock('tab-A');
      expect(clock.get('tab-A')).toBe(0);

      clock.tick();
      expect(clock.get('tab-A')).toBe(1);

      clock.tick();
      expect(clock.get('tab-A')).toBe(2);
    });

    it('merges clocks correctly using component-wise maximum', () => {
      const clockA = new VectorClock('tab-A', { 'tab-A': 3, 'tab-B': 1 });
      const clockB = new VectorClock('tab-B', { 'tab-A': 1, 'tab-B': 4, 'tab-C': 2 });

      clockA.merge(clockB);
      expect(clockA.get('tab-A')).toBe(3);
      expect(clockA.get('tab-B')).toBe(4);
      expect(clockA.get('tab-C')).toBe(2);
    });

    it('identifies EQUAL, GREATER, LESS, and CONCURRENT causality', () => {
      const base = new VectorClock('tab-A', { 'tab-A': 2, 'tab-B': 2 });
      const equal = new VectorClock('tab-B', { 'tab-A': 2, 'tab-B': 2 });
      const greater = new VectorClock('tab-A', { 'tab-A': 3, 'tab-B': 2 });
      const lesser = new VectorClock('tab-A', { 'tab-A': 1, 'tab-B': 2 });
      const concurrent = new VectorClock('tab-B', { 'tab-A': 1, 'tab-B': 3 });

      expect(base.compare(equal)).toBe('EQUAL');
      expect(greater.compare(base)).toBe('GREATER');
      expect(lesser.compare(base)).toBe('LESS');
      expect(base.compare(concurrent)).toBe('CONCURRENT');
    });
  });

  describe('AW-OR-Set CRDT', () => {
    it('adds and removes email flags deterministically', () => {
      const set = new AwOrSet<'READ' | 'STARRED' | 'ARCHIVED'>('tab-1');

      set.add('READ');
      expect(set.has('READ')).toBe(true);
      expect(set.has('STARRED')).toBe(false);

      set.add('STARRED');
      expect(set.has('STARRED')).toBe(true);

      set.remove('READ');
      expect(set.has('READ')).toBe(false);
      expect(set.has('STARRED')).toBe(true);
    });

    it('guarantees Add-Wins semantics on concurrent add and remove across tabs', () => {
      // Simulate two tabs starting from same initial state where 'STARRED' is present
      const tab1 = new AwOrSet<string>('tab-1');
      tab1.add('STARRED');

      // tab2 gets synced with tab1's state
      const tab2 = AwOrSet.fromJSON(tab1.toJSON());
      expect(tab2.has('STARRED')).toBe(true);

      // Concurrent partition:
      // Tab 1 removes 'STARRED'
      tab1.remove('STARRED');
      expect(tab1.has('STARRED')).toBe(false);

      // Tab 2 concurrently re-adds 'STARRED' (generating a brand new birth tag)
      tab2.add('STARRED');
      expect(tab2.has('STARRED')).toBe(true);

      // Now both tabs sync and merge: Add-Wins invariant MUST preserve 'STARRED'
      tab1.merge(tab2);
      tab2.merge(tab1);

      expect(tab1.has('STARRED')).toBe(true);
      expect(tab2.has('STARRED')).toBe(true);
    });

    it('merges multiple tabs with disjoint labels into full set union', () => {
      const tabA = new AwOrSet<string>('tab-A');
      const tabB = new AwOrSet<string>('tab-B');

      tabA.add('LABEL:inbox');
      tabA.add('LABEL:work');

      tabB.add('LABEL:receipts');
      tabB.add('LABEL:taxes');

      tabA.merge(tabB);

      const elements = tabA.elements();
      expect(elements.has('LABEL:inbox')).toBe(true);
      expect(elements.has('LABEL:work')).toBe(true);
      expect(elements.has('LABEL:receipts')).toBe(true);
      expect(elements.has('LABEL:taxes')).toBe(true);
      expect(elements.size).toBe(4);
    });
  });
});
