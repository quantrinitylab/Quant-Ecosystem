// ============================================================================
// AI Core - Central AI Engine
// ============================================================================

import type {
  AIEngineConfig,
  AIInferenceRequest,
  AIInferenceResponse,
  AIModelConfig,
  StreamChunk,
  TokenUsage,
} from '../types';
import { ContextManager } from './context-manager';
import { ModelRouter } from './model-router';

/** Default engine configuration */
const DEFAULT_CONFIG: AIEngineConfig = {
  defaultModel: 'gpt-4-turbo',
  maxConcurrentRequests: 50,
  requestTimeoutMs: 30000,
  retryAttempts: 3,
  retryDelayMs: 1000,
  enableStreaming: true,
  enableCaching: true,
  cacheTtlMs: 300000,
  costBudgetPerUser: 10.0,
  costBudgetPerDay: 1000.0,
};

/** Request queue item */
interface QueuedRequest {
  id: string;
  request: AIInferenceRequest;
  resolve: (value: AIInferenceResponse) => void;
  reject: (reason: Error) => void;
  timestamp: number;
}

/**
 * Central AI Engine
 *
 * The brain of the Quant Ecosystem's AI capabilities.
 * Routes requests to appropriate models, manages context,
 * handles rate limiting, caching, and cost tracking.
 */
export class AIEngine {
  private config: AIEngineConfig;
  private contextManager: ContextManager;
  private modelRouter: ModelRouter;
  private activeRequests: number = 0;
  private requestQueue: QueuedRequest[] = [];
  private cache: Map<string, { response: AIInferenceResponse; expiresAt: number }> = new Map();
  private userCostTracker: Map<string, { total: number; resetAt: number }> = new Map();
  private dailyCost: number = 0;
  private dailyResetAt: number = Date.now() + 86400000;

  constructor(config: Partial<AIEngineConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.contextManager = new ContextManager();
    this.modelRouter = new ModelRouter();
  }

  /**
   * Process an AI inference request
   */
  async infer(request: AIInferenceRequest): Promise<AIInferenceResponse> {
    // Check rate limits and budgets
    this.checkBudget(request.userId);

    // Check cache
    if (this.config.enableCaching && !request.stream) {
      const cached = this.getCachedResponse(request);
      if (cached) return cached;
    }

    // Route to appropriate model
    const model = this.modelRouter.selectModel(request);

    // Build context-enriched prompt
    const enrichedPrompt = await this.contextManager.enrichPrompt(
      request.userId,
      request.prompt,
      request.context || []
    );

    // Queue or execute request
    if (this.activeRequests >= this.config.maxConcurrentRequests) {
      return this.queueRequest(request);
    }

    return this.executeInference(request, enrichedPrompt, model);
  }

