// ============================================================================
// Chaos Engineering - Fault Injection and Resilience Testing
// ============================================================================

import {
  ChaosExperiment,
  FaultType,
  FaultConfig,
  SteadyStateHypothesis,
  ExperimentResult,
} from '../types';

interface ExperimentSchedule {
  experimentId: string;
  startTime: number;
  endTime: number;
  recurring: boolean;
  intervalMs: number;
}

export class ChaosEngine {
  private experiments: Map<string, ChaosExperiment> = new Map();
  private schedules: Map<string, ExperimentSchedule> = new Map();
  private history: ExperimentResult[] = [];
  private hypotheses: Map<string, SteadyStateHypothesis[]> = new Map();
  private globalKillSwitch: boolean = false;
  private maxFaultPercentage: number = 50;
  private maxDuration: number = 3600000; // 1 hour
  private interceptedCalls: number = 0;
  private faultedCalls: number = 0;
  private experimentCounter: number = 0;

  constructor() {}

  // Create a new chaos experiment
  createExperiment(
    name: string,
    type: FaultType,
    config: FaultConfig,
    blastRadius: number = 10,
    duration: number = 60000,
  ): ChaosExperiment {
    // Safety limits
    blastRadius = Math.min(blastRadius, this.maxFaultPercentage);
    duration = Math.min(duration, this.maxDuration);

    const experiment: ChaosExperiment = {
      id: `chaos_${++this.experimentCounter}_${Date.now().toString(36)}`,
      name,
      type,
      config,
      blastRadius,
      duration,
      active: false,
      startTime: null,
      endTime: null,
    };

    this.experiments.set(experiment.id, experiment);
    return experiment;
  }

  // Start an experiment
  startExperiment(experimentId: string): boolean {
    if (this.globalKillSwitch) return false;

    const experiment = this.experiments.get(experimentId);
    if (!experiment || experiment.active) return false;

    experiment.active = true;
    experiment.startTime = Date.now();
    experiment.endTime = null;

    // Auto-stop after duration
    setTimeout(() => {
      this.stopExperiment(experimentId);
    }, experiment.duration);

    return true;
  }

  // Stop an experiment
  stopExperiment(experimentId: string): ExperimentResult | null {
    const experiment = this.experiments.get(experimentId);
    if (!experiment || !experiment.active) return null;

    experiment.active = false;
    experiment.endTime = Date.now();

    // Validate hypothesis if defined
    const hypotheses = this.hypotheses.get(experimentId) || [];
    const hypothesisValid =
      hypotheses.length === 0 || hypotheses.every((h) => this.validateHypothesis(h));

    const result: ExperimentResult = {
      experimentId,
      startTime: experiment.startTime!,
      endTime: experiment.endTime,
      hypothesisValid,
      observations: this.generateObservations(experiment),
      metrics: {
        interceptedCalls: this.interceptedCalls,
        faultedCalls: this.faultedCalls,
        blastRadius: experiment.blastRadius,
        duration: experiment.endTime - experiment.startTime!,
      },
    };

    this.history.push(result);
    return result;
  }

  // Apply fault injection to a function call
  async injectFault<T>(experimentId: string, fn: () => Promise<T>): Promise<T> {
    const experiment = this.experiments.get(experimentId);
    if (!experiment || !experiment.active || this.globalKillSwitch) {
      return fn();
    }

    this.interceptedCalls++;

    // Check blast radius (probability of fault injection)
    if (Math.random() * 100 > experiment.blastRadius) {
      return fn();
    }

    this.faultedCalls++;

    switch (experiment.type) {
      case 'error':
        return this.injectError(experiment.config);
      case 'latency':
        return this.injectLatency(experiment.config, fn);
      case 'kill':
        return this.injectKill(experiment.config);
      case 'partition':
        return this.injectPartition(experiment.config, fn);
      case 'resource':
        return this.injectResource(experiment.config, fn);
      default:
        return fn();
    }
  }

  // Inject error fault
  private async injectError<T>(config: FaultConfig): Promise<T> {
    const errorRate = config.errorRate ?? 100;
    if (Math.random() * 100 < errorRate) {
      throw new Error(config.errorMessage || 'Chaos: Injected error');
    }
    return undefined as any;
  }

  // Inject latency fault
  private async injectLatency<T>(config: FaultConfig, fn: () => Promise<T>): Promise<T> {
    const delay = this.calculateLatency(config);
    await this.sleep(delay);
    return fn();
  }

  // Calculate latency based on distribution
  private calculateLatency(config: FaultConfig): number {
    const baseLatency = config.latencyMs || 1000;

    switch (config.latencyDistribution) {
      case 'fixed':
        return baseLatency;
      case 'uniform':
        return Math.random() * baseLatency * 2;
      case 'normal':
        return this.normalDistribution(baseLatency, baseLatency * 0.3);
      default:
        return baseLatency;
    }
  }

  // Normal distribution using Box-Muller transform
  private normalDistribution(mean: number, stddev: number): number {
    const u1 = Math.random();
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return Math.max(0, mean + z * stddev);
  }

  // Inject kill (simulate process crash)
  private async injectKill<T>(_config: FaultConfig): Promise<T> {
    throw new Error('Chaos: Process killed (simulated crash)');
  }

