// ============================================================================
// Score Fusion - Weighted ensemble of multiple rankers
// ============================================================================

export type ScoreFn = (candidateId: string) => number;

interface RankerEntry {
  name: string;
  weight: number;
  scoreFn: ScoreFn;
}

export interface FusedCandidate {
  id: string;
  finalScore: number;
  scores: Record<string, number>;
}

export class ScoreFusion {
  private rankers: RankerEntry[] = [];

  addRanker(name: string, weight: number, scoreFn: ScoreFn): void {
    this.rankers.push({ name, weight, scoreFn });
  }

  fuse(candidateIds: string[]): FusedCandidate[] {
    if (this.rankers.length === 0) {
      return candidateIds.map((id) => ({ id, finalScore: 0, scores: {} }));
    }

    // Collect raw scores from each ranker
    const rawScores: Map<string, Record<string, number>> = new Map();
    for (const id of candidateIds) {
      const scores: Record<string, number> = {};
      for (const ranker of this.rankers) {
        scores[ranker.name] = ranker.scoreFn(id);
      }
      rawScores.set(id, scores);
    }

    // Normalize scores per ranker (min-max normalization)
    const normalized = this.normalizeScores(rawScores, candidateIds);

    // Apply weighted fusion
    const results: FusedCandidate[] = candidateIds.map((id) => {
      const normalizedScores = normalized.get(id)!;
      let finalScore = 0;
      let totalWeight = 0;

      for (const ranker of this.rankers) {
        finalScore += (normalizedScores[ranker.name] ?? 0) * ranker.weight;
        totalWeight += ranker.weight;
      }

      if (totalWeight > 0) {
        finalScore /= totalWeight;
      }

      return {
        id,
        finalScore,
        scores: rawScores.get(id)!,
      };
    });

    results.sort((a, b) => b.finalScore - a.finalScore);
    return results;
  }

  private normalizeScores(
    rawScores: Map<string, Record<string, number>>,
    candidateIds: string[],
  ): Map<string, Record<string, number>> {
    // Find min/max per ranker
    const mins: Record<string, number> = {};
    const maxs: Record<string, number> = {};

    for (const ranker of this.rankers) {
      mins[ranker.name] = Infinity;
      maxs[ranker.name] = -Infinity;
    }

    for (const id of candidateIds) {
      const scores = rawScores.get(id)!;
      for (const ranker of this.rankers) {
        const score = scores[ranker.name]!;
        if (score < mins[ranker.name]!) mins[ranker.name] = score;
        if (score > maxs[ranker.name]!) maxs[ranker.name] = score;
      }
    }

    // Normalize to [0, 1]
    const normalized = new Map<string, Record<string, number>>();
    for (const id of candidateIds) {
      const scores = rawScores.get(id)!;
      const normalizedScores: Record<string, number> = {};
      for (const ranker of this.rankers) {
        const range = maxs[ranker.name]! - mins[ranker.name]!;
        normalizedScores[ranker.name] =
          range === 0 ? 0.5 : (scores[ranker.name]! - mins[ranker.name]!) / range;
      }
      normalized.set(id, normalizedScores);
    }

    return normalized;
  }

  getRankerCount(): number {
    return this.rankers.length;
  }

  removeRanker(name: string): boolean {
    const index = this.rankers.findIndex((r) => r.name === name);
    if (index === -1) return false;
    this.rankers.splice(index, 1);
    return true;
  }
}
