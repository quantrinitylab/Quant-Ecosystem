// ============================================================================
// DPP Diversifier - Determinantal Point Process for result diversity
// ============================================================================

export interface DPPCandidate {
  id: string;
  quality: number;
  features: number[];
}

export type SimilarityFn = (a: number[], b: number[]) => number;

export class DPPDiversifier {
  private defaultSimilarity: SimilarityFn = (a: number[], b: number[]): number => {
    // Cosine similarity
    let dot = 0;
    let normA = 0;
    let normB = 0;
    const len = Math.min(a.length, b.length);

    for (let i = 0; i < len; i++) {
      dot += a[i]! * b[i]!;
      normA += a[i]! * a[i]!;
      normB += b[i]! * b[i]!;
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dot / denominator;
  };

  buildKernel(items: DPPCandidate[], similarityFn?: SimilarityFn): number[][] {
    const sim = similarityFn ?? this.defaultSimilarity;
    const n = items.length;
    const kernel: number[][] = [];

    for (let i = 0; i < n; i++) {
      kernel.push([]);
      for (let j = 0; j < n; j++) {
        // L_ij = q_i * S_ij * q_j (quality-weighted similarity)
        const similarity = i === j ? 1 : sim(items[i]!.features, items[j]!.features);
        kernel[i]![j] = items[i]!.quality * similarity * items[j]!.quality;
      }
    }

    return kernel;
  }

  diversify(candidates: DPPCandidate[], k: number, similarityFn?: SimilarityFn): DPPCandidate[] {
    if (candidates.length <= k) {
      return [...candidates];
    }

    const kernel = this.buildKernel(candidates, similarityFn);
    return this.greedyMapInference(candidates, kernel, k);
  }

  private greedyMapInference(
    candidates: DPPCandidate[],
    kernel: number[][],
    k: number,
  ): DPPCandidate[] {
    const n = candidates.length;
    const selected: number[] = [];
    const remaining = new Set<number>();

    for (let i = 0; i < n; i++) {
      remaining.add(i);
    }

    // Greedy selection: pick items that maximize log-det(L_S)
    for (let step = 0; step < k && remaining.size > 0; step++) {
      let bestIdx = -1;
      let bestGain = -Infinity;

      for (const idx of remaining) {
        const gain = this.computeMarginalGain(kernel, selected, idx);
        if (gain > bestGain) {
          bestGain = gain;
          bestIdx = idx;
        }
      }

      if (bestIdx === -1) break;
      selected.push(bestIdx);
      remaining.delete(bestIdx);
    }

    return selected.map((idx) => candidates[idx]!);
  }

  private computeMarginalGain(kernel: number[][], selected: number[], candidate: number): number {
    if (selected.length === 0) {
      // First item: gain is just the diagonal (quality^2)
      return kernel[candidate]![candidate]!;
    }

    // Compute marginal gain using Schur complement approximation
    // gain = L_cc - L_cS * L_SS^{-1} * L_Sc
    const diag = kernel[candidate]![candidate]!;

    // Compute penalty from similarity to already selected items
    let penalty = 0;
    for (const sel of selected) {
      const similarity = kernel[candidate]![sel]!;
      const selfSimilarity = kernel[sel]![sel]!;
      if (selfSimilarity > 0) {
        penalty += (similarity * similarity) / selfSimilarity;
      }
    }

    return diag - penalty;
  }
}
