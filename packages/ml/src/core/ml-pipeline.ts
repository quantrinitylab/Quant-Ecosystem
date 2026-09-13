import { randomUUID } from 'node:crypto';

// ============================================================================
// @quant/ml — real (small) ML pipeline
// ============================================================================
//
// Previously `predict()` returned `Math.random()` and the "training" loop just
// slept and then reported hard-coded metrics (0.92/0.89/0.94). Both are now
// real, deterministic computations:
//
//   * predict  — logistic-regression forward pass over the supplied features
//                using the model's registered weights/bias (or deterministic
//                defaults when no model is registered). Same input -> same
//                output; confidence comes from the decision margin.
//   * training — actual batch gradient descent over the model's `samples`
//                (labelled feature vectors), then metrics (accuracy, precision,
//                recall) computed from real predictions on that data. A model
//                with no samples fails loudly instead of reporting fake metrics.

export interface ModelConfig {
  name: string;
  version: string;
  type: 'recommendation' | 'moderation' | 'nlp' | 'vision';
  parameters: Record<string, any>;
}

/** One labelled training example: numeric features + binary label. */
export interface TrainingSample {
  features: number[];
  label: number;
}

export interface TrainingJob {
  id: string;
  modelName: string;
  status: 'queued' | 'training' | 'completed' | 'failed';
  progress: number;
  metrics?: Record<string, number>;
  startedAt: Date;
  completedAt?: Date;
}

const DEFAULT_EPOCHS = 500;
const DEFAULT_LEARNING_RATE = 0.5;

/** Per-feature standardization parameters learned during training. */
interface FeatureScaler {
  mean: number[];
  std: number[];
}

function sigmoid(z: number): number {
  if (z >= 0) {
    return 1 / (1 + Math.exp(-z));
  }
  const e = Math.exp(z);
  return e / (1 + e);
}

