// ============================================================================
// Recommendation Pipeline - Full orchestration: retrieval -> ranking -> diversify
// ============================================================================

export interface PipelineCandidate {
  id: string;
  score: number;
  features: number[];
  source: string;
}

export interface PipelineContext {
  device: string;
  timeOfDay: string;
  sessionId: string;
}

export interface PipelineConfig {
  retrievalK: number;
  rankingK: number;
  finalK: number;
}

export type RetrievalFn = (userId: string, k: number) => PipelineCandidate[];
export type RankingFn = (candidates: PipelineCandidate[]) => PipelineCandidate[];
export type DiversityFn = (candidates: PipelineCandidate[], k: number) => PipelineCandidate[];

const DEFAULT_CONFIG: PipelineConfig = {
  retrievalK: 500,
  rankingK: 50,
  finalK: 20,
};

export class RecommendationPipeline {
  private retrievalFns: RetrievalFn[] = [];
  private rankingFn: RankingFn | null = null;
  private diversityFn: DiversityFn | null = null;
  private config: PipelineConfig;

  constructor(config?: Partial<PipelineConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  addRetrieval(fn: RetrievalFn): void {
    this.retrievalFns.push(fn);
  }

  setRanking(fn: RankingFn): void {
    this.rankingFn = fn;
  }

  setDiversity(fn: DiversityFn): void {
    this.diversityFn = fn;
  }

  recommend(userId: string, _context: PipelineContext, k?: number): PipelineCandidate[] {
    const finalK = k ?? this.config.finalK;

    // Stage 1: Retrieval - gather candidates from all sources
    let candidates: PipelineCandidate[] = [];
    for (const retrievalFn of this.retrievalFns) {
      const retrieved = retrievalFn(userId, this.config.retrievalK);
      candidates.push(...retrieved);
    }

    // Deduplicate by id, keeping highest score
    candidates = this.deduplicate(candidates);

    if (candidates.length === 0) {
      return [];
    }

    // Stage 2: Ranking
    if (this.rankingFn) {
      candidates = this.rankingFn(candidates);
    } else {
      candidates.sort((a, b) => b.score - a.score);
    }

    // Trim to ranking K
    candidates = candidates.slice(0, this.config.rankingK);

    // Stage 3: Diversification
    if (this.diversityFn) {
      candidates = this.diversityFn(candidates, finalK);
    } else {
      candidates = candidates.slice(0, finalK);
    }

    return candidates;
  }

  private deduplicate(candidates: PipelineCandidate[]): PipelineCandidate[] {
    const best = new Map<string, PipelineCandidate>();
    for (const candidate of candidates) {
      const existing = best.get(candidate.id);
      if (!existing || candidate.score > existing.score) {
        best.set(candidate.id, candidate);
      }
    }
    return [...best.values()];
  }

  getConfig(): PipelineConfig {
    return { ...this.config };
  }
}
