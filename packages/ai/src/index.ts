// ============================================================================
// @quant/ai - Central AI Engine and Services
// ============================================================================

// Types
export * from './types';

// Core
export { AIEngine } from './core/engine';
export { ContextManager } from './core/context-manager';
export {
  DefaultMemoryService,
  DefaultMergeStrategy,
  DefaultDeduplicator,
  DefaultBudgetAllocator,
} from './core/default-memory-service';
export type {
  DefaultMemoryServiceDeps,
  MergeStrategy,
  Deduplicator,
  BudgetAllocator,
  MemoryAuditSink,
  MemoryIndexer,
} from './core/default-memory-service';
export {
  DefaultMemoryExtractor,
  FactExtractor,
  PreferenceExtractor,
  EntityExtractor,
  EpisodicExtractor,
  RoleIgnoreFilter,
  AcknowledgementIgnoreFilter,
  ContentDuplicateFilter,
  TurnCountSummarizerTrigger,
} from './core/default-memory-extractor';
export type {
  ExtractionInput,
  MemoryCandidate,
  IgnoreFilter,
  CandidateExtractor,
  DuplicateFilter,
  ExtractionModel,
  SummarizerTrigger,
  ExtractionPipelineDeps,
} from './core/default-memory-extractor';
export { PrismaMemoryStore } from './core/prisma-memory-store';
export type {
  MemoryPrismaClient,
  MemoryRecordDelegate,
  MemoryRecordRow,
  MemoryRecordCreateData,
  PrismaMemoryStoreOptions,
} from './core/prisma-memory-store';
export { PrismaMemoryRetriever } from './core/prisma-memory-retriever';
export type {
  MemoryRetrieverPrismaClient,
  MemoryRecordQueryDelegate,
  PrismaMemoryRetrieverOptions,
} from './core/prisma-memory-retriever';
export {
  createMemoryService,
  InMemoryConversationLog,
  NoopMemoryCompressor,
} from './core/memory-composition';
export type { MemoryCompositionOptions, MemoryDbClient } from './core/memory-composition';
export { VectorMemoryRetriever, DEFAULT_RETRIEVAL_WEIGHTS } from './core/vector-memory-retriever';
export type {
  EmbeddingProvider,
  VectorBackend,
  VectorQueryHit,
  RetrievalWeights,
  RetrievalTrace,
  VectorMemoryRetrieverOptions,
} from './core/vector-memory-retriever';
export { VectorMemoryIndexer } from './core/vector-memory-indexer';
export type {
  MemoryEmbeddingPrismaClient,
  MemoryEmbeddingDelegate,
  MemoryEmbeddingCreateData,
  VectorMemoryIndexerOptions,
} from './core/vector-memory-indexer';
export {
  DefaultMemoryConflictResolver,
  DEFAULT_SLOT_RULES,
  ResidenceRule,
  EmployerRule,
  NameRule,
  FavoriteRule,
  SentimentRule,
} from './core/memory-conflict';
export type {
  MemoryConflictResolver,
  ConflictVerdict,
  ConflictDecision,
  ConflictCandidate,
  ExistingMemoryRef,
  SlotRule,
} from './core/memory-conflict';
export { PrismaMemoryArchiver } from './core/prisma-memory-store';
export type {
  MemoryArchiverPrismaClient,
  MemoryRecordUpdateDelegate,
} from './core/prisma-memory-store';
export type { MemoryArchiver } from './core/default-memory-service';
export { asKind, asLevel } from './core/memory-port';
export type {
  MemoryService,
  MemoryStore,
  MemoryRetriever,
  ConversationLog,
  ConversationTurn,
  MemoryExtractor,
  MemoryCompressor,
  MemoryMaintenance,
  MemoryRecord,
  RememberRequest,
  RetrievalContext,
  RetrievedMemory,
  ForgetPolicy,
  MemoryKind,
  MemoryLevel,
} from './core/memory-port';
export { ModelRouter } from './core/model-router';
export { CircuitBreaker, CircuitBreakerRegistry } from './core/circuit-breaker';
export { retryWithBackoff } from './core/retry';
// PromptRegistry is server-only (uses node:fs/node:path) and must not be exported from the browser-safe index.
// Import it directly from '@quant/ai/core/prompt-registry' when needed on the server.
// export { PromptRegistry } from './core/prompt-registry';
export { SemanticCache } from './core/semantic-cache';
export { SafetyPipeline } from './core/safety';
export { CostTracker } from './core/cost-tracker';
export { AIProviderUnavailableError, OpenRouterNotConfiguredError } from './core/errors';
export { RoutingTable } from './core/routing-table';
export { ProviderHealthMonitor } from './core/provider-health';
export { RequestCostLogger } from './core/request-cost-logger';
export type { CostLogEntry } from './core/request-cost-logger';
export {
  OpenAIAdapter,
  AnthropicAdapter,
  GoogleAdapter,
  ProviderAdapterRegistry,
  estimateTokens,
} from './core/provider-adapter';
export type {
  ProviderAdapter,
  ProviderGenerateOptions,
  ProviderGenerateResult,
  ProviderStreamResult,
} from './core/provider-adapter';
export { TokenCounter } from './core/token-counter';
export type { TokenCountResult } from './core/token-counter';