  // Inject network partition
  private async injectPartition<T>(config: FaultConfig, _fn: () => Promise<T>): Promise<T> {
    const targetServices = config.targetServices || [];
    if (targetServices.length > 0) {
      throw new Error(`Chaos: Network partition - cannot reach ${targetServices.join(', ')}`);
    }
    throw new Error('Chaos: Network partition - connection refused');
  }

  // Inject resource exhaustion
  private async injectResource<T>(config: FaultConfig, fn: () => Promise<T>): Promise<T> {
    const resourceType = config.resourceType || 'memory';
    const amount = config.resourceAmount || 100;

    if (resourceType === 'memory') {
      // Simulate memory pressure by creating large temporary array
      const pressure: number[] = new Array(amount * 1024).fill(0);
      const result = await fn();
      // Release reference
      pressure.length = 0;
      return result;
    } else if (resourceType === 'cpu') {
      // Simulate CPU pressure with tight loop
      const end = Date.now() + amount;
      while (Date.now() < end) {
        Math.random(); // Busy loop
      }
      return fn();
    }

    return fn();
  }

  // Set steady state hypothesis for an experiment
  setHypothesis(experimentId: string, hypotheses: SteadyStateHypothesis[]): void {
    this.hypotheses.set(experimentId, hypotheses);
  }

  // Validate a hypothesis
  private validateHypothesis(hypothesis: SteadyStateHypothesis): boolean {
    // In real implementation, this would check actual metrics
    // Here we validate based on the definition structure
    return hypothesis.tolerance >= 0 && hypothesis.value >= 0;
  }

  // Generate observations from experiment
  private generateObservations(experiment: ChaosExperiment): string[] {
    const observations: string[] = [];
    const duration =
      experiment.endTime && experiment.startTime ? experiment.endTime - experiment.startTime : 0;

    observations.push(`Experiment '${experiment.name}' ran for ${duration}ms`);
    observations.push(`Fault type: ${experiment.type}`);
    observations.push(`Blast radius: ${experiment.blastRadius}%`);
    observations.push(`Total intercepted calls: ${this.interceptedCalls}`);
    observations.push(`Total faulted calls: ${this.faultedCalls}`);

    if (this.interceptedCalls > 0) {
      const actualFaultRate = (this.faultedCalls / this.interceptedCalls) * 100;
      observations.push(`Actual fault rate: ${actualFaultRate.toFixed(1)}%`);
    }

    return observations;
  }

  // Schedule an experiment
  scheduleExperiment(
    experimentId: string,
    startTime: number,
    recurring: boolean = false,
    intervalMs: number = 0,
  ): void {
    const schedule: ExperimentSchedule = {
      experimentId,
      startTime,
      endTime: 0, // Will be set when experiment starts
      recurring,
      intervalMs,
    };
    this.schedules.set(experimentId, schedule);

    // Set timer to start experiment
    const delay = Math.max(0, startTime - Date.now());
    setTimeout(() => {
      this.startExperiment(experimentId);
    }, delay);
  }

  // Activate global kill switch (stop ALL experiments)
  activateKillSwitch(): void {
    this.globalKillSwitch = true;
    // Stop all active experiments
    for (const [id, experiment] of this.experiments) {
      if (experiment.active) {
        this.stopExperiment(id);
      }
    }
  }

  // Deactivate kill switch
  deactivateKillSwitch(): void {
    this.globalKillSwitch = false;
  }

  // Check if kill switch is active
  isKillSwitchActive(): boolean {
    return this.globalKillSwitch;
  }

  // Set safety limits
  setSafetyLimits(maxFaultPercentage: number, maxDuration: number): void {
    this.maxFaultPercentage = Math.min(maxFaultPercentage, 100);
    this.maxDuration = maxDuration;
  }

  // Get experiment by ID
  getExperiment(id: string): ChaosExperiment | null {
    return this.experiments.get(id) || null;
  }

  // Get all experiments
  getExperiments(): ChaosExperiment[] {
    return Array.from(this.experiments.values());
  }

  // Get active experiments
  getActiveExperiments(): ChaosExperiment[] {
    return Array.from(this.experiments.values()).filter((e) => e.active);
  }

  // Get experiment history
  getHistory(): ExperimentResult[] {
    return [...this.history];
  }

  // Get stats
  getStats(): {
    total: number;
    active: number;
    completed: number;
    intercepted: number;
    faulted: number;
  } {
    return {
      total: this.experiments.size,
      active: this.getActiveExperiments().length,
      completed: this.history.length,
      intercepted: this.interceptedCalls,
      faulted: this.faultedCalls,
    };
  }

  // Rollback all active experiments immediately
  rollbackAll(): ExperimentResult[] {
    const results: ExperimentResult[] = [];
    for (const [id, experiment] of this.experiments) {
      if (experiment.active) {
        const result = this.stopExperiment(id);
        if (result) results.push(result);
      }
    }
    return results;
  }

  // Sleep utility
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Reset
  reset(): void {
    this.rollbackAll();
    this.experiments.clear();
    this.schedules.clear();
    this.history = [];
    this.hypotheses.clear();
    this.globalKillSwitch = false;
    this.interceptedCalls = 0;
    this.faultedCalls = 0;
    this.experimentCounter = 0;
  }
}