  /**
   * Stream an AI inference response
   */
  async *stream(request: AIInferenceRequest): AsyncGenerator<StreamChunk> {
    const model = this.modelRouter.selectModel(request);
    const enrichedPrompt = await this.contextManager.enrichPrompt(
      request.userId,
      request.prompt,
      request.context || []
    );

    const requestId = this.generateRequestId();
    const words = this.simulateResponse(enrichedPrompt, model).split(' ');

    let accumulated = '';
    for (let i = 0; i < words.length; i++) {
      accumulated += (i > 0 ? ' ' : '') + words[i];
      const done = i === words.length - 1;
      yield {
        id: requestId,
        content: words[i] + (i < words.length - 1 ? ' ' : ''),
        done,
        finishReason: done ? 'stop' : undefined,
      };
      // Simulate latency between chunks
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    // Update context with the response
    await this.contextManager.addToHistory(request.userId, request.prompt, accumulated);
  }

  /**
   * Execute an inference request
   */
  private async executeInference(
    request: AIInferenceRequest,
    enrichedPrompt: string,
    model: AIModelConfig
  ): Promise<AIInferenceResponse> {
    this.activeRequests++;
    const startTime = Date.now();

    try {
      // Simulate AI model inference
      const content = this.simulateResponse(enrichedPrompt, model);
      const latencyMs = Date.now() - startTime + Math.floor(Math.random() * 200);

      // Calculate token usage
      const usage = this.calculateTokenUsage(enrichedPrompt, content, model);

      // Track costs
      this.trackCost(request.userId, usage.estimatedCost);

      const response: AIInferenceResponse = {
        id: this.generateRequestId(),
        content,
        model: model.id,
        finishReason: 'stop',
        usage,
        latencyMs,
        cached: false,
      };

      // Cache the response
      if (this.config.enableCaching) {
        this.cacheResponse(request, response);
      }

      // Update conversation context
      await this.contextManager.addToHistory(request.userId, request.prompt, content);

      // Process queue
      this.processQueue();

      return response;
    } finally {
      this.activeRequests--;
    }
  }

  /**
   * Queue a request when at capacity
   */
  private queueRequest(request: AIInferenceRequest): Promise<AIInferenceResponse> {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({
        id: this.generateRequestId(),
        request,
        resolve,
        reject,
        timestamp: Date.now(),
      });
    });
  }

  /**
   * Process queued requests
   */
  private async processQueue(): Promise<void> {
    while (this.requestQueue.length > 0 && this.activeRequests < this.config.maxConcurrentRequests) {
      const queued = this.requestQueue.shift();
      if (!queued) break;

      // Check if request has timed out
      if (Date.now() - queued.timestamp > this.config.requestTimeoutMs) {
        queued.reject(new Error('Request timed out in queue'));
        continue;
      }

      try {
        const response = await this.infer(queued.request);
        queued.resolve(response);
      } catch (error) {
        queued.reject(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }

  /**
   * Simulate an AI response (in production, calls actual model API)
   */
  private simulateResponse(prompt: string, model: AIModelConfig): string {
    // Generate contextual response based on prompt content
    const promptLower = prompt.toLowerCase();

    if (promptLower.includes('summarize') || promptLower.includes('summary')) {
      return 'Here is a concise summary of the content: The main points cover the key topics discussed, highlighting the most important information and conclusions drawn from the material.';
    }
    if (promptLower.includes('translate')) {
      return 'Translation completed successfully. The text has been converted to the target language while preserving the original meaning and context.';
    }
    if (promptLower.includes('code') || promptLower.includes('function')) {
      return 'Here is the implementation:\n\n```typescript\nfunction solution(input: string): string {\n  return input.trim().split("\\n").map(line => line.trimStart()).join("\\n");\n}\n```\n\nThis function processes the input by trimming whitespace and normalizing line indentation.';
    }
    if (promptLower.includes('moderate') || promptLower.includes('content')) {
      return 'Content analysis complete. The content appears to be safe and does not violate any community guidelines. No harmful, inappropriate, or misleading content detected.';
    }

    return `Based on your request, I have analyzed the context and generated a comprehensive response. The key insights are: 1) The primary topic relates to ${prompt.split(' ').slice(0, 3).join(' ')}, 2) Multiple perspectives have been considered, and 3) The recommended approach balances efficiency with quality. Would you like me to elaborate on any specific aspect?`;
  }

  /**
   * Calculate token usage for a request/response pair
   */
  private calculateTokenUsage(prompt: string, response: string, model: AIModelConfig): TokenUsage {
    // Approximate token count (roughly 4 chars per token for English)
    const promptTokens = Math.ceil(prompt.length / 4);
    const completionTokens = Math.ceil(response.length / 4);
    const totalTokens = promptTokens + completionTokens;

    return {
      promptTokens,
      completionTokens,
      totalTokens,
      estimatedCost: promptTokens * model.costPerInputToken + completionTokens * model.costPerOutputToken,
    };
  }

  /**
   * Check if user is within budget
   */
  private checkBudget(userId: string): void {
    // Reset daily budget if needed
    if (Date.now() > this.dailyResetAt) {
      this.dailyCost = 0;
      this.dailyResetAt = Date.now() + 86400000;
    }

    if (this.dailyCost >= this.config.costBudgetPerDay) {
      throw new Error('Daily AI cost budget exceeded');
    }

    const userCost = this.userCostTracker.get(userId);
    if (userCost) {
      if (Date.now() > userCost.resetAt) {
        this.userCostTracker.delete(userId);
      } else if (userCost.total >= this.config.costBudgetPerUser) {
        throw new Error('User AI cost budget exceeded');
      }
    }
  }

  /**
   * Track costs for a user
   */
  private trackCost(userId: string, cost: number): void {
    this.dailyCost += cost;

    const existing = this.userCostTracker.get(userId) || { total: 0, resetAt: Date.now() + 86400000 };
    existing.total += cost;
    this.userCostTracker.set(userId, existing);
  }

  /**
   * Get cached response
   */
  private getCachedResponse(request: AIInferenceRequest): AIInferenceResponse | null {
    const cacheKey = this.generateCacheKey(request);
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return { ...cached.response, cached: true };
    }
    if (cached) {
      this.cache.delete(cacheKey);
    }
    return null;
  }

  /**
   * Cache a response
   */
  private cacheResponse(request: AIInferenceRequest, response: AIInferenceResponse): void {
    const cacheKey = this.generateCacheKey(request);
    this.cache.set(cacheKey, {
      response,
      expiresAt: Date.now() + this.config.cacheTtlMs,
    });
  }

  /**
   * Generate a cache key for a request
   */
  private generateCacheKey(request: AIInferenceRequest): string {
    const key = `${request.model || 'default'}:${request.prompt}:${request.temperature || 0.7}`;
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0;
    }
    return `cache_${Math.abs(hash).toString(36)}`;
  }

  /**
   * Generate a unique request ID
   */
  private generateRequestId(): string {
    return `ai_req_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
  }

  /**
   * Get engine statistics
   */
  getStats(): {
    activeRequests: number;
    queuedRequests: number;
    cacheSize: number;
    dailyCost: number;
  } {
    return {
      activeRequests: this.activeRequests,
      queuedRequests: this.requestQueue.length,
      cacheSize: this.cache.size,
      dailyCost: this.dailyCost,
    };
  }

  /**
   * Clear the response cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get context manager for external access
   */
  getContextManager(): ContextManager {
    return this.contextManager;
  }

  /**
   * Get model router for external access
   */
  getModelRouter(): ModelRouter {
    return this.modelRouter;
  }
}