// Providers
export {
  OpenRouterProvider,
  loadOpenRouterConfig,
  DEFAULT_OPENROUTER_BASE_URL,
  resolveUserModel,
  resolveUserModelDetailed,
  isModelAllowed,
} from './providers';
export type {
  OpenRouterConfig,
  OpenRouterAdapterOptions,
  FetchLike,
  ResolveUserModelOptions,
  ResolvedUserModel,
  ModelResolutionSource,
} from './providers';

// Services
export { ChatAIService } from './services/chat-ai';
export { MailAIService } from './services/mail-ai';
export { ContentAIService } from './services/content-ai';
export { RecommendationAIService } from './services/recommendation-ai';
export { DeviceControlAIService, HttpDeviceControlBackend } from './services/device-control-ai';
export type { DeviceControlBackend } from './services/device-control-ai';
export { UnifiedAIService } from './services/unified-ai-service';
export type { GenerateTextOptions, GenerateStreamOptions } from './services/unified-ai-service';
export { SmartComposeService } from './services/smart-compose';
export type { ComposeOptions, ComposeResult } from './services/smart-compose';
export { CodeGenerationService } from './services/code-generation';
export type {
  CodeLanguage,
  CodeGenerationOptions,
  CodeGenerationResult,
  CodeExplanation,
  CodeReviewResult,
  CodeIssue,
} from './services/code-generation';
export { ImageGenerationService } from './services/image-generation';
export type {
  ImageSize,
  ImageStyle,
  ImageQuality,
  ImageGenerationRequest,
  ImageGenerationResult,
  ImageEditRequest,
} from './services/image-generation';

// Config
export {
  getAvailableProviders,
  getFallbackChain,
  getProviderConfig,
  hasAnyProvider,
} from './config/providers';
export type { ProviderConfig, FallbackChainConfig } from './config/providers';
export { isFailClosedMode, isProductionRuntime } from './config/runtime';
export {
  generateMockTextResponse,
  generateMockStreamChunks,
  generateMockEmbedding,
  generateMockModerationResult,
} from './config/mock-responses';

// Assistant
export { UniversalAssistant } from './assistant/assistant';
export { ToolRegistry } from './assistant/tool-registry';
export { IntentRouter } from './assistant/intent-router';
export { ActionExecutor } from './assistant/action-executor';
export * from './assistant/types';

// Voice
export { SpeechToTextService } from './voice/speech-to-text';
export { TextToSpeechService } from './voice/text-to-speech';
export { VoiceCommander } from './voice/voice-commander';
export { VoiceIntentBridge } from './voice/voice-intent-bridge';
export type {
  VoiceIntentResult,
  VoiceBridgeEventType,
  VoiceBridgeEvent,
  VoiceBridgeListener,
} from './voice/voice-intent-bridge';
export type { VoiceConfig, TranscriptionResult, TTSRequest, TTSResponse } from './voice/types';
