// ============================================================================
// ML Pipeline - Type Definitions
// ============================================================================

// Feature Store Types
export type FeatureDType = 'numeric' | 'categorical' | 'boolean' | 'text' | 'timestamp' | 'vector';

export interface Feature {
  name: string;
  dtype: FeatureDType;
  value: number | string | boolean | number[];
  timestamp: number;
  entityId?: string;
  version?: number;
}

export interface FeatureSet {
  name: string;
  features: Feature[];
  entityType: string;
  createdAt: number;
  updatedAt: number;
  ttl?: number;
}

export interface FeatureStoreConfig {
  maxFeatures: number;
  defaultTTL: number;
  enableVersioning: boolean;
  enableStatistics: boolean;
  batchSize: number;
  storageBackend: 'memory' | 'persistent';
}

export interface FeatureStats {
  mean: number;
  std: number;
  min: number;
  max: number;
  count: number;
  histogram: { bin: number; count: number }[];
  lastUpdated: number;
  variance: number;
  skewness: number;
  kurtosis: number;
}

export type TransformType = 'normalize' | 'standardize' | 'log' | 'bucketize' | 'one_hot' | 'clip' | 'power';

export interface TransformConfig {
  type: TransformType;
  params: Record<string, number | number[] | string>;
}

export interface FeatureSchema {
  name: string;
  dtype: FeatureDType;
  transforms: TransformConfig[];
  description?: string;
  tags?: string[];
}

export interface FeatureLineage {
  featureName: string;
  sourceData: string[];
  transforms: TransformConfig[];
  createdAt: number;
  version: number;
}

// Model Registry Types
export type ModelStatus = 'training' | 'staged' | 'production' | 'archived' | 'failed';

export type ModelFramework = 'linear' | 'logistic' | 'tree' | 'ensemble' | 'neural' | 'custom';

export interface ModelMetadata {
  name: string;
  version: string;
  framework: ModelFramework;
  metrics: Record<string, number>;
  status: ModelStatus;
  createdAt: number;
  updatedAt: number;
  description?: string;
  tags?: string[];
  datasetId?: string;
  featureSet?: string;
}

export interface ModelVersion {
  major: number;
  minor: number;
  patch: number;
  label?: string;
}

export interface ModelLineage {
  modelName: string;
  version: string;
  datasetId: string;
  featureSet: string;
  trainingConfig: TrainingConfig;
  parentModel?: string;
  createdAt: number;
}

export interface ModelComparison {
  modelA: string;
  modelB: string;
  metrics: Record<string, { a: number; b: number; diff: number }>;
  winner: string;
  confidence: number;
}

// Training Types
export type OptimizerType = 'sgd' | 'adam' | 'rmsprop' | 'adagrad' | 'momentum';
export type LossFunction = 'mse' | 'cross_entropy' | 'mae' | 'huber' | 'hinge';
export type LRSchedule = 'constant' | 'step_decay' | 'cosine_annealing' | 'exponential_decay';

export interface TrainingConfig {
  epochs: number;
  batchSize: number;
  learningRate: number;
  optimizer: OptimizerType;
  lossFunction: LossFunction;
  earlyStopPatience: number;
  lrSchedule: LRSchedule;
  lrDecayRate?: number;
  lrDecaySteps?: number;
  weightDecay?: number;
  momentum?: number;
  validationSplit: number;
  shuffle: boolean;
}

export interface TrainingResult {
  finalLoss: number;
  finalMetrics: EvaluationMetrics;
  epochsCompleted: number;
  trainingTime: number;
  history: EpochHistory[];
  bestEpoch: number;
  converged: boolean;
}

export interface EpochHistory {
  epoch: number;
  trainLoss: number;
  valLoss: number;
  trainMetrics: Record<string, number>;
  valMetrics: Record<string, number>;
  learningRate: number;
  duration: number;
}

export interface EvaluationMetrics {
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  auc: number;
  mse: number;
  mae: number;
  confusionMatrix?: number[][];
}

export interface Checkpoint {
  epoch: number;
  weights: number[][];
  bias: number[];
  valLoss: number;
  metrics: EvaluationMetrics;
  timestamp: number;
}

// Data Types
export interface DataBatch {
  features: number[][];
  labels: number[];
  batchIndex: number;
  batchSize: number;
  isLast: boolean;
}

export interface DataSplit {
  train: { features: number[][]; labels: number[] };
  test: { features: number[][]; labels: number[] };
  validation: { features: number[][]; labels: number[] };
}

export interface DataLoaderConfig {
  batchSize: number;
  shuffle: boolean;
  dropLast: boolean;
  seed?: number;
  stratified: boolean;
}

// Inference Types
export interface InferenceRequest {
  inputId: string;
  features: number[];
  modelName?: string;
  modelVersion?: string;
  timestamp: number;
  metadata?: Record<string, string>;
}

export interface InferenceResult {
  inputId: string;
  prediction: number | number[];
  probability?: number[];
  latencyMs: number;
  modelName: string;
  modelVersion: string;
  cached: boolean;
  timestamp: number;
}

export interface ABTestConfig {
  name: string;
  modelA: { name: string; version: string; trafficWeight: number };
  modelB: { name: string; version: string; trafficWeight: number };
  startTime: number;
  endTime?: number;
  active: boolean;
}

