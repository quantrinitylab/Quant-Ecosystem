// ============================================================================
// ML Pipeline - AutoML Pipeline
// ============================================================================

import { HyperParameter, CrossValidationResult, AutoMLConfig, TrialResult } from '../types';

/**
 * @simulated This implementation is a simulation/prototype.
 * Classification: NAIVE
 * Reason: Simulated AutoML pipeline in JS
 * Production path: Use SageMaker AutoPilot or similar
 */
export class AutoMLPipeline {
  private config: AutoMLConfig;
  private trials: TrialResult[] = [];
  private bestTrial: TrialResult | null = null;
  private trialCounter: number = 0;
  private earlyTerminatedCount: number = 0;

  constructor(config: AutoMLConfig) {
    this.config = config;
  }

  // Grid search: enumerate all parameter combinations
  gridSearch(evaluateFn: (params: Record<string, number | string>) => number): TrialResult[] {
    const combinations = this.generateGridCombinations(this.config.searchSpace.parameters);
    for (const params of combinations) {
      if (this.trialCounter >= this.config.searchSpace.maxTrials) break;
      const result = this.runTrial(params, evaluateFn);
      if (result) this.trials.push(result);
    }
    return this.trials;
  }

  // Random search: sample from parameter distributions
  randomSearch(evaluateFn: (params: Record<string, number | string>) => number): TrialResult[] {
    const maxTrials = this.config.searchSpace.maxTrials;
    for (let i = 0; i < maxTrials; i++) {
      const params = this.sampleRandomConfig(this.config.searchSpace.parameters);
      const result = this.runTrial(params, evaluateFn);
      if (result) this.trials.push(result);
    }
    return this.trials;
  }

  private runTrial(
    params: Record<string, number | string>,
    evaluateFn: (params: Record<string, number | string>) => number,
  ): TrialResult | null {
    const trialId = this.trialCounter++;
    const startTime = Date.now();
    try {
      const metric = evaluateFn(params);
      // Early termination: median stopping rule
      if (this.config.earlyTermination && this.shouldTerminate(metric)) {
        this.earlyTerminatedCount++;
        return {
          trialId,
          config: params,
          metric,
          duration: Date.now() - startTime,
          status: 'terminated',
        };
      }
      const result: TrialResult = {
        trialId,
        config: params,
        metric,
        duration: Date.now() - startTime,
        status: 'completed',
      };
      // Update best trial
      if (!this.bestTrial || this.isBetter(metric, this.bestTrial.metric)) {
        this.bestTrial = result;
      }
      return result;
    } catch {
      return {
        trialId,
        config: params,
        metric: this.config.maximize ? -Infinity : Infinity,
        duration: Date.now() - startTime,
        status: 'failed',
      };
    }
  }

  private shouldTerminate(metric: number): boolean {
    if (this.trials.length < 5) return false;
    const completedMetrics = this.trials
      .filter((t) => t.status === 'completed')
      .map((t) => t.metric)
      .sort((a, b) => (this.config.maximize ? b - a : a - b));
    const medianIdx = Math.floor(completedMetrics.length / 2);
    const median = completedMetrics[medianIdx] ?? 0;
    // Terminate if current metric is worse than median
    if (this.config.maximize) {
      return metric < median * 0.8;
    }
    return metric > median * 1.2;
  }

  private isBetter(a: number, b: number): boolean {
    return this.config.maximize ? a > b : a < b;
  }

  // K-fold cross-validation
  crossValidate(
    features: number[][],
    labels: number[],
    params: Record<string, number | string>,
    trainAndEvalFn: (
      trainX: number[][],
      trainY: number[],
      testX: number[][],
      testY: number[],
      params: Record<string, number | string>,
    ) => number,
    k: number = 5,
  ): CrossValidationResult {
    const n = features.length;
    const foldSize = Math.floor(n / k);
    const indices = Array.from({ length: n }, (_, i) => i);
    const scores: number[] = [];
    for (let fold = 0; fold < k; fold++) {
      const testStart = fold * foldSize;
      const testEnd = fold === k - 1 ? n : testStart + foldSize;
      const testIdx = indices.slice(testStart, testEnd);
      const trainIdx = [...indices.slice(0, testStart), ...indices.slice(testEnd)];
      const trainX = trainIdx.map((i) => features[i]!);
      const trainY = trainIdx.map((i) => labels[i]!);
      const testX = testIdx.map((i) => features[i]!);
      const testY = testIdx.map((i) => labels[i]!);
      const score = trainAndEvalFn(trainX, trainY, testX, testY, params);
      scores.push(score);
    }
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const std = Math.sqrt(scores.reduce((sum, s) => sum + (s - mean) ** 2, 0) / scores.length);
    const bestFold = this.config.maximize
      ? scores.indexOf(Math.max(...scores))
      : scores.indexOf(Math.min(...scores));
    return { folds: k, scores, mean, std, bestFold, config: params };
  }

