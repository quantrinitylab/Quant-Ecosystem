// ============================================================================
// AI Package - Types and Interfaces
// ============================================================================

import type { QuantApp } from '@quant/common';

/** AI model providers */
export type AIProvider =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'deepseek'
  | 'groq'
  | 'mistral'
  | 'fireworks'
  | 'togetherai'
  | 'deepinfra'
  | 'cohere'
  | 'perplexity'
  | 'ollama'
  | 'meta'
  | 'stability'
  | 'whisper';

/** AI capability types */
export type AICapability =
  | 'text_generation'
  | 'text_summarization'
  | 'code_generation'
  | 'image_generation'
  | 'image_analysis'
  | 'audio_transcription'
  | 'translation'
  | 'sentiment_analysis'
  | 'content_moderation'
  | 'embedding'
  | 'recommendation'
  | 'device_control'
  | 'voice_stt'
  | 'voice_tts'
  | 'reranking'
  | 'web_search'
  | 'long_context';

/** Task types for routing */
export type TaskType =
  | 'autocomplete'
  | 'code_generation'
  | 'complex_reasoning'
  | 'cheap_reasoning'
  | 'summarization'
  | 'translation'
  | 'voice_stt'
  | 'voice_tts'
  | 'image_generation'
  | 'embedding_bulk'
  | 'embedding_quality'
  | 'reranking'
  | 'moderation'
  | 'web_search'
  | 'vision_screenshot'
  | 'long_context';

/** User tier for cost-aware routing */
export type UserTier = 'free' | 'paid' | 'enterprise';

/** Routing entry for task-based routing */
export interface RoutingEntry {
  taskType: TaskType;
  primary: string;
  fallbacks: string[];
}

/** Provider health statistics */
export interface ProviderHealthStats {
  provider: AIProvider;
  windowStartMs: number;
  totalRequests: number;
  successCount: number;
  errorCount: number;
  latencies: number[];
  lastErrorAt: number | null;
  circuitOpen: boolean;
  circuitOpenedAt: number | null;
}

/** Cost-aware request extending AIInferenceRequest */
export interface CostAwareRequest extends AIInferenceRequest {
  taskType?: TaskType;
  userTier?: UserTier;
}

/** AI model configuration */
export interface AIModelConfig {
  id: string;
  name: string;
  provider: AIProvider;
  capabilities: AICapability[];
  maxContextLength: number;
  maxOutputTokens: number;
  costPerInputToken: number;
  costPerOutputToken: number;
  latencyMs: number;
  qualityScore: number;
}

/** AI engine configuration */
export interface AIEngineConfig {
  defaultModel: string;
  maxConcurrentRequests: number;
  requestTimeoutMs: number;
  retryAttempts: number;
  retryDelayMs: number;
  enableStreaming: boolean;
  enableCaching: boolean;
  cacheTtlMs: number;
  costBudgetPerUser: number;
  costBudgetPerDay: number;
}

/** AI inference request */
export interface AIInferenceRequest {
  prompt: string;
  systemPrompt?: string;
  context?: ConversationMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stopSequences?: string[];
  stream?: boolean;
  userId: string;
  app: QuantApp;
  feature: string;
  metadata?: Record<string, unknown>;
}

/** Conversation message for context */
export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
}

/** AI inference response */
export interface AIInferenceResponse {
  id: string;
  content: string;
  model: string;
  finishReason: 'stop' | 'length' | 'content_filter' | 'error';
  usage: TokenUsage;
  latencyMs: number;
  cached: boolean;
  metadata?: Record<string, unknown>;
}

/** Token usage tracking */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number;
}

/** Streaming chunk */
export interface StreamChunk {
  id: string;
  content: string;
  done: boolean;
  finishReason?: string;
}

/** Content moderation result */
export interface ModerationResult {
  safe: boolean;
  categories: ModerationCategory[];
  overallScore: number;
  action: 'allow' | 'flag' | 'block';
  explanation?: string;
}

/** Moderation category */
export interface ModerationCategory {
  name: string;
  score: number;
  flagged: boolean;
}

/** Recommendation request */
export interface RecommendationRequest {
  userId: string;
  type: 'content' | 'users' | 'products' | 'videos' | 'music';
  context: RecommendationContext;
  limit: number;
  excludeIds?: string[];
}

