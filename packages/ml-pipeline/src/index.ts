// ============================================================================
// ML Pipeline Package - Barrel Export
// ============================================================================

// Feature Store (new)
export {
  OnlineFeatureStore,
  OfflineFeatureStore,
  FeatureMaterializationPipeline,
  UserFeatureSchema,
  ItemFeatureSchema,
  InteractionFeatureSchema,
  getFeatureDefinition,
  listFeatureDefinitions,
  registerFeatureDefinition,
  OnlineStoreConfigSchema,
  OfflineStoreConfigSchema,
  PipelineConfigSchema,
} from './feature-store';

export type {
  RedisClient,
  OnlineStoreConfig,
  FeatureRecord,
  InteractionRecord,
  S3Client,
  OfflineStoreConfig,
  FeatureDataset,
  DataQuery,
  TrainingDataQuery,
  TrainingDataResult,
  UserFeatures,
  ItemFeatures,
  InteractionFeatures,
  FeatureDefinition,
  PipelineConfig,
  RawEvent,
  MaterializedFeature,
  PipelineStats,
} from './feature-store';

export { FeatureStore } from './core/feature-store';
export { ModelRegistry } from './core/model-registry';
export { TrainingPipeline } from './core/training-pipeline';
export { InferenceEngine } from './core/inference-engine';
export { EmbeddingStore } from './core/embedding-store';
export { TextEmbeddingEngine } from './core/text-embeddings';
export { ImageFeatureExtractor } from './core/image-features';
export { AnomalyDetector } from './core/anomaly-detector';
export { SpamClassifier } from './core/spam-classifier';
export { SentimentAnalyzer } from './core/sentiment-analyzer';
export { NEREngine } from './core/ner-engine';
export { TimeSeriesForecaster } from './core/time-series-forecaster';
export { AutoMLPipeline } from './core/automl-pipeline';
export { ModelMonitor } from './core/model-monitor';

export type {
  Feature,
  FeatureSet,
  FeatureStoreConfig,
  FeatureStats,
  FeatureDType,
  TransformType,
  TransformConfig,
  FeatureSchema,
  FeatureLineage,
  ModelMetadata,
  ModelVersion,
  ModelStatus,
  ModelFramework,
  ModelLineage,
  ModelComparison,
  TrainingConfig,
  TrainingResult,
  EvaluationMetrics,
  EpochHistory,
  Checkpoint,
  OptimizerType,
  LossFunction,
  LRSchedule,
  DataBatch,
  DataSplit,
  DataLoaderConfig,
  InferenceRequest,
  InferenceResult,
  ABTestConfig,
  ModelRoute,
  LatencyStats,
  Embedding,
  VectorIndex,
  LSHConfig,
  SimilarityResult,
  ANNConfig,
  AnomalyResult,
  IsolationTree,
  ZScoreConfig,
  AnomalyMethod,
  AnomalyDetectorConfig,
  SentimentResult,
  SentimentLabel,
  NEREntity,
  EntityType,
  TimeSeriesPoint,
  Forecast,
  ARIMAConfig,
  ExponentialSmoothingConfig,
  SeasonalityResult,
  HyperParameter,
  HyperParameterType,
  SearchSpace,
  CrossValidationResult,
  AutoMLConfig,
  TrialResult,
  ModelDriftAlert,
  DriftDetectionConfig,
  AlertRule,
  AlertSeverity,
  DistributionBin,
  DriftReport,
} from './types';
