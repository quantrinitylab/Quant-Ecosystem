// ============================================================================
// ML Pipeline - AutoML Pipeline
// ============================================================================

import { HyperParameter, CrossValidationResult, AutoMLConfig, TrialResult } from '../types';
import { postJson, readEnvUrl, warnServingFallback } from './serving';

/**
 * Real AutoML search backend (e.g. SageMaker AutoPilot or a hosted tuning
 * service). When configured, searchServed delegates the hyper-parameter search
 * to the backend; otherwise the in-process naive random search is used.
 */
export interface AutoMLBackend {
  search(config: AutoMLConfig): Promise<TrialResult[]>;
  isAvailable(): boolean;
}

function asRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
}

function parseTrial(raw: unknown, fallbackId: number): TrialResult {
  const obj = asRecord(raw);
  const status = obj['status'];
  const validStatus: TrialResult['status'] =
    status === 'completed' || status === 'failed' || status === 'terminated' ? status : 'completed';
  const configRaw = asRecord(obj['config']);
  const config: Record<string, number | string> = {};
  for (const [key, value] of Object.entries(configRaw)) {
    if (typeof value === 'number' || typeof value === 'string') {
      config[key] = value;
    }
  }
  return {
    trialId: typeof obj['trialId'] === 'number' ? obj['trialId'] : fallbackId,
    config,
    metric: typeof obj['metric'] === 'number' ? obj['metric'] : 0,
    duration: typeof obj['duration'] === 'number' ? obj['duration'] : 0,
    status: validStatus,
  };
}

/**
 * HTTP-backed AutoML search backend. Posts the search configuration to a hosted
 * tuning service (configured via AUTOML_URL) and parses the returned trials.
 */
export class HttpAutoMLBackend implements AutoMLBackend {
  private readonly url: string;

  constructor(url: string) {
    this.url = url;
  }

  isAvailable(): boolean {
    return this.url.length > 0;
  }

  async search(config: AutoMLConfig): Promise<TrialResult[]> {
    const raw = await postJson<unknown>(this.url, { config });
    const obj = asRecord(raw);
    const list = Array.isArray(raw)
      ? raw
      : Array.isArray(obj['trials'])
        ? (obj['trials'] as unknown[])
        : [];
    return list.map((item, i) => parseTrial(item, i));
  }
}

function createAutoMLBackendFromEnv(): AutoMLBackend | null {
  const url = readEnvUrl('AUTOML_URL');
  return url ? new HttpAutoMLBackend(url) : null;
}

/**
 * @simulated The in-process grid/random search and cross-validation are a NAIVE
 * pure-JS AutoML implementation used as a fallback. When a real AutoMLBackend is
 * configured (injected, or auto-created from AUTOML_URL), searchServed delegates
 * the search to it and falls back to the naive random search on error.
 * Production path: SageMaker AutoPilot or an equivalent hosted tuning service.
 */
export class AutoMLPipeline {
  private config: AutoMLConfig;
  private trials: TrialResult[] = [];
  private bestTrial: TrialResult | null = null;
  private trialCounter: number = 0;
  private earlyTerminatedCount: number = 0;
  private readonly backend: AutoMLBackend | null;

  constructor(config: AutoMLConfig, backend?: AutoMLBackend | null) {
    this.config = config;
    this.backend = backend ?? createAutoMLBackendFromEnv();
  }

  /** Whether a real AutoML search backend is configured and available. */
  isServed(): boolean {
    return this.backend !== null && this.backend.isAvailable();
  }

  /**
   * Run the hyper-parameter search via the served backend when configured,
   * falling back to the in-process random search on absence or error. Returned
   * trials are merged into the pipeline state (trials, best trial, counters).
   */
  async searchServed(
    evaluateFn: (params: Record<string, number | string>) => number,
  ): Promise<TrialResult[]> {
    if (this.backend && this.backend.isAvailable()) {
      try {
        const trials = await this.backend.search(this.config);
        for (const trial of trials) {
          this.trials.push(trial);
          this.trialCounter = Math.max(this.trialCounter, trial.trialId + 1);
          if (trial.status === 'terminated') {
            this.earlyTerminatedCount++;
          }
          if (
            trial.status === 'completed' &&
            (!this.bestTrial || this.isBetter(trial.metric, this.bestTrial.metric))
          ) {
            this.bestTrial = trial;
          }
        }
        return trials;
      } catch (error) {
        warnServingFallback('automl-pipeline', 'search', error);
      }
    }
    return this.randomSearch(evaluateFn);
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
