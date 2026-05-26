// ============================================================================
// Recommendations Package - Barrel Export
// ============================================================================

// Core modules
export { CollaborativeFilter } from './core/collaborative-filtering';
export { ContentBasedFilter } from './core/content-based-filter';
export { HybridEngine } from './core/hybrid-engine';
export { NeuralCF } from './core/neural-cf';
export { MatrixFactorizer } from './core/matrix-factorization';
export { RealtimePersonalizer } from './core/realtime-personalizer';
export { CrossAppRecommender } from './core/cross-app-recommender';
export { TrendingDetector } from './core/trending-detector';
export { DiversityInjector } from './core/diversity-injector';
export { FeedbackProcessor } from './core/feedback-processor';
export { ContextEngine } from './core/context-engine';
export { ColdStartHandler } from './core/cold-start-handler';
export { RecommendationABTest } from './core/recommendation-ab';

// Retrieval modules
export { TwoTowerRetrieval } from './retrieval/two-tower';
export type { TwoTowerConfig } from './retrieval/two-tower';
export { ItemItemCollaborative } from './retrieval/collaborative';
export type { Interaction } from './retrieval/collaborative';
export { TrendingRetrieval } from './retrieval/trending';
export type { TrendingConfig, TrendingInteractionType } from './retrieval/trending';

// Ranking modules
export { MMoERanker } from './ranking/mmoe';
export type { ObjectiveName, ExpertFn, GatingFn } from './ranking/mmoe';
export { ScoreFusion } from './ranking/score-fusion';
export type { ScoreFn, FusedCandidate } from './ranking/score-fusion';
export { AntiRageScorer } from './ranking/anti-rage';
export type { ContentItem } from './ranking/anti-rage';

// Diversify modules
export { DPPDiversifier } from './diversify/dpp';
export type { DPPCandidate, SimilarityFn } from './diversify/dpp';

// Pipeline
export { RecommendationPipeline } from './pipeline';
export type {
  PipelineCandidate,
  PipelineContext,
  PipelineConfig,
  RetrievalFn,
  RankingFn,
  DiversityFn,
} from './pipeline';

// On-device ranker
export { OnDeviceRanker } from './on-device-ranker';
export type { UserPrefs, RankedCandidate, OnnxRuntime } from './on-device-ranker';

// Experiment
export { ExperimentService } from './experiment/experiment-service';
export type {
  ExperimentConfig,
  ExperimentResult,
  ExposureRecord,
} from './experiment/experiment-service';

export type {
  UserProfile,
  UserDemographics,
  UserInteraction,
  InteractionType,
  InteractionContext,
  ItemProfile,
  ItemMetadata,
  Rating,
  SimilarityScore,
  SimilarityMethod,
  RecommendationResult,
  RecommendedItem,
  RecommendationReason,
  ExplanationType,
  CollaborativeConfig,
  ContentFilterConfig,
  HybridConfig,
  BlendingStrategy,
  MatrixFactorizationConfig,
  LatentFactor,
  NCFConfig,
  NCFLayer,
  ActivationType,
  ColdStartConfig,
  ColdStartStrategy,
  DiversityConfig,
  MMRConfig,
  SessionSignal,
  PersonalizationConfig,
  BanditStrategy,
  ABVariant,
  TestMetrics,
  FeedbackEvent,
  FeedbackType,
  CrossAppMapping,
  TrendingItem,
  VelocityScore,
  ContextFeatures,
  TimeOfDay,
  DeviceType,
  ExplanationConfig,
  Explanation,
  FeatureContribution,
  ExperimentConfigType,
  ExperimentResultType,
} from './types';
