// ============================================================================
// Performance Package - AI Cost Router
// Routes AI requests by complexity to optimal model with cost estimation
// ============================================================================

import { z } from 'zod';

/** Model tier for routing */
export type ModelTier = 'small' | 'medium' | 'large';

/** Context for routing decision */
export interface RoutingContext {
  userFacing: boolean;
  maxLatencyMs?: number;
  costBudget?: number;
  requiredCapabilities?: string[];
  priority?: 'low' | 'normal' | 'high';
}

/** Model configuration */
export interface ModelConfig {
  id: string;
  tier: ModelTier;
  costPer1kTokens: number;
  maxTokens: number;
  avgLatencyMs: number;
  capabilities: string[];
}

/** Routing decision result */
export interface RoutingDecision {
  model: ModelConfig;
  streaming: boolean;
  estimatedCost: number;
  estimatedLatencyMs: number;
  reason: string;
  complexity: PromptComplexity;
}

/** Prompt complexity classification */
export type PromptComplexity = 'simple' | 'moderate' | 'complex';

/** Cost estimation result */
export interface CostEstimate {
  inputTokens: number;
  outputTokens: number;
  totalCost: number;
  model: string;
}

/** Zod schema for routing context validation */
export const RoutingContextSchema = z.object({
  userFacing: z.boolean(),
  maxLatencyMs: z.number().positive().optional(),
  costBudget: z.number().positive().optional(),
  requiredCapabilities: z.array(z.string()).optional(),
  priority: z.enum(['low', 'normal', 'high']).optional(),
});

/**
 * AICostRouter routes AI requests to the optimal model based on
 * prompt complexity, user context, and cost constraints.
 */
export class AICostRouter {
  private readonly models: Map<string, ModelConfig>;
  private readonly complexityThresholds: { simpleMaxTokens: number; moderateMaxTokens: number };
  private totalRequests: number;
  private totalCost: number;

  constructor(
    config: {
      simpleMaxTokens?: number;
      moderateMaxTokens?: number;
    } = {},
  ) {
    this.models = new Map();
    this.complexityThresholds = {
      simpleMaxTokens: config.simpleMaxTokens ?? 50,
      moderateMaxTokens: config.moderateMaxTokens ?? 200,
    };
    this.totalRequests = 0;
    this.totalCost = 0;

    // Register default models
    this.registerDefaultModels();
  }

  /**
   * Route an AI request to the optimal model based on prompt and context.
   */
  routeRequest(prompt: string, context: RoutingContext): RoutingDecision {
    RoutingContextSchema.parse(context);

    const complexity = this.classifyComplexity(prompt);
    const targetTier = this.selectTier(complexity, context);
    const model = this.selectModel(targetTier, context);
    const streaming = this.shouldStream(context);
    const estimatedCost = this.estimateCost(prompt, model);

    this.totalRequests++;
    this.totalCost += estimatedCost.totalCost;

    return {
      model,
      streaming,
      estimatedCost: estimatedCost.totalCost,
      estimatedLatencyMs: model.avgLatencyMs,
      reason: this.buildReason(complexity, targetTier, context, streaming),
      complexity,
    };
  }

  /**
   * Register a model for routing.
   */
  registerModel(model: ModelConfig): void {
    this.models.set(model.id, model);
  }

  /**
   * Estimate cost for a prompt with a specific model.
   */
  estimateCost(prompt: string, model: ModelConfig): CostEstimate {
    const inputTokens = this.estimateTokenCount(prompt);
    // Estimate output as ~1.5x input for typical responses
    const outputTokens = Math.ceil(inputTokens * 1.5);
    const totalCost = ((inputTokens + outputTokens) / 1000) * model.costPer1kTokens;

    return {
      inputTokens,
      outputTokens,
      totalCost,
      model: model.id,
    };
  }

  /**
   * Get routing statistics.
   */
  getStats(): { totalRequests: number; totalCost: number; avgCostPerRequest: number } {
    return {
      totalRequests: this.totalRequests,
      totalCost: this.totalCost,
      avgCostPerRequest: this.totalRequests > 0 ? this.totalCost / this.totalRequests : 0,
    };
  }

