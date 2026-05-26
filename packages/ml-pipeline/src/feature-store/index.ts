// ============================================================================
// Feature Store - Barrel Export
// ============================================================================

export { OnlineFeatureStore, OnlineStoreConfigSchema } from './online-store';
export type {
  RedisClient,
  OnlineStoreConfig,
  FeatureRecord,
  InteractionRecord,
} from './online-store';

export { OfflineFeatureStore, OfflineStoreConfigSchema } from './offline-store';
export type {
  S3Client,
  OfflineStoreConfig,
  FeatureDataset,
  DataQuery,
  TrainingDataQuery,
  TrainingDataResult,
} from './offline-store';

export {
  UserFeatureSchema,
  ItemFeatureSchema,
  InteractionFeatureSchema,
  getFeatureDefinition,
  listFeatureDefinitions,
  registerFeatureDefinition,
} from './feature-definitions';
export type {
  UserFeatures,
  ItemFeatures,
  InteractionFeatures,
  FeatureDefinition,
} from './feature-definitions';

export { FeatureMaterializationPipeline, PipelineConfigSchema } from './pipeline';
export type { PipelineConfig, RawEvent, MaterializedFeature, PipelineStats } from './pipeline';
