// ============================================================================
// QuantAds - Audience Lookalike Service
// Find similar audiences based on traits and behavior patterns
// ============================================================================

export interface Audience {
  id: string;
  name: string;
  size: number;
  traits: Record<string, number>;
}

export interface LookalikeAudience {
  id: string;
  sourceAudienceId: string;
  expansionFactor: number;
  estimatedSize: number;
  matchScore: number;
  createdAt: number;
}

export class AudienceLookalikeService {
  private audiences: Map<string, Audience> = new Map();
  private lookalikes: Map<string, LookalikeAudience> = new Map();
  private idCounter = 0;

  private generateId(prefix: string): string {
    this.idCounter += 1;
    return `${prefix}-${this.idCounter}`;
  }

  addAudience(name: string, size: number, traits: Record<string, number>): Audience {
    const audience: Audience = {
      id: this.generateId('aud'),
      name,
      size,
      traits,
    };
    this.audiences.set(audience.id, audience);
    return audience;
  }

  createLookalike(sourceAudienceId: string, expansionFactor: number): LookalikeAudience | null {
    const source = this.audiences.get(sourceAudienceId);
    if (!source) return null;

    const lookalike: LookalikeAudience = {
      id: this.generateId('lal'),
      sourceAudienceId,
      expansionFactor,
      estimatedSize: Math.floor(source.size * expansionFactor),
      matchScore: Math.max(0, 1 - (expansionFactor - 1) * 0.15),
      createdAt: Date.now(),
    };
    this.lookalikes.set(lookalike.id, lookalike);
    return lookalike;
  }

  getMatchScore(sourceId: string, candidateTraits: Record<string, number>): number {
    const source = this.audiences.get(sourceId);
    if (!source) return 0;

    const sourceTraits = source.traits;
    const keys = new Set([...Object.keys(sourceTraits), ...Object.keys(candidateTraits)]);
    let sumSquaredDiff = 0;
    let count = 0;

    for (const key of keys) {
      const sVal = sourceTraits[key] ?? 0;
      const cVal = candidateTraits[key] ?? 0;
      sumSquaredDiff += (sVal - cVal) ** 2;
      count += 1;
    }

    if (count === 0) return 1;
    const avgDiff = Math.sqrt(sumSquaredDiff / count);
    return Math.max(0, 1 - avgDiff);
  }

  estimateReach(sourceAudienceId: string, expansionFactor: number): number {
    const source = this.audiences.get(sourceAudienceId);
    if (!source) return 0;
    return Math.floor(source.size * expansionFactor);
  }

  getLookalikes(sourceAudienceId: string): LookalikeAudience[] {
    const results: LookalikeAudience[] = [];
    for (const la of this.lookalikes.values()) {
      if (la.sourceAudienceId === sourceAudienceId) {
        results.push(la);
      }
    }
    return results;
  }

  deleteLookalike(id: string): boolean {
    return this.lookalikes.delete(id);
  }

  getSourceAudience(id: string): Audience | null {
    return this.audiences.get(id) ?? null;
  }
}
