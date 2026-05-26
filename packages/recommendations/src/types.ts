// ============================================================================
// Recommendations Package - Type Definitions
// ============================================================================

/** User profile for recommendation computation */
export interface UserProfile {
  id: string;
  demographics: UserDemographics;
  interactions: UserInteraction[];
  preferences: Map<string, number>;
  segments: string[];
  createdAt: number;
  lastActiveAt: number;
}

/** User demographic information */
export interface UserDemographics {
  ageRange: string;
  location: string;
  language: string;
  interests: string[];
  occupation: string;
}

/** User interaction with an item */
export interface UserInteraction {
  userId: string;
  itemId: string;
  type: InteractionType;
  value: number;
  timestamp: number;
  context: InteractionContext;
}

/** Types of user interactions */
export type InteractionType =
  | 'view'
  | 'click'
  | 'like'
  | 'dislike'
  | 'share'
  | 'save'
  | 'purchase'
  | 'rating'
  | 'comment'
  | 'scroll'
  | 'dwell'
  | 'skip';

/** Context for user interaction */
export interface InteractionContext {
  device: string;
  location: string;
  timeOfDay: string;
  sessionId: string;
  referrer: string;
}

/** Item profile for recommendation */
export interface ItemProfile {
  id: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  features: Map<string, number>;
  metadata: ItemMetadata;
  createdAt: number;
  popularity: number;
}

/** Item metadata */
export interface ItemMetadata {
  author: string;
  source: string;
  language: string;
  duration: number;
  quality: number;
}

/** Rating entry for collaborative filtering */
export interface Rating {
  userId: string;
  itemId: string;
  value: number;
  timestamp: number;
}

/** Similarity score between two entities */
export interface SimilarityScore {
  entityA: string;
  entityB: string;
  score: number;
  method: SimilarityMethod;
}

/** Supported similarity methods */
export type SimilarityMethod = 'cosine' | 'pearson' | 'jaccard' | 'euclidean';

/** Recommendation result */
export interface RecommendationResult {
  userId: string;
  items: RecommendedItem[];
  algorithm: string;
  confidence: number;
  generatedAt: number;
  explanations: RecommendationReason[];
}

/** Individual recommended item */
export interface RecommendedItem {
  itemId: string;
  score: number;
  rank: number;
  source: string;
  reason: string;
}

/** Explanation for a recommendation */
export interface RecommendationReason {
  type: ExplanationType;
  description: string;
  confidence: number;
  features: string[];
}

/** Types of explanations */
export type ExplanationType =
  | 'collaborative'
  | 'content_based'
  | 'trending'
  | 'popular'
  | 'social'
  | 'contextual'
  | 'personalized'
  | 'serendipity';

/** Configuration for collaborative filtering */
export interface CollaborativeConfig {
  neighborhoodSize: number;
  minCommonItems: number;
  similarityMethod: SimilarityMethod;
  minSimilarity: number;
  maxCandidates: number;
  implicitFeedback: boolean;
}

/** Configuration for content-based filtering */
export interface ContentFilterConfig {
  maxFeatures: number;
  minTermFrequency: number;
  useIDF: boolean;
  boostFactors: Map<string, number>;
  featureWeights: Record<string, number>;
}

/** Configuration for hybrid engine */
export interface HybridConfig {
  collaborativeWeight: number;
  contentWeight: number;
  trendingWeight: number;
  contextWeight: number;
  cascadeThreshold: number;
  switchingConfidence: number;
  blendingStrategy: BlendingStrategy;
}

/** Blending strategies for hybrid engine */
export type BlendingStrategy = 'weighted' | 'cascade' | 'switching' | 'ensemble';

/** Configuration for matrix factorization */
export interface MatrixFactorizationConfig {
  latentDimensions: number;
  regularization: number;
  learningRate: number;
  maxIterations: number;
  convergenceThreshold: number;
  implicitAlpha: number;
}

/** Latent factor representation */
export interface LatentFactor {
  id: string;
  vector: number[];
  bias: number;
}

/** Neural CF configuration */
export interface NCFConfig {
  embeddingSize: number;
  hiddenLayers: number[];
  activationFn: ActivationType;
  learningRate: number;
  batchSize: number;
  epochs: number;
  dropout: number;
}

/** Layer in neural CF */
export interface NCFLayer {
  weights: number[][];
  biases: number[];
  activation: ActivationType;
}

