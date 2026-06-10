export interface Experiment {
  id: string;
  name: string;
  variants: Variant[];
  trafficSplit: number[];
  startDate: Date;
  endDate?: Date;
  status: 'draft' | 'running' | 'completed';
}

export interface Variant {
  id: string;
  name: string;
  config: Record<string, any>;
}

export interface ExperimentResult {
  experimentId: string;
  variantId: string;
  metrics: Record<string, number>;
  confidence: number;
}

export class ABTestingFramework {
  private experiments: Map<string, Experiment> = new Map();
  private results: Map<string, ExperimentResult[]> = new Map();

  createExperiment(experiment: Omit<Experiment, 'id' | 'status'>): Experiment {
    const newExperiment: Experiment = {
      ...experiment,
      id: `exp-${Date.now()}`,
      status: 'draft',
    };

    this.experiments.set(newExperiment.id, newExperiment);
    return newExperiment;
  }

  startExperiment(experimentId: string): void {
    const experiment = this.experiments.get(experimentId);
    if (experiment) {
      experiment.status = 'running';
      experiment.startDate = new Date();
    }
  }

  getVariant(experimentId: string, userId: string): Variant | null {
    const experiment = this.experiments.get(experimentId);
    if (!experiment || experiment.status !== 'running') return null;

    // Deterministic assignment based on userId
    const hash = this.hashUserId(userId);
    const bucket = hash % 100;
    let cumulative = 0;

    for (let i = 0; i < experiment.variants.length; i++) {
      cumulative += experiment.trafficSplit[i];
      if (bucket < cumulative) {
        return experiment.variants[i];
      }
    }

    return experiment.variants[0];
  }

  recordResult(experimentId: string, variantId: string, metrics: Record<string, number>) {
    const results = this.results.get(experimentId) || [];
    results.push({
      experimentId,
      variantId,
      metrics,
      confidence: 0.95, // Placeholder
    });
    this.results.set(experimentId, results);
  }

  private hashUserId(userId: string): number {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      hash = (hash << 5) - hash + userId.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  getExperiment(experimentId: string): Experiment | undefined {
    return this.experiments.get(experimentId);
  }
}

export const abTesting = new ABTestingFramework();
