import { describe, it, expect } from 'vitest';
import { ScoreFusion } from '../ranking/score-fusion';

describe('ScoreFusion', () => {
  it('should fuse scores from multiple rankers', () => {
    const fusion = new ScoreFusion();

    const scores: Record<string, number> = {
      item1: 0.9,
      item2: 0.5,
      item3: 0.7,
    };

    fusion.addRanker('relevance', 1.0, (id) => scores[id] ?? 0);
    fusion.addRanker('popularity', 0.5, (id) => (id === 'item2' ? 1.0 : 0.3));

    const results = fusion.fuse(['item1', 'item2', 'item3']);

    expect(results).toHaveLength(3);
    // Results should be sorted by final score
    expect(results[0]!.finalScore).toBeGreaterThanOrEqual(results[1]!.finalScore);
    expect(results[1]!.finalScore).toBeGreaterThanOrEqual(results[2]!.finalScore);
  });

  it('should normalize scores before weighting', () => {
    const fusion = new ScoreFusion();

    // Ranker with large range
    fusion.addRanker('large', 1.0, (id) => (id === 'a' ? 1000 : 0));
    // Ranker with small range
    fusion.addRanker('small', 1.0, (id) => (id === 'b' ? 1 : 0));

    const results = fusion.fuse(['a', 'b']);

    // After normalization, both rankers should contribute equally
    const scoreA = results.find((r) => r.id === 'a')!;
    const scoreB = results.find((r) => r.id === 'b')!;

    // Each dominates its own ranker, so with equal weights they should be equal
    expect(scoreA.finalScore).toBeCloseTo(scoreB.finalScore, 5);
  });

  it('should respect weights', () => {
    const fusion = new ScoreFusion();

    // High weight ranker favors item1
    fusion.addRanker('main', 10.0, (id) => (id === 'item1' ? 1.0 : 0.0));
    // Low weight ranker favors item2
    fusion.addRanker('minor', 1.0, (id) => (id === 'item2' ? 1.0 : 0.0));

    const results = fusion.fuse(['item1', 'item2']);

    const item1 = results.find((r) => r.id === 'item1')!;
    const item2 = results.find((r) => r.id === 'item2')!;

    expect(item1.finalScore).toBeGreaterThan(item2.finalScore);
  });

  it('should return zero scores when no rankers', () => {
    const fusion = new ScoreFusion();
    const results = fusion.fuse(['item1', 'item2']);

    expect(results[0]!.finalScore).toBe(0);
    expect(results[1]!.finalScore).toBe(0);
  });

  it('should track ranker count', () => {
    const fusion = new ScoreFusion();
    fusion.addRanker('a', 1, () => 0);
    fusion.addRanker('b', 1, () => 0);

    expect(fusion.getRankerCount()).toBe(2);
  });

  it('should remove ranker', () => {
    const fusion = new ScoreFusion();
    fusion.addRanker('a', 1, () => 0);
    fusion.addRanker('b', 1, () => 0);

    expect(fusion.removeRanker('a')).toBe(true);
    expect(fusion.getRankerCount()).toBe(1);
    expect(fusion.removeRanker('nonexistent')).toBe(false);
  });

  it('should include raw scores in results', () => {
    const fusion = new ScoreFusion();
    fusion.addRanker('relevance', 1, (id) => (id === 'x' ? 0.8 : 0.2));

    const results = fusion.fuse(['x', 'y']);
    const itemX = results.find((r) => r.id === 'x')!;

    expect(itemX.scores['relevance']).toBe(0.8);
  });
});