/** Activation function types */
export type ActivationType = 'relu' | 'sigmoid' | 'tanh' | 'linear';

/** Cold start strategy configuration */
export interface ColdStartConfig {
  strategy: ColdStartStrategy;
  explorationRate: number;
  minInteractions: number;
  popularityWindow: number;
  demographicWeight: number;
}

/** Cold start strategies */
export type ColdStartStrategy =
  | 'popularity'
  | 'demographic'
  | 'onboarding'
  | 'exploration'
  | 'hybrid';

/** Diversity configuration */
export interface DiversityConfig {
  lambda: number;
  maxPerCategory: number;
  minCategories: number;
  serendipityTarget: number;
  noveltyWeight: number;
}

/** MMR configuration */
export interface MMRConfig {
  lambda: number;
  maxIterations: number;
  diversityThreshold: number;
}

/** Session signal for real-time personalization */
export interface SessionSignal {
  type: string;
  itemId: string;
  value: number;
  timestamp: number;
  metadata: Record<string, unknown>;
}

/** Personalization configuration */
export interface PersonalizationConfig {
  sessionWeight: number;
  recencyDecay: number;
  banditStrategy: BanditStrategy;
  explorationRate: number;
  contextFeatures: string[];
}

/** Bandit strategy types */
export type BanditStrategy = 'epsilon_greedy' | 'ucb1' | 'thompson';

/** A/B test variant */
export interface ABVariant {
  id: string;
  name: string;
  algorithm: string;
  config: Record<string, unknown>;
  trafficPercentage: number;
}

/** A/B test metrics */
export interface TestMetrics {
  variantId: string;
  impressions: number;
  clicks: number;
  conversions: number;
  engagementTime: number;
  revenue: number;
  ctr: number;
  conversionRate: number;
}

/** Feedback event */
export interface FeedbackEvent {
  userId: string;
  itemId: string;
  type: FeedbackType;
  value: number;
  timestamp: number;
  implicit: boolean;
}

/** Feedback types */
export type FeedbackType =
  | 'view'
  | 'click'
  | 'like'
  | 'dislike'
  | 'rating'
  | 'purchase'
  | 'share'
  | 'save'
  | 'scroll'
  | 'dwell';

/** Cross-app mapping */
export interface CrossAppMapping {
  sourceApp: string;
  targetApp: string;
  interestMap: Map<string, string[]>;
  weight: number;
}

/** Trending item */
export interface TrendingItem {
  itemId: string;
  velocity: number;
  acceleration: number;
  viralCoefficient: number;
  category: string;
  window: string;
}

/** Velocity score for trending detection */
export interface VelocityScore {
  itemId: string;
  interactions: number;
  timeWindow: number;
  velocity: number;
  acceleration: number;
  isBreakout: boolean;
}

/** Context features for recommendation */
export interface ContextFeatures {
  timeOfDay: TimeOfDay;
  dayOfWeek: number;
  device: DeviceType;
  location: string;
  season: string;
  weather: string;
  socialContext: string[];
}

/** Time of day categories */
export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';

/** Device types */
export type DeviceType = 'mobile' | 'tablet' | 'desktop' | 'tv' | 'watch';

/** Explanation configuration */
export interface ExplanationConfig {
  maxReasons: number;
  minConfidence: number;
  includeCounterfactual: boolean;
  templateLanguage: string;
}

/** Explanation output */
export interface Explanation {
  type: ExplanationType;
  text: string;
  confidence: number;
  contributingFeatures: FeatureContribution[];
  counterfactual: string | null;
}

/** Feature contribution to explanation */
export interface FeatureContribution {
  feature: string;
  weight: number;
  direction: 'positive' | 'negative';
}

// ============================================================================
// Phase 15 - ML Recommendation Types
// ============================================================================

/** Content item for anti-rage scoring (re-exported from ranking/anti-rage) */
export type { ContentItem } from './ranking/anti-rage';

/** User preferences for on-device ranking (re-exported from on-device-ranker) */
export type { UserPrefs } from './on-device-ranker';

/** Experiment configuration */
export interface ExperimentConfigType {
  id: string;
  name: string;
  buckets: string[];
  trafficAllocation: Record<string, number>;
  startDate: number;
  endDate: number;
}

/** Experiment result */
export interface ExperimentResultType {
  experimentId: string;
  pValue: number;
  lift: number;
  significant: boolean;
  bucketStats: Record<string, { exposures: number; conversions: number; rate: number }>;
}
