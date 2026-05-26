// ============================================================================
// Chaos Experiments - Litmus-style Experiment Templates
// ============================================================================

import { ChaosEngine } from './core/chaos-engineering';
import { ChaosExperiment, SteadyStateHypothesis, ExperimentResult } from './types';

export class ChaosExperimentRunner {
  private engine: ChaosEngine;

  constructor() {
    this.engine = new ChaosEngine();
  }

  /**
   * Create a network delay experiment for a target service.
   */
  networkDelay(targetService: string, delayMs: number, duration: number): ChaosExperiment {
    return this.engine.createExperiment(
      `network-delay-${targetService}`,
      'latency',
      {
        latencyMs: delayMs,
        latencyDistribution: 'fixed',
        targetServices: [targetService],
      },
      50,
      duration,
    );
  }

  /**
   * Create a pod kill experiment for a target service.
   */
  podKill(targetService: string, gracePeriod: number): ChaosExperiment {
    return this.engine.createExperiment(
      `pod-kill-${targetService}`,
      'kill',
      {
        targetServices: [targetService],
        latencyMs: gracePeriod,
      },
      100,
      gracePeriod,
    );
  }

  /**
   * Create a disk fill experiment for a target service.
   */
  diskFill(targetService: string, fillPercentage: number): ChaosExperiment {
    return this.engine.createExperiment(
      `disk-fill-${targetService}`,
      'resource',
      {
        resourceType: 'memory',
        resourceAmount: fillPercentage,
        targetServices: [targetService],
      },
      fillPercentage,
      60000,
    );
  }

  /**
   * Create a CPU stress experiment for a target service.
   */
  cpuStress(targetService: string, loadPercentage: number): ChaosExperiment {
    return this.engine.createExperiment(
      `cpu-stress-${targetService}`,
      'resource',
      {
        resourceType: 'cpu',
        resourceAmount: loadPercentage,
        targetServices: [targetService],
      },
      loadPercentage,
      60000,
    );
  }

  /**
   * Start a specific experiment by ID.
   */
  runExperiment(experimentId: string): boolean {
    return this.engine.startExperiment(experimentId);
  }

  /**
   * Verify steady state hypotheses after an experiment.
   */
  verifySteadyState(
    experimentId: string,
    hypotheses: SteadyStateHypothesis[],
  ): ExperimentResult | null {
    this.engine.setHypothesis(experimentId, hypotheses);
    return this.engine.stopExperiment(experimentId);
  }

  /**
   * Get experiment by ID.
   */
  getExperiment(experimentId: string): ChaosExperiment | null {
    return this.engine.getExperiment(experimentId);
  }

  /**
   * Get all experiments.
   */
  getExperiments(): ChaosExperiment[] {
    return this.engine.getExperiments();
  }

  /**
   * Get experiment history.
   */
  getHistory(): ExperimentResult[] {
    return this.engine.getHistory();
  }

  /**
   * Get the underlying chaos engine.
   */
  getEngine(): ChaosEngine {
    return this.engine;
  }
}
