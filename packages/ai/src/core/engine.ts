// ============================================================================
// AI Core - Central AI Engine (Real Implementation)
// ============================================================================

import { generateText, streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
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
import { CircuitBreakerRegistry } from './circuit-breaker';
import { retryWithBackoff } from './retry';
import { SemanticCache } from './semantic-cache';
import { SafetyPipeline } from './safety';
import { CostTracker } from './cost-tracker';

/** Default engine configuration */
const DEFAULT_CONFIG: AIEngineConfig = {
  defaultModel: 'gpt-4o',
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

/**
 * Central AI Engine
 *
 * The brain of the Quant Ecosystem's AI capabilities.
 * Uses Vercel AI SDK with OpenAI and Anthropic providers.
 * Integrates circuit breaker, retry, caching, safety, and cost tracking.
 */
export class AIEngine {
  private config: AIEngineConfig;
  private contextManager: ContextManager;
  private modelRouter: ModelRouter;
  private circuitBreakerRegistry: CircuitBreakerRegistry;
  private semanticCache: SemanticCache;
  private safetyPipeline: SafetyPipeline;
  private costTracker: CostTracker;
  private activeRequests: number = 0;
  private openaiProvider: ReturnType<typeof createOpenAI> | null = null;
  private anthropicProvider: ReturnType<typeof createAnthropic> | null = null;

  constructor(config: Partial<AIEngineConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.circuitBreakerRegistry = new CircuitBreakerRegistry();
    this.modelRouter = new ModelRouter(this.circuitBreakerRegistry);
    this.contextManager = new ContextManager();
    this.semanticCache = new SemanticCache(this.config.cacheTtlMs);
    this.safetyPipeline = new SafetyPipeline();
    this.costTracker = new CostTracker({
      dailyBudget: this.config.costBudgetPerDay,
      perUserBudget: this.config.costBudgetPerUser,
    });

    this.initializeProviders();
  }

  /**
   * Initialize AI SDK providers from environment variables
   */
  private initializeProviders(): void {
    const openaiKey = process.env['OPENAI_API_KEY'];
    const anthropicKey = process.env['ANTHROPIC_API_KEY'];

    if (openaiKey) {
      this.openaiProvider = createOpenAI({ apiKey: openaiKey });
    }
    if (anthropicKey) {
      this.anthropicProvider = createAnthropic({ apiKey: anthropicKey });
    }
  }

  /**
   * Get the appropriate AI SDK model instance for a model config
   */
  private getProviderModel(model: AIModelConfig) {
    if (model.provider === 'openai') {
      if (!this.openaiProvider) {
        throw new Error(
          'OPENAI_API_KEY not configured. Set the environment variable to use OpenAI models.',
        );
      }
      return this.openaiProvider(model.id);
    }
    if (model.provider === 'anthropic') {
      if (!this.anthropicProvider) {
        throw new Error(
          'ANTHROPIC_API_KEY not configured. Set the environment variable to use Anthropic models.',
        );
      }
      return this.anthropicProvider(model.id);
    }
    throw new Error(`Unsupported provider: ${model.provider}`);
  }

  /**
   * Process an AI inference request
   */
  async infer(request: AIInferenceRequest): Promise<AIInferenceResponse> {
    // Check rate limits and budgets
    this.costTracker.checkBudget(request.userId);
    this.costTracker.checkRateLimit(request.userId);

    // Process input through safety pipeline
    const safetyResult = this.safetyPipeline.processInput(request.prompt);
    const safePrompt = safetyResult.text;

    // Check semantic cache
    if (this.config.enableCaching && !request.stream) {
      const cached = this.semanticCache.get(safePrompt);
      if (cached) {
        return {
          id: this.generateRequestId(),
          content: cached,
          model: request.model || this.config.defaultModel,
          finishReason: 'stop',
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, estimatedCost: 0 },
          latencyMs: 0,
          cached: true,
        };
      }
    }

    // Route to appropriate model
    const model = this.modelRouter.selectModel(request);

    // Build context-enriched prompt
    const enrichedPrompt = await this.contextManager.enrichPrompt(
      request.userId,
      safePrompt,
      request.context || [],
    );

    // Execute with circuit breaker and retry
    const breaker = this.circuitBreakerRegistry.getBreaker(model.provider);

    const startTime = Date.now();
    this.activeRequests++;

    try {
      const response = await breaker.execute(async () => {
        return retryWithBackoff(
          async () => {
            const providerModel = this.getProviderModel(model);

            const messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [];

            if (request.systemPrompt) {
              messages.push({ role: 'system', content: request.systemPrompt });
            }

            // Add context messages
            if (request.context) {
              for (const msg of request.context) {
                messages.push({ role: msg.role, content: msg.content });
              }
            }

            messages.push({ role: 'user', content: enrichedPrompt });

            const result = await generateText({
              model: providerModel as any,
              messages,
              temperature: request.temperature ?? 0.7,
              maxOutputTokens: request.maxTokens ?? model.maxOutputTokens,
            });

            return result;
          },
          { maxRetries: this.config.retryAttempts, baseDelayMs: this.config.retryDelayMs },
        );
      });

      const latencyMs = Date.now() - startTime;

      // Calculate usage
      const usage: TokenUsage = {
        promptTokens: response.usage?.inputTokens ?? Math.ceil(enrichedPrompt.length / 4),
        completionTokens:
          response.usage?.outputTokens ?? Math.ceil((response.text || '').length / 4),
        totalTokens: (response.usage?.inputTokens ?? 0) + (response.usage?.outputTokens ?? 0),
        estimatedCost: 0,
      };
      usage.totalTokens = usage.promptTokens + usage.completionTokens;
      usage.estimatedCost =
        usage.promptTokens * model.costPerInputToken +
        usage.completionTokens * model.costPerOutputToken;

      // Track costs
      this.costTracker.trackUsage(
        request.userId,
        model.id,
        usage.promptTokens,
        usage.completionTokens,
        usage.estimatedCost,
      );

      const content = response.text || '';

      // Process output through safety pipeline
      const outputSafety = this.safetyPipeline.processOutput(content);

      // Cache the response
      if (this.config.enableCaching) {
        this.semanticCache.set(safePrompt, outputSafety.text);
      }

      // Update conversation context
      await this.contextManager.addToHistory(request.userId, request.prompt, outputSafety.text);

      return {
        id: this.generateRequestId(),
        content: outputSafety.text,
        model: model.id,
        finishReason: 'stop',
        usage,
        latencyMs,
        cached: false,
      };
    } finally {
      this.activeRequests--;
    }
  }

  /**
   * Stream an AI inference response
   */
  async *stream(request: AIInferenceRequest): AsyncGenerator<StreamChunk> {
    // Check rate limits and budgets
    this.costTracker.checkBudget(request.userId);
    this.costTracker.checkRateLimit(request.userId);

    // Process input through safety pipeline
    const safetyResult = this.safetyPipeline.processInput(request.prompt);
    const safePrompt = safetyResult.text;

    const model = this.modelRouter.selectModel(request);
    const enrichedPrompt = await this.contextManager.enrichPrompt(
      request.userId,
      safePrompt,
      request.context || [],
    );

    const providerModel = this.getProviderModel(model);
    const requestId = this.generateRequestId();

    const messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [];

    if (request.systemPrompt) {
      messages.push({ role: 'system', content: request.systemPrompt });
    }

    if (request.context) {
      for (const msg of request.context) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    messages.push({ role: 'user', content: enrichedPrompt });

    // Wrap the initial streamText call in the circuit breaker
    const breaker = this.circuitBreakerRegistry.getBreaker(model.provider);
    let result: ReturnType<typeof streamText>;

    try {
      result = await breaker.execute(async () => {
        return streamText({
          model: providerModel as any,
          messages,
          temperature: request.temperature ?? 0.7,
          maxOutputTokens: request.maxTokens ?? model.maxOutputTokens,
        });
      });
    } catch (error) {
      // Circuit breaker recorded the failure
      throw error;
    }

    let accumulated = '';
    let streamFailed = false;

    try {
      for await (const chunk of result.textStream) {
        accumulated += chunk;
        yield {
          id: requestId,
          content: chunk,
          done: false,
        };
      }
    } catch (error) {
      // Record streaming failure in the circuit breaker
      streamFailed = true;
      breaker.onFailure();
      throw error;
    }

    if (!streamFailed) {
      yield {
        id: requestId,
        content: '',
        done: true,
        finishReason: 'stop',
      };
    }

    // Update context with the response
    await this.contextManager.addToHistory(request.userId, request.prompt, accumulated);

    // Track usage (estimated)
    const promptTokens = Math.ceil(enrichedPrompt.length / 4);
    const completionTokens = Math.ceil(accumulated.length / 4);
    const cost =
      promptTokens * model.costPerInputToken + completionTokens * model.costPerOutputToken;
    this.costTracker.trackUsage(request.userId, model.id, promptTokens, completionTokens, cost);
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
    cacheSize: number;
    dailyCost: number;
  } {
    return {
      activeRequests: this.activeRequests,
      cacheSize: this.semanticCache.size(),
      dailyCost: this.costTracker.getDailySpend(),
    };
  }

  /**
   * Clear the response cache
   */
  clearCache(): void {
    this.semanticCache.invalidate();
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

  /**
   * Get cost tracker for external access
   */
  getCostTracker(): CostTracker {
    return this.costTracker;
  }

  /**
   * Get safety pipeline for external access
   */
  getSafetyPipeline(): SafetyPipeline {
    return this.safetyPipeline;
  }
}
