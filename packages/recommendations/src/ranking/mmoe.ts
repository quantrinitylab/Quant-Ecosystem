// ============================================================================
// MMoE Ranker - Multi-gate Mixture-of-Experts for multi-objective ranking
// ============================================================================

export type ObjectiveName = 'engagement' | 'retention' | 'wellbeing';

export type ExpertFn = (features: number[]) => number[];
export type GatingFn = (features: number[]) => number[];

interface Expert {
  name: string;
  fn: ExpertFn;
}

interface ObjectiveConfig {
  name: ObjectiveName;
  weight: number;
  towerFn?: (input: number[]) => number;
}

/**
 * @simulated This implementation is a simulation/prototype.
 * Classification: NAIVE
 * Reason: Multi-gate Mixture-of-Experts in pure JS with untrained expert functions
 * Production path: Train MMoE model on engagement/retention data, serve via ML framework
 */
export class MMoERanker {
  private experts: Expert[] = [];
  private objectives: ObjectiveConfig[] = [];
  private gatingFns: Map<ObjectiveName, GatingFn> = new Map();

  addExpert(name: string, expertFn: ExpertFn): void {
    this.experts.push({ name, fn: expertFn });
  }

  setObjectives(objectives: Array<{ name: ObjectiveName; weight: number }>): void {
    this.objectives = objectives.map((obj) => ({
      ...obj,
      towerFn: undefined,
    }));
  }

  setGating(objective: ObjectiveName, gateFn: GatingFn): void {
    this.gatingFns.set(objective, gateFn);
  }

  forward(features: number[]): Record<ObjectiveName, number> {
    if (this.experts.length === 0) {
      throw new Error('No experts configured. Call addExpert() first.');
    }

    if (this.objectives.length === 0) {
      throw new Error('No objectives configured. Call setObjectives() first.');
    }

    // Run all experts
    const expertOutputs = this.experts.map((expert) => expert.fn(features));

    const result: Record<string, number> = {};

    for (const objective of this.objectives) {
      // Get gating weights for this objective
      const gateFn = this.gatingFns.get(objective.name);
      const gateWeights = gateFn
        ? gateFn(features)
        : this.defaultGating(features, this.experts.length);

      // Weighted sum of expert outputs via gating
      const mixedOutput = this.mixExperts(expertOutputs, gateWeights);

      // Task-specific tower: aggregate mixed output to scalar
      const score = this.taskTower(mixedOutput);
      result[objective.name] = score;
    }

    return result as Record<ObjectiveName, number>;
  }

  private defaultGating(_features: number[], numExperts: number): number[] {
    // Uniform gating by default (softmax over equal values)
    const weight = 1 / numExperts;
    return new Array(numExperts).fill(weight);
  }

  private mixExperts(expertOutputs: number[][], gateWeights: number[]): number[] {
    if (expertOutputs.length === 0) return [];

    const outputDim = expertOutputs[0]!.length;
    const mixed = new Array<number>(outputDim).fill(0);

    // Normalize gate weights (softmax-like)
    const totalWeight = gateWeights.reduce((s, w) => s + Math.abs(w), 0);
    const normalizedWeights =
      totalWeight > 0 ? gateWeights.map((w) => Math.abs(w) / totalWeight) : gateWeights;

    for (let i = 0; i < expertOutputs.length; i++) {
      const weight = normalizedWeights[i] ?? 0;
      for (let j = 0; j < outputDim; j++) {
        mixed[j]! += (expertOutputs[i]![j] ?? 0) * weight;
      }
    }

    return mixed;
  }

  private taskTower(input: number[]): number {
    // Simple aggregation: sigmoid of mean
    const mean = input.length > 0 ? input.reduce((s, v) => s + v, 0) / input.length : 0;
    return 1 / (1 + Math.exp(-mean));
  }

  getExpertCount(): number {
    return this.experts.length;
  }

  getObjectiveCount(): number {
    return this.objectives.length;
  }
}
