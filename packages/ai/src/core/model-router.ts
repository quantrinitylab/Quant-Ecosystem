// ============================================================================
// AI Core - Model Router
// ============================================================================

import type {
  AIModelConfig,
  AIInferenceRequest,
  AICapability,
  FallbackChain,
  TaskType,
  UserTier,
} from '../types';
import type { CircuitBreakerRegistry } from './circuit-breaker';
import { RoutingTable } from './routing-table';
import type { ProviderHealthMonitor } from './provider-health';

/**
 * Model Router
 *
 * Intelligently routes AI requests to the most appropriate model based on:
 * - Request type and required capabilities
 * - Cost constraints
 * - Latency requirements
 * - Model availability and load
 * - Quality requirements
 * - Circuit breaker state
 * - Task-based routing with provider health awareness
 */
export class ModelRouter {
  private models: Map<string, AIModelConfig> = new Map();
  private modelLoad: Map<string, number> = new Map();
  private fallbackChains: FallbackChain[] = [];
  private circuitBreakerRegistry: CircuitBreakerRegistry | null = null;
  private routingTable: RoutingTable | null = null;
  private healthMonitor: ProviderHealthMonitor | null = null;

  constructor(
    circuitBreakerRegistry?: CircuitBreakerRegistry,
    routingTable?: RoutingTable,
    healthMonitor?: ProviderHealthMonitor,
  ) {
    this.circuitBreakerRegistry = circuitBreakerRegistry ?? null;
    this.routingTable = routingTable ?? null;
    this.healthMonitor = healthMonitor ?? null;
    this.registerDefaultModels();
    this.registerDefaultFallbackChains();
  }