export interface ModelRoute {
  modelName: string;
  modelVersion: string;
  weight: number;
  fallback?: string;
}

export interface LatencyStats {
  p50: number;
  p95: number;
  p99: number;
  mean: number;
  count: number;
  max: number;
  min: number;
}

// Embedding Types
export interface Embedding {
  id: string;
  vector: number[];
  metadata?: Record<string, string>;
  timestamp: number;
}

export interface VectorIndex {
  name: string;
  dimension: number;
  size: number;
  indexType: 'flat' | 'lsh' | 'ivf';
  createdAt: number;
}

export interface LSHConfig {
  numHashTables: number;
  numHashFunctions: number;
  dimension: number;
  seed?: number;
}

export interface SimilarityResult {
  id: string;
  score: number;
  vector?: number[];
  metadata?: Record<string, string>;
}

export interface ANNConfig {
  method: 'lsh' | 'kd_tree' | 'ball_tree';
  numNeighbors: number;
  numProbes?: number;
  threshold?: number;
}

// Anomaly Detection Types
export type AnomalyMethod = 'isolation_forest' | 'zscore' | 'moving_average' | 'mahalanobis';

export interface AnomalyResult {
  isAnomaly: boolean;
  score: number;
  threshold: number;
  method: AnomalyMethod;
  timestamp: number;
  contributingFeatures?: { feature: string; contribution: number }[];
}

export interface IsolationTree {
  splitFeature: number;
  splitValue: number;
  left: IsolationTree | null;
  right: IsolationTree | null;
  size: number;
  depth: number;
}

export interface ZScoreConfig {
  threshold: number;
  windowSize: number;
  adaptiveRate: number;
}

export interface AnomalyDetectorConfig {
  method: AnomalyMethod;
  contamination: number;
  numTrees?: number;
  maxDepth?: number;
  windowSize?: number;
  threshold?: number;
}

// NLP Types
export type SentimentLabel = 'positive' | 'negative' | 'neutral';

export interface SentimentResult {
  sentiment: SentimentLabel;
  score: number;
  confidence: number;
  aspects?: { aspect: string; sentiment: SentimentLabel; score: number }[];
}

export type EntityType = 'PERSON' | 'ORG' | 'LOCATION' | 'DATE' | 'MONEY' | 'EMAIL' | 'URL' | 'PHONE';

export interface NEREntity {
  text: string;
  type: EntityType;
  start: number;
  end: number;
  confidence: number;
  normalized?: string;
}

// Time Series Types
export interface TimeSeriesPoint {
  timestamp: number;
  value: number;
}

export interface Forecast {
  point: number;
  lower: number;
  upper: number;
  timestamp: number;
}

export interface ARIMAConfig {
  p: number; // AR order
  d: number; // differencing order
  q: number; // MA order
  seasonal?: { P: number; D: number; Q: number; period: number };
}

export interface ExponentialSmoothingConfig {
  alpha: number; // level smoothing
  beta?: number; // trend smoothing
  gamma?: number; // seasonal smoothing
  seasonalPeriod?: number;
  damped?: boolean;
}

export interface SeasonalityResult {
  period: number;
  strength: number;
  autocorrelations: number[];
}

// AutoML Types
export type HyperParameterType = 'continuous' | 'discrete' | 'categorical';

export interface HyperParameter {
  name: string;
  type: HyperParameterType;
  range?: [number, number];
  choices?: (string | number)[];
  step?: number;
  logScale?: boolean;
}

export interface SearchSpace {
  parameters: HyperParameter[];
  method: 'grid' | 'random' | 'bayesian';
  maxTrials: number;
  seed?: number;
}

export interface CrossValidationResult {
  folds: number;
  scores: number[];
  mean: number;
  std: number;
  bestFold: number;
  config: Record<string, number | string>;
}

export interface AutoMLConfig {
  searchSpace: SearchSpace;
  metric: string;
  maximize: boolean;
  cv: number;
  earlyTermination: boolean;
  maxTime?: number;
}

export interface TrialResult {
  trialId: number;
  config: Record<string, number | string>;
  metric: number;
  duration: number;
  status: 'completed' | 'failed' | 'terminated';
}

// Model Monitoring Types
export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface ModelDriftAlert {
  metric: string;
  expected: number;
  actual: number;
  severity: AlertSeverity;
  timestamp: number;
  modelName: string;
  description: string;
}

export interface DriftDetectionConfig {
  windowSize: number;
  threshold: number;
  method: 'psi' | 'kl_divergence' | 'ks_test' | 'chi_squared';
  checkInterval: number;
  alertRules: AlertRule[];
}

export interface AlertRule {
  metric: string;
  operator: 'gt' | 'lt' | 'gte' | 'lte' | 'eq';
  threshold: number;
  severity: AlertSeverity;
  cooldown: number;
}

export interface DistributionBin {
  lower: number;
  upper: number;
  count: number;
  proportion: number;
}

export interface DriftReport {
  modelName: string;
  reportTime: number;
  featureDrifts: { feature: string; psi: number; drifted: boolean }[];
  predictionDrift: { psi: number; drifted: boolean };
  performanceMetrics: Record<string, number>;
  alerts: ModelDriftAlert[];
}
