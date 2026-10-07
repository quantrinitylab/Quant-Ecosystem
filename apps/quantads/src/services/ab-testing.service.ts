// ============================================================================
// QuantAds - A/B Testing Service
// Create, manage, and analyze split tests with statistical significance
// ============================================================================

export interface Variant {
  id: string;
  name: string;
  content: Record<string, string>;
  impressions: number;
  conversions: number;
}

export interface ABTest {
  id: string;
  name: string;
  variants: Variant[];
  trafficSplit: number[];
  status: 'draft' | 'running' | 'paused' | 'completed';
  winnerId?: string;
  startedAt?: number;
}

export class ABTestingService {
  private tests: Map<string, ABTest> = new Map();
  private idCounter = 0;

  private generateId(prefix: string): string {
    this.idCounter += 1;
    return `${prefix}-${this.idCounter}`;
  }

  createTest(
    name: string,
    variants: Omit<Variant, 'id' | 'impressions' | 'conversions'>[],
    trafficSplit: number[],
  ): ABTest {
    const fullVariants: Variant[] = variants.map((v) => ({
      ...v,
      id: this.generateId('variant'),
      impressions: 0,
      conversions: 0,
    }));

    const test: ABTest = {
      id: this.generateId('test'),
      name,
      variants: fullVariants,
      trafficSplit,
      status: 'draft',
    };
    this.tests.set(test.id, test);
    return test;
  }

  startTest(testId: string): ABTest | null {
    const test = this.tests.get(testId);
    if (!test || test.status === 'running') return null;
    test.status = 'running';
    test.startedAt = Date.now();
    return test;
  }

  pauseTest(testId: string): ABTest | null {
    const test = this.tests.get(testId);
    if (!test || test.status !== 'running') return null;
    test.status = 'paused';
    return test;
  }

  getResults(
    testId: string,
  ): { variants: Variant[]; winner: Variant | null; confidence: number } | null {
    const test = this.tests.get(testId);
    if (!test) return null;

    let winner: Variant | null = null;
    let confidence = 0;

    if (test.variants.length >= 2) {
      const sorted = [...test.variants].sort((a, b) => {
        const rateA = a.impressions > 0 ? a.conversions / a.impressions : 0;
        const rateB = b.impressions > 0 ? b.conversions / b.impressions : 0;
        return rateB - rateA;
      });
      const first = sorted[0];
      const second = sorted[1];
      if (first && second) {
        confidence = this.calculateSignificance(first, second);
        if (confidence >= 0.95) {
          winner = first;
        }
      }
    }

    return { variants: test.variants, winner, confidence };
  }

  declareWinner(testId: string, variantId: string): ABTest | null {
    const test = this.tests.get(testId);
    if (!test) return null;
    const variant = test.variants.find((v) => v.id === variantId);
    if (!variant) return null;
    test.status = 'completed';
    test.winnerId = variantId;
    return test;
  }

  recordImpression(testId: string, variantId: string): void {
    const test = this.tests.get(testId);
    if (!test) return;
    const variant = test.variants.find((v) => v.id === variantId);
    if (variant) variant.impressions += 1;
  }

  recordConversion(testId: string, variantId: string): void {
    const test = this.tests.get(testId);
    if (!test) return;
    const variant = test.variants.find((v) => v.id === variantId);
    if (variant) variant.conversions += 1;
  }

  calculateSignificance(variantA: Variant, variantB: Variant): number {
    if (variantA.impressions === 0 || variantB.impressions === 0) return 0;

    const rateA = variantA.conversions / variantA.impressions;
    const rateB = variantB.conversions / variantB.impressions;
    const seA = Math.sqrt((rateA * (1 - rateA)) / variantA.impressions);
    const seB = Math.sqrt((rateB * (1 - rateB)) / variantB.impressions);
    const seDiff = Math.sqrt(seA * seA + seB * seB);

    if (seDiff === 0) return 0;

    const zScore = Math.abs(rateA - rateB) / seDiff;
    // Approximate normal CDF for confidence
    const confidence = 1 - Math.exp(-0.5 * zScore * zScore);
    return Math.min(confidence, 0.9999);
  }
}
