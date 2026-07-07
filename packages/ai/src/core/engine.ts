// ============================================================================
// AI Core - Central AI Engine (Real Implementation)
// ============================================================================

import { generateText, streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import {
  BedrockRuntimeClient,
  ConverseCommand,
  ConverseStreamCommand,
  type Message as BedrockMessage,
  type SystemContentBlock as BedrockSystemBlock,
} from '@aws-sdk/client-bedrock-runtime';
import type {
  AIEngineConfig,
  AIInferenceRequest,
  AIInferenceResponse,
  AIModelConfig,
  AIProvider,
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
  defaultModel: process.env['AI_DEFAULT_MODEL'] ?? 'gpt-4o',
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
  private googleProvider: ReturnType<typeof createGoogleGenerativeAI> | null = null;
  private openrouterProvider: ReturnType<typeof createOpenAI> | null = null;
  private bedrockClient: BedrockRuntimeClient | null = null;

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
    if (process.env['GOOGLE_API_KEY']) {
      this.googleProvider = createGoogleGenerativeAI({ apiKey: process.env['GOOGLE_API_KEY'] });
    }
    // OpenRouter: a single OpenAI-compatible key that unlocks the whole model
    // catalogue (the ecosystem's default multi-model source).
    if (process.env['OPENROUTER_API_KEY']) {
      this.openrouterProvider = createOpenAI({
        apiKey: process.env['OPENROUTER_API_KEY'],
        baseURL: process.env['OPENROUTER_BASE_URL'] ?? 'https://openrouter.ai/api/v1',
      });
    }

    // Amazon Bedrock: uses AWS credentials (no external provider key required).
    // Dedicated BEDROCK_* env vars are passed explicitly so we never clobber the
    // global AWS_* credentials used by SES / S3 elsewhere in the platform. When
    // only BEDROCK_REGION is set and USE_BEDROCK_DEFAULT_CREDS=true, we fall back
    // to the default AWS credential chain (e.g. EKS IRSA role).
    const bedrockRegion = process.env['BEDROCK_REGION'] ?? process.env['AWS_REGION'];
    const bedrockAccessKeyId = process.env['BEDROCK_ACCESS_KEY_ID'];
    const bedrockSecretAccessKey = process.env['BEDROCK_SECRET_ACCESS_KEY'];
    if (bedrockRegion && bedrockAccessKeyId && bedrockSecretAccessKey) {
      this.bedrockClient = new BedrockRuntimeClient({
        region: bedrockRegion,
        credentials: {
          accessKeyId: bedrockAccessKeyId,
          secretAccessKey: bedrockSecretAccessKey,
          ...(process.env['BEDROCK_SESSION_TOKEN']
            ? { sessionToken: process.env['BEDROCK_SESSION_TOKEN'] }
            : {}),
        },
      });
    } else if (bedrockRegion && process.env['USE_BEDROCK_DEFAULT_CREDS'] === 'true') {
      this.bedrockClient = new BedrockRuntimeClient({ region: bedrockRegion });
    }

    // Tell the router which providers are actually configured so it never
    // selects a model whose credentials are missing.
    const configured = new Set<AIProvider>();
    if (this.openaiProvider) configured.add('openai');
    if (this.anthropicProvider) configured.add('anthropic');
    if (this.googleProvider) configured.add('google');
    if (this.openrouterProvider) configured.add('openrouter');
    if (this.bedrockClient) configured.add('bedrock');
    this.modelRouter.setAvailableProviders(configured);
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
    if (model.provider === 'google') {
      if (!this.googleProvider) {
        throw new Error(
          'GOOGLE_API_KEY not configured. Set the environment variable to use Google models.',
        );
      }
      return this.googleProvider(model.id);
    }
    if (model.provider === 'openrouter') {
      if (!this.openrouterProvider) {
        throw new Error(
          'OPENROUTER_API_KEY not configured. Set the environment variable to use OpenRouter models.',
        );
      }
      return this.openrouterProvider(model.id);
    }
    if (model.provider === 'bedrock') {
      // Bedrock does not use the Vercel AI SDK model interface; it is invoked
      // directly via the Converse API (see bedrockConverse / bedrockConverseStream).
      throw new Error('Bedrock models are invoked via the Converse API, not getProviderModel.');
    }
    throw new Error(`Unsupported provider: ${model.provider}`);
  }

  /**
   * Split our flat message list into the Bedrock Converse shape:
   * system prompts go into a dedicated `system` array, the rest become
   * alternating user/assistant turns.
   */
  private toBedrockMessages(
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
  ): { system: BedrockSystemBlock[]; conversation: BedrockMessage[] } {
    const system: BedrockSystemBlock[] = [];
    const conversation: BedrockMessage[] = [];
    for (const msg of messages) {
      if (msg.role === 'system') {
        system.push({ text: msg.content });
      } else {
        conversation.push({ role: msg.role, content: [{ text: msg.content }] });
      }
    }
    return { system, conversation };
  }

  /**
   * Invoke a Bedrock model via the Converse API (model-agnostic across
   * Anthropic Claude, Amazon Nova, Meta Llama, etc.). Returns a shape aligned
   * with the Vercel AI SDK `generateText` result so downstream usage/token
   * extraction works uniformly.
   */
  private async bedrockConverse(
    model: AIModelConfig,
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    opts: { temperature: number; maxTokens: number },
  ): Promise<{ text: string; usage: { inputTokens: number; outputTokens: number } }> {
    if (!this.bedrockClient) {
      throw new Error(
        'Amazon Bedrock is not configured. Set BEDROCK_REGION + BEDROCK_ACCESS_KEY_ID + ' +
          'BEDROCK_SECRET_ACCESS_KEY (or USE_BEDROCK_DEFAULT_CREDS=true).',
      );
    }
    const { system, conversation } = this.toBedrockMessages(messages);
    const command = new ConverseCommand({
      modelId: model.id,
      messages: conversation,
      ...(system.length > 0 ? { system } : {}),
      inferenceConfig: { maxTokens: opts.maxTokens, temperature: opts.temperature },
    });
    const response = await this.bedrockClient.send(command);
    const text = response.output?.message?.content?.map((block) => block.text ?? '').join('') ?? '';
    return {
      text,
      usage: {
        inputTokens: response.usage?.inputTokens ?? 0,
        outputTokens: response.usage?.outputTokens ?? 0,
      },
    };
  }

  /**
   * Stream a Bedrock model response via the ConverseStream API, yielding text
   * deltas as they arrive.
   */
  private async *bedrockConverseStream(
    model: AIModelConfig,
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    opts: { temperature: number; maxTokens: number },
  ): AsyncGenerator<string> {
    if (!this.bedrockClient) {
      throw new Error(
        'Amazon Bedrock is not configured. Set BEDROCK_REGION + BEDROCK_ACCESS_KEY_ID + ' +
          'BEDROCK_SECRET_ACCESS_KEY (or USE_BEDROCK_DEFAULT_CREDS=true).',
      );
    }
    const { system, conversation } = this.toBedrockMessages(messages);
    const command = new ConverseStreamCommand({
      modelId: model.id,
      messages: conversation,
      ...(system.length > 0 ? { system } : {}),
      inferenceConfig: { maxTokens: opts.maxTokens, temperature: opts.temperature },
    });
    const response = await this.bedrockClient.send(command);
    if (!response.stream) return;
    for await (const event of response.stream) {
      const delta = event.contentBlockDelta?.delta?.text;
      if (delta) yield delta;
    }
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

            // Amazon Bedrock uses the AWS SDK Converse API directly.
            if (model.provider === 'bedrock') {
              return this.bedrockConverse(model, messages, {
                temperature: request.temperature ?? 0.7,
                maxTokens: request.maxTokens ?? model.maxOutputTokens,
              });
            }

            const providerModel = this.getProviderModel(model);

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
        promptTokens:
          (response.usage as any)?.promptTokens ??
          response.usage?.inputTokens ??
          Math.ceil(enrichedPrompt.length / 4),
        completionTokens:
          (response.usage as any)?.completionTokens ??
          response.usage?.outputTokens ??
          Math.ceil((response.text || '').length / 4),
        totalTokens:
          ((response.usage as any)?.promptTokens ?? response.usage?.inputTokens ?? 0) +
          ((response.usage as any)?.completionTokens ?? response.usage?.outputTokens ?? 0),
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

    // Wrap the initial stream setup in the circuit breaker
    const breaker = this.circuitBreakerRegistry.getBreaker(model.provider);
    let textStream: AsyncIterable<string>;

    try {
      if (model.provider === 'bedrock') {
        // The AWS call is issued lazily on first iteration of the generator.
        textStream = this.bedrockConverseStream(model, messages, {
          temperature: request.temperature ?? 0.7,
          maxTokens: request.maxTokens ?? model.maxOutputTokens,
        });
      } else {
        const providerModel = this.getProviderModel(model);
        const result = await breaker.execute(async () => {
          return streamText({
            model: providerModel as any,
            messages,
            temperature: request.temperature ?? 0.7,
            maxOutputTokens: request.maxTokens ?? model.maxOutputTokens,
          });
        });
        textStream = result.textStream;
      }
    } catch (error) {
      // Circuit breaker recorded the failure
      throw error;
    }

    let accumulated = '';
    let streamFailed = false;

    try {
      for await (const chunk of textStream) {
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
