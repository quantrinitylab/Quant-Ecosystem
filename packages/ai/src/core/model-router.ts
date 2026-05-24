// ============================================================================
// AI Core - Model Router
// ============================================================================

import type { AIModelConfig, AIInferenceRequest, AICapability, AIProvider } from '../types';

/**
 * Model Router
 *
 * Intelligently routes AI requests to the most appropriate model based on:
 * - Request type and required capabilities
 * - Cost constraints
 * - Latency requirements
 * - Model availability and load
 * - Quality requirements
 */
export class ModelRouter {
  private models: Map<string, AIModelConfig> = new Map();
  private modelLoad: Map<string, number> = new Map();

  constructor() {
    this.registerDefaultModels();
  }

  /**
   * Select the best model for a given request
   */
  selectModel(request: AIInferenceRequest): AIModelConfig {
    // If specific model requested, use it
    if (request.model) {
      const model = this.models.get(request.model);
      if (model) return model;
    }

    // Determine required capabilities from the request
    const capabilities = this.inferCapabilities(request);

    // Find eligible models
    const eligible = this.getEligibleModels(capabilities, request);

    if (eligible.length === 0) {
      // Fallback to default model
      return this.models.get('gpt-4-turbo')!;
    }

    // Score and rank models
    const scored = eligible.map((model) => ({
      model,
      score: this.scoreModel(model, request),
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored[0].model;
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
    return Array.from(this.models.values()).filter((m) =>
      m.capabilities.includes(capability)
    );
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
    if (promptLower.includes('code') || promptLower.includes('function') || promptLower.includes('implement')) {
      capabilities.push('code_generation');
    }
    if (promptLower.includes('translate') || promptLower.includes('translation')) {
      capabilities.push('translation');
    }
    if (promptLower.includes('moderate') || promptLower.includes('safe') || promptLower.includes('appropriate')) {
      capabilities.push('content_moderation');
    }
    if (promptLower.includes('recommend') || promptLower.includes('suggest')) {
      capabilities.push('recommendation');
    }
    if (promptLower.includes('sentiment') || promptLower.includes('feeling') || promptLower.includes('emotion')) {
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
  private getEligibleModels(capabilities: AICapability[], request: AIInferenceRequest): AIModelConfig[] {
    return Array.from(this.models.values()).filter((model) => {
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
    const load = this.modelLoad.get(model.id) || 0;
    score += Math.max(0, 10 - load);

    // Context window fit (0-10 points)
    const utilization = (request.prompt.length / 4) / model.maxContextLength;
    score += utilization < 0.8 ? 10 : 5;

    return score;
  }

  /**
   * Register default models available in the ecosystem
   */
  private registerDefaultModels(): void {
    const defaultModels: AIModelConfig[] = [
      {
        id: 'gpt-4-turbo',
        name: 'GPT-4 Turbo',
        provider: 'openai',
        capabilities: [
          'text_generation', 'text_summarization', 'code_generation',
          'translation', 'sentiment_analysis', 'content_moderation',
          'recommendation', 'device_control',
        ],
        maxContextLength: 128000,
        maxOutputTokens: 4096,
        costPerInputToken: 0.00001,
        costPerOutputToken: 0.00003,
        latencyMs: 500,
        qualityScore: 0.95,
      },
      {
        id: 'gpt-3.5-turbo',
        name: 'GPT-3.5 Turbo',
        provider: 'openai',
        capabilities: [
          'text_generation', 'text_summarization', 'code_generation',
          'translation', 'sentiment_analysis', 'content_moderation',
        ],
        maxContextLength: 16000,
        maxOutputTokens: 4096,
        costPerInputToken: 0.0000005,
        costPerOutputToken: 0.0000015,
        latencyMs: 200,
        qualityScore: 0.8,
      },
      {
        id: 'claude-3-opus',
        name: 'Claude 3 Opus',
        provider: 'anthropic',
        capabilities: [
          'text_generation', 'text_summarization', 'code_generation',
          'translation', 'sentiment_analysis', 'content_moderation',
          'recommendation', 'device_control',
        ],
        maxContextLength: 200000,
        maxOutputTokens: 4096,
        costPerInputToken: 0.000015,
        costPerOutputToken: 0.000075,
        latencyMs: 600,
        qualityScore: 0.97,
      },
      {
        id: 'llama-3-70b',
        name: 'Llama 3 70B',
        provider: 'meta',
        capabilities: [
          'text_generation', 'text_summarization', 'code_generation',
          'translation', 'sentiment_analysis',
        ],
        maxContextLength: 8000,
        maxOutputTokens: 2048,
        costPerInputToken: 0.0000007,
        costPerOutputToken: 0.0000009,
        latencyMs: 300,
        qualityScore: 0.85,
      },
      {
        id: 'stable-diffusion-xl',
        name: 'Stable Diffusion XL',
        provider: 'stability',
        capabilities: ['image_generation', 'image_analysis'],
        maxContextLength: 77,
        maxOutputTokens: 0,
        costPerInputToken: 0,
        costPerOutputToken: 0.02,
        latencyMs: 3000,
        qualityScore: 0.9,
      },
      {
        id: 'whisper-large-v3',
        name: 'Whisper Large V3',
        provider: 'whisper',
        capabilities: ['audio_transcription', 'translation'],
        maxContextLength: 0,
        maxOutputTokens: 0,
        costPerInputToken: 0.0001,
        costPerOutputToken: 0,
        latencyMs: 1000,
        qualityScore: 0.92,
      },
    ];

    for (const model of defaultModels) {
      this.registerModel(model);
    }
  }

  /**
   * Update load for a model
   */
  updateLoad(modelId: string, delta: number): void {
    const current = this.modelLoad.get(modelId) || 0;
    this.modelLoad.set(modelId, Math.max(0, current + delta));
  }
}