  /**
   * Select the best model for a given request
   */
  selectModel(request: AIInferenceRequest): AIModelConfig {
    // If specific model requested, use it
    if (request.model) {
      const model = this.models.get(request.model);
      if (model && this.isModelAvailable(model)) return model;
    }

    // Determine required capabilities from the request
    const capabilities = this.inferCapabilities(request);

    // Find eligible models
    const eligible = this.getEligibleModels(capabilities, request);

    if (eligible.length === 0) {
      // Use fallback chain
      const fallback = this.getFallbackModel(capabilities);
      if (fallback) return fallback;
      // Ultimate fallback to default model
      const defaultModel = this.models.get('gpt-4o-mini');
      if (!defaultModel) {
        throw new Error('No models available');
      }
      return defaultModel;
    }

    // Score and rank models
    const scored = eligible.map((model) => ({
      model,
      score: this.scoreModel(model, request),
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored[0]!.model;
  }

  /**
   * Select the best model for a task type and user tier
   */
  selectForTask(taskType: TaskType, userTier: UserTier): AIModelConfig {
    // Use internal default routing table if none provided
    const table = this.routingTable ?? this.getDefaultRoutingTable();
    const route = table.getRoute(taskType);

    // Collect candidate model IDs
    const candidateIds = [route.primary, ...route.fallbacks];

    // Filter out models whose provider is unhealthy
    const healthyCandidates: AIModelConfig[] = [];
    for (const id of candidateIds) {
      const model = this.models.get(id);
      if (!model) continue;
      if (this.healthMonitor && !this.healthMonitor.isHealthy(model.provider)) continue;
      healthyCandidates.push(model);
    }

    if (healthyCandidates.length === 0) {
      throw new Error(`No healthy models available for task: ${taskType}`);
    }

    // Route based on user tier
    switch (userTier) {
      case 'free': {
        // Sort by costPerInputToken ascending, pick cheapest
        const sorted = [...healthyCandidates].sort(
          (a, b) => a.costPerInputToken - b.costPerInputToken,
        );
        return sorted[0]!;
      }
      case 'paid': {
        // Use primary model if healthy, else first healthy fallback
        return healthyCandidates[0]!;
      }
      case 'enterprise': {
        // Sort by qualityScore descending, pick best
        const sorted = [...healthyCandidates].sort((a, b) => b.qualityScore - a.qualityScore);
        return sorted[0]!;
      }
    }
  }

  /**
   * Get fallback chain for a capability
   */
  getFallbackChain(capability: AICapability): string[] {
    const chain = this.fallbackChains.find((fc) => fc.capability === capability);
    if (!chain) return ['gpt-4o', 'gpt-4o-mini', 'claude-haiku-4'];
    return chain.models;
  }

  /**
   * Register a new model
   */
  registerModel(config: AIModelConfig): void {
    this.models.set(config.id, config);
    this.modelLoad.set(config.id, 0);
  }

  /**
   * Get all registered models
   */
  getModels(): AIModelConfig[] {
    return Array.from(this.models.values());
  }

  /**
   * Get models by capability
   */
  getModelsByCapability(capability: AICapability): AIModelConfig[] {
    return Array.from(this.models.values()).filter((m) => m.capabilities.includes(capability));
  }

  /**
   * Check if a model is available based on circuit breaker state
   */
  private isModelAvailable(model: AIModelConfig): boolean {
    if (!this.circuitBreakerRegistry) return true;
    const breaker = this.circuitBreakerRegistry.getBreaker(model.provider);
    return breaker.isAvailable();
  }

  /**
   * Get a fallback model from the fallback chains
   */
  private getFallbackModel(capabilities: AICapability[]): AIModelConfig | null {
    const primaryCapability = capabilities[0] ?? 'text_generation';
    const chain = this.getFallbackChain(primaryCapability);

    for (const modelId of chain) {
      const model = this.models.get(modelId);
      if (model && this.isModelAvailable(model)) {
        return model;
      }
    }

    return null;
  }

  /**
   * Infer required capabilities from a request
   */
  private inferCapabilities(request: AIInferenceRequest): AICapability[] {
    const capabilities: AICapability[] = ['text_generation'];
    const promptLower = request.prompt.toLowerCase();

    if (promptLower.includes('summarize') || promptLower.includes('summary')) {
      capabilities.push('text_summarization');
    }
    if (
      promptLower.includes('code') ||
      promptLower.includes('function') ||
      promptLower.includes('implement')
    ) {
      capabilities.push('code_generation');
    }
    if (promptLower.includes('translate') || promptLower.includes('translation')) {
      capabilities.push('translation');
    }
    if (
      promptLower.includes('moderate') ||
      promptLower.includes('safe') ||
      promptLower.includes('appropriate')
    ) {
      capabilities.push('content_moderation');
    }
    if (promptLower.includes('recommend') || promptLower.includes('suggest')) {
      capabilities.push('recommendation');
    }
    if (
      promptLower.includes('sentiment') ||
      promptLower.includes('feeling') ||
      promptLower.includes('emotion')
    ) {
      capabilities.push('sentiment_analysis');
    }
    if (request.feature === 'device_control') {
      capabilities.push('device_control');
    }

    return capabilities;
  }

  /**
   * Get models that support all required capabilities
   */
  private getEligibleModels(
    capabilities: AICapability[],
    request: AIInferenceRequest,
  ): AIModelConfig[] {
    return Array.from(this.models.values()).filter((model) => {
      // Check circuit breaker state
      if (!this.isModelAvailable(model)) return false;

      // Check capabilities
      const hasCapabilities = capabilities.every((cap) => model.capabilities.includes(cap));
      if (!hasCapabilities) return false;

      // Check context length
      const estimatedTokens = Math.ceil(request.prompt.length / 4);
      if (estimatedTokens > model.maxContextLength) return false;

      return true;
    });
  }

  /**
   * Score a model for a specific request
   */
  private scoreModel(model: AIModelConfig, request: AIInferenceRequest): number {
    let score = 0;

    // Quality score (0-40 points)
    score += model.qualityScore * 40;

    // Latency preference (0-20 points, lower is better)
    score += Math.max(0, 20 - model.latencyMs / 100);

    // Cost preference (0-20 points, lower is better)
    const estimatedCost = (request.prompt.length / 4) * model.costPerInputToken;
    score += Math.max(0, 20 - estimatedCost * 1000);

    // Load balancing (0-10 points)
    const load = this.modelLoad.get(model.id) ?? 0;
    score += Math.max(0, 10 - load);

    // Context window fit (0-10 points)
    const utilization = request.prompt.length / 4 / model.maxContextLength;
    score += utilization < 0.8 ? 10 : 5;

    return score;
  }

  /**
   * Get default routing table for selectForTask when none is provided
   */
  private getDefaultRoutingTable(): RoutingTable {
    return new RoutingTable();
  }

  /**
   * Register default models available in the ecosystem
   */
  private registerDefaultModels(): void {
    const defaultModels: AIModelConfig[] = [
      // OpenAI models
      {
        id: 'gpt-4o',
        name: 'GPT-4o',
        provider: 'openai',
        capabilities: [
          'text_generation',
          'text_summarization',
          'code_generation',
          'translation',
          'sentiment_analysis',
          'content_moderation',
          'recommendation',
          'device_control',
        ],
        maxContextLength: 128000,
        maxOutputTokens: 4096,
        costPerInputToken: 0.000005,
        costPerOutputToken: 0.000015,
        latencyMs: 400,
        qualityScore: 0.95,
      },
      {
        id: 'gpt-4o-mini',
        name: 'GPT-4o Mini',
        provider: 'openai',
        capabilities: [
          'text_generation',
          'text_summarization',
          'code_generation',
          'translation',
          'sentiment_analysis',
          'content_moderation',
        ],
        maxContextLength: 128000,
        maxOutputTokens: 4096,
        costPerInputToken: 0.00000015,
        costPerOutputToken: 0.0000006,
        latencyMs: 200,
        qualityScore: 0.85,
      },
      {
        id: 'o3-mini',
        name: 'O3 Mini',
        provider: 'openai',
        capabilities: ['text_generation', 'text_summarization', 'code_generation', 'translation'],
        maxContextLength: 128000,
        maxOutputTokens: 4096,
        costPerInputToken: 0.0000011,
        costPerOutputToken: 0.0000044,
        latencyMs: 600,
        qualityScore: 0.92,
      },
      {
        id: 'tts-1-hd',
        name: 'TTS-1 HD',
        provider: 'openai',
        capabilities: ['voice_tts'],
        maxContextLength: 4000,
        maxOutputTokens: 4000,
        costPerInputToken: 0.000015,
        costPerOutputToken: 0.000015,
        latencyMs: 300,
        qualityScore: 0.9,
      },
      {
        id: 'dall-e-3',
        name: 'DALL-E 3',
        provider: 'openai',
        capabilities: ['image_generation'],
        maxContextLength: 4000,
        maxOutputTokens: 4000,
        costPerInputToken: 0.00004,
        costPerOutputToken: 0.00004,
        latencyMs: 2000,
        qualityScore: 0.92,
      },
      {
        id: 'text-embedding-3-large',
        name: 'Text Embedding 3 Large',
        provider: 'openai',
        capabilities: ['embedding'],
        maxContextLength: 8191,
        maxOutputTokens: 8191,
        costPerInputToken: 0.00000013,
        costPerOutputToken: 0.00000013,
        latencyMs: 100,
        qualityScore: 0.9,
      },
      {
        id: 'omni-moderation-latest',
        name: 'Omni Moderation Latest',
        provider: 'openai',
        capabilities: ['content_moderation'],
        maxContextLength: 32000,
        maxOutputTokens: 4096,
        costPerInputToken: 0,
        costPerOutputToken: 0,
        latencyMs: 150,
        qualityScore: 0.88,
      },
      // Anthropic models
      {
        id: 'claude-sonnet-4',
        name: 'Claude Sonnet 4',
        provider: 'anthropic',
        capabilities: [
          'text_generation',
          'text_summarization',
          'code_generation',
          'translation',
          'sentiment_analysis',
          'content_moderation',
          'recommendation',
          'device_control',
          'long_context',
        ],
        maxContextLength: 200000,
        maxOutputTokens: 4096,
        costPerInputToken: 0.000003,
        costPerOutputToken: 0.000015,
        latencyMs: 500,
        qualityScore: 0.97,
      },
      {
        id: 'claude-haiku-4',
        name: 'Claude Haiku 4',
        provider: 'anthropic',
        capabilities: [
          'text_generation',
          'text_summarization',
          'code_generation',
          'translation',
          'sentiment_analysis',
          'content_moderation',
        ],
        maxContextLength: 200000,
        maxOutputTokens: 4096,
        costPerInputToken: 0.0000008,
        costPerOutputToken: 0.000004,
        latencyMs: 250,
        qualityScore: 0.89,
      },
      // Google models
      {
        id: 'gemini-2.5-pro',
        name: 'Gemini 2.5 Pro',
        provider: 'google',
        capabilities: [
          'text_generation',
          'text_summarization',
          'code_generation',
          'translation',
          'sentiment_analysis',
          'long_context',
        ],
        maxContextLength: 1000000,
        maxOutputTokens: 8192,
        costPerInputToken: 0.00000125,
        costPerOutputToken: 0.00001,
        latencyMs: 600,
        qualityScore: 0.96,
      },
      {
        id: 'gemini-2.5-flash',
        name: 'Gemini 2.5 Flash',
        provider: 'google',
        capabilities: [
          'text_generation',
          'text_summarization',
          'code_generation',
          'translation',
          'long_context',
        ],
        maxContextLength: 1000000,
        maxOutputTokens: 8192,
        costPerInputToken: 0.00000015,
        costPerOutputToken: 0.0000006,
        latencyMs: 200,
        qualityScore: 0.88,
      },
      // DeepSeek models
      {
        id: 'deepseek-v3',
        name: 'DeepSeek V3',
        provider: 'deepseek',
        capabilities: ['text_generation', 'text_summarization', 'code_generation', 'translation'],
        maxContextLength: 64000,
        maxOutputTokens: 4096,
        costPerInputToken: 0.00000027,
        costPerOutputToken: 0.0000011,
        latencyMs: 350,
        qualityScore: 0.88,
      },
      {
        id: 'deepseek-r1',
        name: 'DeepSeek R1',
        provider: 'deepseek',
        capabilities: ['text_generation', 'text_summarization', 'code_generation', 'translation'],
        maxContextLength: 64000,
        maxOutputTokens: 4096,
        costPerInputToken: 0.00000055,
        costPerOutputToken: 0.00000219,
        latencyMs: 800,
        qualityScore: 0.91,
      },
      {
        id: 'deepseek-coder-v3',
        name: 'DeepSeek Coder V3',
        provider: 'deepseek',
        capabilities: ['text_generation', 'code_generation'],
        maxContextLength: 64000,
        maxOutputTokens: 4096,
        costPerInputToken: 0.00000027,
        costPerOutputToken: 0.0000011,
        latencyMs: 350,
        qualityScore: 0.9,
      },
      // Groq models
      {
        id: 'llama-3.3-70b-versatile',
        name: 'Llama 3.3 70B Versatile',
        provider: 'groq',
        capabilities: ['text_generation', 'text_summarization', 'code_generation', 'translation'],
        maxContextLength: 128000,
        maxOutputTokens: 4096,
        costPerInputToken: 0.00000059,
        costPerOutputToken: 0.00000079,
        latencyMs: 100,
        qualityScore: 0.86,
      },
      {
        id: 'llama-3.1-8b-instant',
        name: 'Llama 3.1 8B Instant',
        provider: 'groq',
        capabilities: ['text_generation', 'text_summarization', 'code_generation', 'translation'],
        maxContextLength: 128000,
        maxOutputTokens: 4096,
        costPerInputToken: 0.00000005,
        costPerOutputToken: 0.00000008,
        latencyMs: 50,
        qualityScore: 0.75,
      },
      {
        id: 'whisper-large-v3',
        name: 'Whisper Large V3',
        provider: 'groq',
        capabilities: ['voice_stt'],
        maxContextLength: 25000,
        maxOutputTokens: 25000,
        costPerInputToken: 0.00000011,
        costPerOutputToken: 0.00000011,
        latencyMs: 150,
        qualityScore: 0.88,
      },
      // Mistral models
      {
        id: 'mistral-large-2',
        name: 'Mistral Large 2',
        provider: 'mistral',
        capabilities: ['text_generation', 'text_summarization', 'code_generation', 'translation'],
        maxContextLength: 128000,
        maxOutputTokens: 4096,
        costPerInputToken: 0.000002,
        costPerOutputToken: 0.000006,
        latencyMs: 400,
        qualityScore: 0.9,
      },
      {
        id: 'codestral-2',
        name: 'Codestral 2',
        provider: 'mistral',
        capabilities: ['text_generation', 'code_generation'],
        maxContextLength: 32000,
        maxOutputTokens: 4096,
        costPerInputToken: 0.0000003,
        costPerOutputToken: 0.0000009,
        latencyMs: 200,
        qualityScore: 0.87,
      },
      // Cohere models
      {
        id: 'rerank-v3',
        name: 'Rerank V3',
        provider: 'cohere',
        capabilities: ['reranking'],
        maxContextLength: 4096,
        maxOutputTokens: 4096,
        costPerInputToken: 0.000002,
        costPerOutputToken: 0.000002,
        latencyMs: 100,
        qualityScore: 0.92,
      },
      {
        id: 'embed-multilingual-v3',
        name: 'Embed Multilingual V3',
        provider: 'cohere',
        capabilities: ['embedding'],
        maxContextLength: 512,
        maxOutputTokens: 512,
        costPerInputToken: 0.0000001,
        costPerOutputToken: 0.0000001,
        latencyMs: 80,
        qualityScore: 0.91,
      },
      // DeepInfra models
      {
        id: 'bge-large-en-v1.5',
        name: 'BGE Large EN v1.5',
        provider: 'deepinfra',
        capabilities: ['embedding'],
        maxContextLength: 512,
        maxOutputTokens: 512,
        costPerInputToken: 0.00000001,
        costPerOutputToken: 0.00000001,
        latencyMs: 50,
        qualityScore: 0.85,
      },
      {
        id: 'qwen-2.5-72b',
        name: 'Qwen 2.5 72B',
        provider: 'deepinfra',
        capabilities: ['text_generation', 'text_summarization', 'code_generation', 'translation'],
        maxContextLength: 32000,
        maxOutputTokens: 4096,
        costPerInputToken: 0.00000035,
        costPerOutputToken: 0.0000004,
        latencyMs: 300,
        qualityScore: 0.87,
      },
      // Perplexity models
      {
        id: 'sonar-pro',
        name: 'Sonar Pro',
        provider: 'perplexity',
        capabilities: ['text_generation', 'text_summarization', 'web_search'],
        maxContextLength: 127000,
        maxOutputTokens: 4096,
        costPerInputToken: 0.000003,
        costPerOutputToken: 0.000015,
        latencyMs: 500,
        qualityScore: 0.89,
      },
      // Fireworks models
      {
        id: 'fireworks-llama-3.1-405b',
        name: 'Fireworks Llama 3.1 405B',
        provider: 'fireworks',
        capabilities: ['text_generation', 'text_summarization', 'code_generation', 'translation'],
        maxContextLength: 128000,
        maxOutputTokens: 4096,
        costPerInputToken: 0.000003,
        costPerOutputToken: 0.000003,
        latencyMs: 300,
        qualityScore: 0.88,
      },
    ];

    for (const model of defaultModels) {
      this.registerModel(model);
    }
  }

  /**
   * Register default fallback chains
   */
  private registerDefaultFallbackChains(): void {
    this.fallbackChains = [
      {
        capability: 'text_generation',
        models: ['gpt-4o', 'gpt-4o-mini', 'claude-haiku-4'],
      },
      {
        capability: 'code_generation',
        models: ['gpt-4o', 'claude-sonnet-4', 'gpt-4o-mini'],
      },
      {
        capability: 'text_summarization',
        models: ['gpt-4o-mini', 'claude-haiku-4', 'gpt-4o'],
      },
      {
        capability: 'content_moderation',
        models: ['omni-moderation-latest', 'gpt-4o-mini', 'claude-haiku-4'],
      },
    ];
  }

  /**
   * Update load for a model
   */
  updateLoad(modelId: string, delta: number): void {
    const current = this.modelLoad.get(modelId) ?? 0;
    this.modelLoad.set(modelId, Math.max(0, current + delta));
  }
}
