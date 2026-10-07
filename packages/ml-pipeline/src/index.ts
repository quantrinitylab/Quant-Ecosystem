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
  OnlineStoreConfigSchema,
  OfflineStoreConfigSchema,
  PipelineConfigSchema,
  FeatureAggregator,
  NatsFeatureConsumer,
  BackfillJob,
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
  UserEvent,
  EventType,
  AggregatedFeatures,
  NatsSubscriber,
} from './feature-store';

// Embedding Service
export {
  EmbeddingService,
  OpenAIEmbeddingBackend,
  TritonEmbeddingBackend,
} from './embedding-service';

export type {
  EmbeddingBackend,
  HttpClient,
  OpenAIEmbeddingConfig,
  TritonEmbeddingConfig,
  EmbeddingItem,
} from './embedding-service';

export { FeatureStore, HttpFeatureStoreBackend } from './core/feature-store';
export type { FeatureStoreBackend } from './core/feature-store';
export { ModelRegistry } from './core/model-registry';
export { TrainingPipeline, HttpTrainingBackend } from './core/training-pipeline';
export type { TrainingBackend, TrainingRequest } from './core/training-pipeline';
export { InferenceEngine } from './core/inference-engine';
export { EmbeddingStore } from './core/embedding-store';
export type { VectorStoreBackend, EmbeddingStoreOptions } from './core/embedding-store';
export { TextEmbeddingEngine } from './core/text-embeddings';
export { ImageFeatureExtractor, HttpImageFeatureBackend } from './core/image-features';
export type { ImageFeatureBackend } from './core/image-features';
export { AnomalyDetector, HttpAnomalyBackend } from './core/anomaly-detector';
export type { AnomalyInferenceBackend, AnomalyBackendScore } from './core/anomaly-detector';
export { SpamClassifier } from './core/spam-classifier';
export type {
  SpamModelBackend,
  SpamClassifierOptions,
  SpamClassificationResult,
} from './core/spam-classifier';
export { SentimentAnalyzer } from './core/sentiment-analyzer';
export type { SentimentBackend, SentimentAnalyzerOptions } from './core/sentiment-analyzer';
export { NEREngine } from './core/ner-engine';
export type { NERBackend, NEREngineOptions } from './core/ner-engine';
export { TimeSeriesForecaster, HttpForecastBackend } from './core/time-series-forecaster';
export type { ForecastBackend } from './core/time-series-forecaster';
export { AutoMLPipeline, HttpAutoMLBackend } from './core/automl-pipeline';
export type { AutoMLBackend } from './core/automl-pipeline';
export { ModelMonitor, HttpModelMonitorBackend } from './core/model-monitor';
export type { ModelMonitorBackend, DriftDetectionRequest } from './core/model-monitor';

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
