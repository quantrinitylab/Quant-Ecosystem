import { describe, it, expect } from 'vitest';
import { DPPDiversifier, DPPCandidate } from '../diversify/dpp';

describe('DPPDiversifier', () => {
  const diversifier = new DPPDiversifier();

  function makeCandidates(count: number): DPPCandidate[] {
    const candidates: DPPCandidate[] = [];
    for (let i = 0; i < count; i++) {
      const features = new Array(4).fill(0);
      features[i % 4] = 1; // One-hot-like features for diversity
      candidates.push({
        id: `item${i}`,
        quality: 0.5 + Math.random() * 0.5,
        features,
      });
    }
    return candidates;
  }

  it('should select diverse subset from candidates', () => {
    // Create candidates with different feature clusters
    const candidates: DPPCandidate[] = [
      { id: 'a', quality: 0.9, features: [1, 0, 0, 0] },
      { id: 'b', quality: 0.85, features: [0.95, 0.05, 0, 0] }, // very similar to a
      { id: 'c', quality: 0.8, features: [0, 1, 0, 0] }, // different
      { id: 'd', quality: 0.7, features: [0, 0, 1, 0] }, // different
      { id: 'e', quality: 0.6, features: [0, 0, 0, 1] }, // different
    ];

    const selected = diversifier.diversify(candidates, 3);
    expect(selected).toHaveLength(3);

    const ids = selected.map((s) => s.id);
    // Should prefer diverse items over similar ones
    // 'a' should be selected (highest quality)
    expect(ids).toContain('a');
    // 'b' should NOT be selected (too similar to 'a', lower quality)
    // Instead diverse items should be preferred
    expect(ids).not.toContain('b');
  });

  it('should return all candidates when k >= count', () => {
    const candidates: DPPCandidate[] = [
      { id: 'a', quality: 0.9, features: [1, 0] },
      { id: 'b', quality: 0.8, features: [0, 1] },
    ];

    const selected = diversifier.diversify(candidates, 5);
    expect(selected).toHaveLength(2);
  });

  it('should build kernel matrix with quality-similarity decomposition', () => {
    const candidates: DPPCandidate[] = [
      { id: 'a', quality: 1.0, features: [1, 0] },
      { id: 'b', quality: 0.5, features: [0, 1] },
    ];

    const kernel = diversifier.buildKernel(candidates);

    // Diagonal should be quality^2 (since self-similarity = 1)
    expect(kernel[0]![0]).toBeCloseTo(1.0); // 1.0 * 1 * 1.0
    expect(kernel[1]![1]).toBeCloseTo(0.25); // 0.5 * 1 * 0.5

    // Off-diagonal: q_i * sim(i,j) * q_j
    // Orthogonal vectors have 0 similarity
    expect(kernel[0]![1]).toBeCloseTo(0);
    expect(kernel[1]![0]).toBeCloseTo(0);
  });

  it('should handle custom similarity function', () => {
    const candidates: DPPCandidate[] = [
      { id: 'a', quality: 0.9, features: [1, 2, 3] },
      { id: 'b', quality: 0.8, features: [4, 5, 6] },
      { id: 'c', quality: 0.7, features: [1, 2, 4] },
    ];

    // Custom similarity: Euclidean distance based
    const customSim = (a: number[], b: number[]): number => {
      let sumSq = 0;
      for (let i = 0; i < a.length; i++) {
        sumSq += (a[i]! - b[i]!) ** 2;
      }
      return 1 / (1 + Math.sqrt(sumSq));
    };

    const selected = diversifier.diversify(candidates, 2, customSim);
    expect(selected).toHaveLength(2);
  });

  it('should select items with higher quality when equally diverse', () => {
    const candidates: DPPCandidate[] = [
      { id: 'high', quality: 0.95, features: [1, 0, 0] },
      { id: 'low', quality: 0.1, features: [0, 1, 0] },
      { id: 'medium', quality: 0.5, features: [0, 0, 1] },
    ];

    const selected = diversifier.diversify(candidates, 2);
    const ids = selected.map((s) => s.id);

    // Should prefer higher quality items
    expect(ids).toContain('high');
  });

  it('should handle larger candidate sets', () => {
    const candidates = makeCandidates(20);
    const selected = diversifier.diversify(candidates, 5);

    expect(selected).toHaveLength(5);
    // All selected items should be unique
    const ids = new Set(selected.map((s) => s.id));
    expect(ids.size).toBe(5);
  });
});