  // Stratified K-fold (maintains class distribution)
  stratifiedCrossValidate(
    features: number[][],
    labels: number[],
    params: Record<string, number | string>,
    trainAndEvalFn: (
      trainX: number[][],
      trainY: number[],
      testX: number[][],
      testY: number[],
      params: Record<string, number | string>,
    ) => number,
    k: number = 5,
  ): CrossValidationResult {
    const classIndices: Map<number, number[]> = new Map();
    for (let i = 0; i < labels.length; i++) {
      const cls = Math.round(labels[i]!);
      if (!classIndices.has(cls)) classIndices.set(cls, []);
      classIndices.get(cls)!.push(i);
    }
    // Create stratified folds
    const folds: number[][] = Array.from({ length: k }, () => []);
    for (const [, indices] of classIndices.entries()) {
      for (let i = 0; i < indices.length; i++) {
        folds[i % k]!.push(indices[i]!);
      }
    }
    const scores: number[] = [];
    for (let fold = 0; fold < k; fold++) {
      const testIdx = folds[fold]!;
      const trainIdx: number[] = [];
      for (let f = 0; f < k; f++) {
        if (f !== fold) trainIdx.push(...folds[f]!);
      }
      const trainX = trainIdx.map((i) => features[i]!);
      const trainY = trainIdx.map((i) => labels[i]!);
      const testX = testIdx.map((i) => features[i]!);
      const testY = testIdx.map((i) => labels[i]!);
      const score = trainAndEvalFn(trainX, trainY, testX, testY, params);
      scores.push(score);
    }
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const std = Math.sqrt(scores.reduce((sum, s) => sum + (s - mean) ** 2, 0) / scores.length);
    const bestFold = this.config.maximize
      ? scores.indexOf(Math.max(...scores))
      : scores.indexOf(Math.min(...scores));
    return { folds: k, scores, mean, std, bestFold, config: params };
  }

  // Generate all grid combinations
  private generateGridCombinations(
    parameters: HyperParameter[],
  ): Record<string, number | string>[] {
    if (parameters.length === 0) return [{}];
    const paramValues: { name: string; values: (number | string)[] }[] = [];
    for (const param of parameters) {
      const values: (number | string)[] = [];
      if (param.type === 'categorical' && param.choices) {
        values.push(...param.choices);
      } else if (param.type === 'discrete' && param.range) {
        const step = param.step ?? 1;
        for (let v = param.range[0]!; v <= param.range[1]!; v += step) {
          values.push(v);
        }
      } else if (param.type === 'continuous' && param.range) {
        // Discretize continuous into 5 points for grid search
        const steps = 5;
        const lo = param.range[0]!;
        const hi = param.range[1]!;
        for (let i = 0; i <= steps; i++) {
          if (param.logScale) {
            values.push(Math.exp(Math.log(lo) + ((Math.log(hi) - Math.log(lo)) * i) / steps));
          } else {
            values.push(lo + ((hi - lo) * i) / steps);
          }
        }
      }
      paramValues.push({ name: param.name, values });
    }
    // Cartesian product
    let combinations: Record<string, number | string>[] = [{}];
    for (const { name, values } of paramValues) {
      const newCombinations: Record<string, number | string>[] = [];
      for (const combo of combinations) {
        for (const value of values) {
          newCombinations.push({ ...combo, [name]: value });
        }
      }
      combinations = newCombinations;
    }
    return combinations;
  }

  // Sample a random configuration
  private sampleRandomConfig(parameters: HyperParameter[]): Record<string, number | string> {
    const config: Record<string, number | string> = {};
    for (const param of parameters) {
      if (param.type === 'categorical' && param.choices) {
        config[param.name] = param.choices[Math.floor(Math.random() * param.choices.length)]!;
      } else if (param.range) {
        const [lo, hi] = param.range;
        if (param.logScale) {
          config[param.name] = Math.exp(
            Math.log(lo!) + Math.random() * (Math.log(hi!) - Math.log(lo!)),
          );
        } else if (param.type === 'discrete') {
          const step = param.step ?? 1;
          const steps = Math.floor((hi! - lo!) / step);
          config[param.name] = lo! + Math.floor(Math.random() * (steps + 1)) * step;
        } else {
          config[param.name] = lo! + Math.random() * (hi! - lo!);
        }
      }
    }
    return config;
  }

  getBestTrial(): TrialResult | null {
    return this.bestTrial;
  }

  getAllTrials(): TrialResult[] {
    return this.trials;
  }

  getCompletedTrials(): TrialResult[] {
    return this.trials.filter((t) => t.status === 'completed');
  }

  getTrialCount(): number {
    return this.trialCounter;
  }

  getEarlyTerminatedCount(): number {
    return this.earlyTerminatedCount;
  }

  getProgress(): { completed: number; total: number; bestMetric: number } {
    return {
      completed: this.trialCounter,
      total: this.config.searchSpace.maxTrials,
      bestMetric: this.bestTrial?.metric ?? (this.config.maximize ? -Infinity : Infinity),
    };
  }

  reset(): void {
    this.trials = [];
    this.bestTrial = null;
    this.trialCounter = 0;
    this.earlyTerminatedCount = 0;
  }
}