function dot(weights: number[], features: number[]): number {
  let sum = 0;
  for (let i = 0; i < weights.length && i < features.length; i++) {
    sum += (weights[i] ?? 0) * (features[i] ?? 0);
  }
  return sum;
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/** Coerce an untrusted `parameters.samples` value into validated samples. */
function extractSamples(raw: unknown): TrainingSample[] {
  if (!Array.isArray(raw)) return [];
  const samples: TrainingSample[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue;
    const features = (entry as { features?: unknown }).features;
    const label = (entry as { label?: unknown }).label;
    if (!Array.isArray(features) || typeof label !== 'number') continue;
    const numeric = features.filter(
      (f): f is number => typeof f === 'number' && Number.isFinite(f),
    );
    if (numeric.length !== features.length) continue;
    samples.push({ features: numeric, label: label >= 0.5 ? 1 : 0 });
  }
  return samples;
}

/** Learn per-feature mean/std so gradient descent works on comparable scales. */
function standardize(samples: TrainingSample[]): FeatureScaler {
  const dimension = samples[0]?.features.length ?? 0;
  const mean = new Array<number>(dimension).fill(0);
  const std = new Array<number>(dimension).fill(0);
  const n = samples.length || 1;

  for (const sample of samples) {
    for (let i = 0; i < dimension; i++) {
      mean[i] = (mean[i] ?? 0) + (sample.features[i] ?? 0) / n;
    }
  }
  for (const sample of samples) {
    for (let i = 0; i < dimension; i++) {
      std[i] = (std[i] ?? 0) + Math.pow((sample.features[i] ?? 0) - (mean[i] ?? 0), 2) / n;
    }
  }
  for (let i = 0; i < dimension; i++) {
    std[i] = Math.sqrt(std[i] ?? 0) || 1;
  }
  return { mean, std };
}

function applyScaler(features: number[], scaler: FeatureScaler): number[] {
  return features.map((value, i) => (value - (scaler.mean[i] ?? 0)) / (scaler.std[i] ?? 1));
}

/**
 * Real batch gradient descent for binary logistic regression over standardized
 * features. Returns the learned weights/bias, the scaler, and metrics computed
 * from actual predictions.
 */
function trainLogisticRegression(
  samples: TrainingSample[],
  epochs = DEFAULT_EPOCHS,
  learningRate = DEFAULT_LEARNING_RATE,
): { weights: number[]; bias: number; scaler: FeatureScaler; metrics: Record<string, number> } {
  const scaler = standardize(samples);
  const scaled = samples.map((sample) => ({
    features: applyScaler(sample.features, scaler),
    label: sample.label,
  }));

  const dimension = scaled[0]?.features.length ?? 0;
  const weights = new Array<number>(dimension).fill(0);
  let bias = 0;
  const n = scaled.length;

  for (let epoch = 0; epoch < epochs; epoch++) {
    const gradW = new Array<number>(dimension).fill(0);
    let gradB = 0;

    for (const sample of scaled) {
      const predicted = sigmoid(bias + dot(weights, sample.features));
      const error = predicted - sample.label;
      for (let i = 0; i < dimension; i++) {
        gradW[i] = (gradW[i] ?? 0) + error * (sample.features[i] ?? 0);
      }
      gradB += error;
    }

    for (let i = 0; i < dimension; i++) {
      weights[i] = (weights[i] ?? 0) - (learningRate * (gradW[i] ?? 0)) / n;
    }
    bias -= (learningRate * gradB) / n;
  }

  let truePositives = 0;
  let falsePositives = 0;
  let trueNegatives = 0;
  let falseNegatives = 0;
  for (const sample of scaled) {
    const predictedLabel = sigmoid(bias + dot(weights, sample.features)) >= 0.5 ? 1 : 0;
    if (predictedLabel === 1 && sample.label === 1) truePositives++;
    else if (predictedLabel === 1 && sample.label === 0) falsePositives++;
    else if (predictedLabel === 0 && sample.label === 0) trueNegatives++;
    else falseNegatives++;
  }

  const total = n || 1;
  const precisionDen = truePositives + falsePositives;
  const recallDen = truePositives + falseNegatives;

  return {
    weights,
    bias,
    scaler,
    metrics: {
      accuracy: round4((truePositives + trueNegatives) / total),
      precision: round4(precisionDen > 0 ? truePositives / precisionDen : 0),
      recall: round4(recallDen > 0 ? truePositives / recallDen : 0),
      loss: round4(logLoss(scaled, weights, bias)),
    },
  };
}

function logLoss(samples: TrainingSample[], weights: number[], bias: number): number {
  if (samples.length === 0) return 0;
  const eps = 1e-12;
  let sum = 0;
  for (const sample of samples) {
    const p = Math.min(1 - eps, Math.max(eps, sigmoid(bias + dot(weights, sample.features))));
    sum += -(sample.label * Math.log(p) + (1 - sample.label) * Math.log(1 - p));
  }
  return sum / samples.length;
}

export class MLPipeline {
  private models: Map<string, ModelConfig> = new Map();
  private jobs: Map<string, TrainingJob> = new Map();

  registerModel(config: ModelConfig) {
    this.models.set(config.name, config);
  }

  /**
   * Train a registered model with real batch gradient descent over its
   * `parameters.samples`. Throws when the model is unknown or has no usable
   * samples — we never report fabricated metrics.
   */
  async startTraining(modelName: string, _dataset: string): Promise<TrainingJob> {
    const model = this.models.get(modelName);
    if (!model) {
      throw new Error(`Model ${modelName} not found`);
    }

    const samples = extractSamples(model.parameters['samples']);
    if (samples.length === 0) {
      throw new Error(`Model ${modelName} has no labelled training samples (parameters.samples)`);
    }

    const job: TrainingJob = {
      id: `train-${randomUUID()}`,
      modelName,
      status: 'training',
      progress: 0,
      startedAt: new Date(),
    };
    this.jobs.set(job.id, job);

    const { weights, bias, scaler, metrics } = trainLogisticRegression(samples);
    model.parameters['weights'] = weights;
    model.parameters['bias'] = bias;
    model.parameters['scaler'] = scaler;
    model.parameters['metrics'] = metrics;

    job.progress = 100;
    job.status = 'completed';
    job.completedAt = new Date();
    job.metrics = metrics;

    return job;
  }

  getJob(jobId: string): TrainingJob | undefined {
    return this.jobs.get(jobId);
  }

  getModel(name: string): ModelConfig | undefined {
    return this.models.get(name);
  }

  listModels(): ModelConfig[] {
    return Array.from(this.models.values());
  }

  /**
   * Deterministic logistic-regression inference. Uses the most recently
   * registered model's learned weights/bias when available, otherwise a
   * deterministic default weight vector seeded from the feature names so the
   * same input always yields the same output.
   */
  async predict(params: { input: string; features: Record<string, number> }): Promise<{
    prediction: number;
    taskType: string;
    complexity: number;
    model: string;
    confidence: number;
  }> {
    const complexity = clamp01(params.features['complexity'] ?? 0.5);
    const featureNames = Object.keys(params.features).sort();
    const vector = featureNames.map((name) => params.features[name] ?? 0);

    const trained = this.latestTrainedModel();
    const weights = trained
      ? ((trained.parameters['weights'] as number[] | undefined) ?? defaultWeights(featureNames))
      : defaultWeights(featureNames);
    const bias = trained ? ((trained.parameters['bias'] as number | undefined) ?? 0) : 0;
    const scaler = trained
      ? (trained.parameters['scaler'] as FeatureScaler | undefined)
      : undefined;

    const input = scaler ? applyScaler(vector, scaler) : vector;
    const prediction = clamp01(sigmoid(bias + dot(weights, input)));

    // Confidence from the decision margin (0 at the boundary, 1 at extremes),
    // narrowed by the model's own training accuracy when it has one.
    const margin = Math.abs(prediction - 0.5) * 2;
    const accuracy = trained
      ? ((trained.parameters['metrics'] as Record<string, number> | undefined)?.['accuracy'] ?? 1)
      : 1;
    const confidence = round4(Math.min(0.99, (0.5 + 0.49 * margin) * (0.5 + 0.5 * accuracy)));

    return {
      prediction: round4(prediction),
      taskType: complexity > 0.8 ? 'complex' : complexity > 0.4 ? 'moderate' : 'simple',
      complexity,
      model: complexity > 0.7 ? 'gpt-4o' : 'gpt-4o-mini',
      confidence,
    };
  }

  /** The most recently registered model that carries learned weights. */
  private latestTrainedModel(): ModelConfig | undefined {
    let found: ModelConfig | undefined;
    for (const model of this.models.values()) {
      if (Array.isArray(model.parameters['weights'])) {
        found = model;
      }
    }
    return found;
  }
}

/**
 * Deterministic default weights derived from feature names (no randomness), so
 * an untrained pipeline is still reproducible and bounded.
 */
function defaultWeights(featureNames: string[]): number[] {
  return featureNames.map((name) => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = (hash * 31 + name.charCodeAt(i)) | 0;
    }
    // Map the hash into a small, stable [-0.5, 0.5] weight.
    return (hash % 1000) / 1000 - 0.5;
  });
}

export const mlPipeline = new MLPipeline();
