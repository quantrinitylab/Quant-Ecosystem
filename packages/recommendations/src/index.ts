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
export type { TwoTowerConfig, TwoTowerServingBackend } from './retrieval/two-tower';
export { ItemItemCollaborative } from './retrieval/collaborative';
export type { Interaction } from './retrieval/collaborative';
export { TrendingRetrieval } from './retrieval/trending';
export type { TrendingConfig, TrendingInteractionType } from './retrieval/trending';

// Ranking modules
export { MMoERanker } from './ranking/mmoe';
export type { ObjectiveName, ExpertFn, GatingFn, MMoEServingBackend } from './ranking/mmoe';
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
export { OnDeviceRanker, MAX_MODEL_SIZE_BYTES, MAX_INFERENCE_LATENCY_MS } from './on-device-ranker';
export type {
  UserPrefs,
  RankedCandidate,
  OnnxRuntime,
  BenchmarkResult,
  PerformanceBudgetResult,
} from './on-device-ranker';

// On-device ranker model spec
export { OnDeviceModelSpec } from './on-device-ranker-model';
export type { ModelSpec } from './on-device-ranker-model';

// Experiment
export { ExperimentService, InMemoryBucketStore } from './experiment/experiment-service';
export type {
  ExperimentConfig,
  ExperimentResult,
  ExposureRecord,
  GuardrailMetric,
  GuardrailCheckResult,
  BucketStore,
} from './experiment/experiment-service';
export { GuardrailEvaluator } from './experiment/guardrails';
export type { GuardrailBreachDetail, GuardrailEvaluation } from './experiment/guardrails';

// Personalization
export {
  UserSignalProcessor,
  InMemorySignalStore,
  TimeWellSpent,
  InMemorySessionStore,
  FollowingMode,
} from './personalization';
// ---------------------------------------------------------------------------
// Simple in-memory engine (K8 consolidation: merged from @quant/recommendation)
// ---------------------------------------------------------------------------
// Named exports only: this package already owns the `UserProfile` /
// `ContentItem` / `Interaction` names in its canonical types / anti-rage /
// retrieval modules, so the simple engine's local model shapes are NOT
// re-exported here (import them from the module file directly if needed).
export {
  RecommendationEngine,
  recommendationEngine,
} from './simple-engine/simple-recommendation-engine';
export type {
  SimpleUserProfile,
  SimpleContentItem,
  SimpleInteraction,
} from './simple-engine/simple-recommendation-engine';
export type {
  NegativeSignal,
  SignalStore,
  SessionData,
  DailySummary,
  RegretPrediction,
  SessionStore,
  SocialGraph,
  ContentStore,
  ContentPost,
  FollowingFeedResult,
} from './personalization';

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