/** Recommendation context */
export interface RecommendationContext {
  userHistory: string[];
  userPreferences: string[];
  currentContent?: string;
  timeOfDay?: string;
  location?: string;
  device?: string;
}

/** Recommendation result */
export interface RecommendationResult {
  items: RecommendedItem[];
  model: string;
  latencyMs: number;
}

/** Recommended item */
export interface RecommendedItem {
  id: string;
  score: number;
  reason: string;
  category?: string;
}

/** Device control command */
export interface DeviceControlCommand {
  deviceId: string;
  deviceType: string;
  action: string;
  parameters: Record<string, unknown>;
  userId: string;
  confirmationRequired: boolean;
}

/** Device control result */
export interface DeviceControlResult {
  success: boolean;
  deviceId: string;
  action: string;
  result?: Record<string, unknown>;
  error?: string;
  executionTimeMs: number;
}

/** Smart reply suggestion */
export interface SmartReply {
  text: string;
  confidence: number;
  tone: 'casual' | 'professional' | 'friendly' | 'brief';
}

/** Email AI features */
export interface EmailAIResult {
  type: 'summary' | 'compose' | 'categorize' | 'reply_suggestion';
  content: string;
  confidence: number;
  metadata?: Record<string, unknown>;
}

/** Content generation request */
export interface ContentGenerationRequest {
  type: 'caption' | 'hashtags' | 'description' | 'title' | 'alt_text';
  context: string;
  mediaUrl?: string;
  tone?: string;
  length?: 'short' | 'medium' | 'long';
  language?: string;
}

/** AI context memory entry */
export interface ContextMemoryEntry {
  key: string;
  value: string;
  importance: number;
  timestamp: number;
  expiresAt?: number;
}

// ============================================================================
// New Types for Real AI Engine Infrastructure
// ============================================================================

/** Circuit breaker states */
export type CircuitBreakerState = 'closed' | 'open' | 'half-open';

/** Circuit breaker configuration */
export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeoutMs: number;
  halfOpenMaxAttempts: number;
}

/** Provider health status */
export interface ProviderHealth {
  provider: AIProvider;
  state: CircuitBreakerState;
  failureCount: number;
  lastFailureAt: number | null;
  lastSuccessAt: number | null;
}

/** Prompt template loaded from YAML */
export interface PromptTemplate {
  name: string;
  version: string;
  system_prompt: string;
  user_template: string;
  parameters: {
    temperature: number;
    max_tokens: number;
  };
}

/** Semantic cache entry */
export interface SemanticCacheEntry {
  prompt: string;
  response: string;
  embedding: number[];
  createdAt: number;
  ttl: number;
}

/** Safety pipeline result */
export interface SafetyResult {
  text: string;
  redactedEntities: PiiEntity[];
  safetyScore: number;
  isSafe: boolean;
  categories: SafetyCategory[];
}

/** Detected PII entity */
export interface PiiEntity {
  type: 'email' | 'phone' | 'ssn' | 'credit_card' | 'ip_address';
  value: string;
  redacted: string;
  start: number;
  end: number;
}

/** Safety content category */
export interface SafetyCategory {
  name: string;
  score: number;
  flagged: boolean;
}

/** Cost record for tracking usage */
export interface CostRecord {
  userId: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  cost: number;
  timestamp: number;
}

/** Rate limit configuration */
export interface RateLimitConfig {
  requestsPerMinute: number;
  windowMs: number;
}

/** Budget configuration */
export interface BudgetConfig {
  dailyBudget: number;
  perUserBudget: number;
}

/** Fallback chain definition */
export interface FallbackChain {
  models: string[];
  capability: AICapability;
}

/** Retry options */
export interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

/** Budget exceeded error */
export class BudgetExceededError extends Error {
  constructor(
    message: string,
    public readonly userId: string,
    public readonly currentSpend: number,
    public readonly budget: number,
  ) {
    super(message);
    this.name = 'BudgetExceededError';
  }
}

/** Rate limit error */
export class RateLimitError extends Error {
  constructor(
    message: string,
    public readonly userId: string,
    public readonly retryAfterMs: number,
  ) {
    super(message);
    this.name = 'RateLimitError';
  }
}
