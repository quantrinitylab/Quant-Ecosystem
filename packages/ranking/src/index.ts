// ============================================================================
// Ranking Package - Barrel Export
// ============================================================================

// Types
export {
  AlgorithmType,
  type FeedItem,
  type RankedItem,
  type UserAlgorithmPreference,
  type PluginManifest,
  type ABTestBucket,
  type FeedRequest,
  type FeedResponse,
} from './types.js';

// Algorithm Registry
export { AlgorithmRegistry, type RankingAlgorithm } from './algorithm-registry.js';

// Rankers
export { ChronoRanker } from './chrono-ranker.js';
export { AIRanker, type UserEngagementProfile } from './ai-ranker.js';
export { CommunityRanker } from './community-ranker.js';

// Plugin System
export { PluginSystem, type PluginSandbox, type PluginRankingFn } from './plugin-system.js';

// Services
export { UserPreferenceService } from './user-preference.service.js';
export {
  AntiRageFilter,
  type ContentItem,
  type AntiRageScorerInterface,
} from './anti-rage-integration.js';
export { FeedService, type CandidateProvider } from './feed-service.js';
export {
  ABTestIntegration,
  type RankingExperimentConfig,
  type ExperimentConfig,
  type ExperimentResult,
} from './ab-test-integration.js';

// Screen Time Monitor
export {
  ScreenTimeMonitor,
  type TimeAlertEvent,
  type EngagementTrapEvent,
  type EventEmitter as ScreenTimeEventEmitter,
  type ScreenTimeMonitorConfig,
} from './screen-time-monitor.js';

// Feed Explainer
export {
  FeedExplainer,
  type FeedExplanation,
  type RankingSignal,
  type UserContext,
} from './feed-explainer.js';

// Routes
export { default as feedRoutes, type FeedRouteDeps } from './routes/feed.js';
export { default as pluginRoutes, type PluginRouteDeps } from './routes/plugins.js';
