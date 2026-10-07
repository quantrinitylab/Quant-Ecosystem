/**
 * AIEnginePort - Dependency injection boundary for AI inference.
 * Pilots and IntelligentAgent use this interface to call AI without importing @quant/ai directly.
 */

export interface AIInferenceOptions {
  temperature?: number;
  maxTokens?: number;
}

export interface AIInferenceResult {
  content: string;
  usage: {
    tokens: number;
    cost: number;
  };
}

export interface AIClassificationResult {
  category: string;
  confidence: number;
}

export interface AIEnginePort {
  infer(
    prompt: string,
    systemPrompt?: string,
    options?: AIInferenceOptions,
  ): Promise<AIInferenceResult>;

  classify(text: string, categories: string[]): Promise<AIClassificationResult>;

  embed(text: string): Promise<number[]>;
}