  /**
   * Get all registered models.
   */
  getModels(): ModelConfig[] {
    return [...this.models.values()];
  }

  // ===========================================================================
  // Private methods
  // ===========================================================================

  /** Classify the complexity of a prompt */
  private classifyComplexity(prompt: string): PromptComplexity {
    const tokenCount = this.estimateTokenCount(prompt);

    if (tokenCount <= this.complexityThresholds.simpleMaxTokens) {
      return 'simple';
    }
    if (tokenCount <= this.complexityThresholds.moderateMaxTokens) {
      return 'moderate';
    }
    return 'complex';
  }

  /** Select model tier based on complexity and context */
  private selectTier(complexity: PromptComplexity, context: RoutingContext): ModelTier {
    // If cost budget is very low, prefer smaller models
    if (context.costBudget !== undefined && context.costBudget < 0.01) {
      return 'small';
    }

    // If latency requirement is strict, prefer smaller models
    if (context.maxLatencyMs !== undefined && context.maxLatencyMs < 500) {
      return complexity === 'complex' ? 'medium' : 'small';
    }

    // Default mapping
    switch (complexity) {
      case 'simple':
        return 'small';
      case 'moderate':
        return 'medium';
      case 'complex':
        return 'large';
    }
  }

  /** Select the best model from the target tier */
  private selectModel(tier: ModelTier, context: RoutingContext): ModelConfig {
    const candidates = [...this.models.values()].filter((m) => m.tier === tier);

    // Filter by required capabilities
    if (context.requiredCapabilities && context.requiredCapabilities.length > 0) {
      const capable = candidates.filter((m) =>
        context.requiredCapabilities!.every((cap) => m.capabilities.includes(cap)),
      );
      if (capable.length > 0) {
        return capable[0];
      }
      // Fall back: try a higher tier
      const higherTier = tier === 'small' ? 'medium' : 'large';
      const higherCandidates = [...this.models.values()].filter((m) => m.tier === higherTier);
      if (higherCandidates.length > 0) {
        return higherCandidates[0];
      }
    }

    if (candidates.length > 0) {
      return candidates[0];
    }

    // Fallback to any available model
    const allModels = [...this.models.values()];
    if (allModels.length === 0) {
      throw new Error('No models registered');
    }
    return allModels[0];
  }

  /** Determine if streaming should be used */
  private shouldStream(context: RoutingContext): boolean {
    return context.userFacing;
  }

  /** Estimate token count from text (rough approximation: ~4 chars per token) */
  private estimateTokenCount(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /** Build a human-readable routing reason */
  private buildReason(
    complexity: PromptComplexity,
    tier: ModelTier,
    context: RoutingContext,
    streaming: boolean,
  ): string {
    const parts: string[] = [`Complexity: ${complexity}`, `Selected tier: ${tier}`];
    if (streaming) parts.push('Streaming enabled (user-facing)');
    if (context.costBudget) parts.push(`Cost budget: $${context.costBudget}`);
    if (context.maxLatencyMs) parts.push(`Latency target: ${context.maxLatencyMs}ms`);
    return parts.join('; ');
  }

  /** Register default model configurations */
  private registerDefaultModels(): void {
    this.models.set('gpt-4o-mini', {
      id: 'gpt-4o-mini',
      tier: 'small',
      costPer1kTokens: 0.00015,
      maxTokens: 16384,
      avgLatencyMs: 200,
      capabilities: ['text', 'classification', 'extraction'],
    });

    this.models.set('gpt-4o', {
      id: 'gpt-4o',
      tier: 'medium',
      costPer1kTokens: 0.005,
      maxTokens: 128000,
      avgLatencyMs: 800,
      capabilities: ['text', 'classification', 'extraction', 'reasoning', 'code'],
    });

    this.models.set('gpt-4-turbo', {
      id: 'gpt-4-turbo',
      tier: 'large',
      costPer1kTokens: 0.01,
      maxTokens: 128000,
      avgLatencyMs: 1500,
      capabilities: [
        'text',
        'classification',
        'extraction',
        'reasoning',
        'code',
        'vision',
        'complex-analysis',
      ],
    });
  }
}
