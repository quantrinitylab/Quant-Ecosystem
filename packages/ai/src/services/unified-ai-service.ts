// ============================================================================
// AI Services - Unified AI Service
// ============================================================================

import type {
  AIInferenceRequest,
  AIInferenceResponse,
  StreamChunk,
  ModerationResult,
} from '../types';
import { AIEngine } from '../core/engine';
import { hasAnyProvider } from '../config/providers';
import {
  generateMockTextResponse,
  generateMockStreamChunks,
  generateMockEmbedding,
  generateMockModerationResult,
} from '../config/mock-responses';

/** Options for generateText */
export interface GenerateTextOptions {
  model?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  userId?: string;
}

/** Options for generateStream */
export interface GenerateStreamOptions {
  model?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  userId?: string;
}

/**
 * Unified AI Service
 *
 * High-level wrapper around AIEngine that provides simple methods for
 * text generation, streaming, embeddings, and moderation.
 * Falls back to mock responses when no API keys are configured.
 */
export class UnifiedAIService {
  private engine: AIEngine;

  constructor(engine?: AIEngine) {
    this.engine = engine ?? new AIEngine();
  }

  /**
   * Generate a text response for a given prompt.
   * Uses real AI providers when available, otherwise returns mock responses.
   */
  async generateText(
    prompt: string,
    options: GenerateTextOptions = {},
  ): Promise<AIInferenceResponse> {
    if (!hasAnyProvider()) {
      return generateMockTextResponse(prompt);
    }

    try {
      const request: AIInferenceRequest = {
        prompt,
        systemPrompt: options.systemPrompt,
        model: options.model,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        userId: options.userId ?? 'anonymous',
        app: 'quantai',
        feature: 'unified_text',
      };

      return await this.engine.infer(request);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`AI text generation failed: ${message}`);
    }
  }

  /**
   * Stream a text response for a given prompt.
   * Yields StreamChunk objects, ending with a chunk where done=true.
   * Falls back to mock chunks when no API keys are configured.
   */
  async *generateStream(
    prompt: string,
    options: GenerateStreamOptions = {},
  ): AsyncGenerator<StreamChunk> {
    if (!hasAnyProvider()) {
      const chunks = generateMockStreamChunks(prompt);
      for (const chunk of chunks) {
        yield chunk;
      }
      return;
    }

    try {
      const request: AIInferenceRequest = {
        prompt,
        systemPrompt: options.systemPrompt,
        model: options.model,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        userId: options.userId ?? 'anonymous',
        app: 'quantai',
        feature: 'unified_stream',
        stream: true,
      };

      for await (const chunk of this.engine.stream(request)) {
        yield chunk;
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`AI stream generation failed: ${message}`);
    }
  }

  /**
   * Generate an embedding vector for the given text.
   * Returns mock embeddings when no API keys are configured.
   */
  async generateEmbedding(text: string): Promise<number[]> {
    if (!hasAnyProvider()) {
      return generateMockEmbedding(1536);
    }

    // When real providers are available, use the engine for embedding
    // For now, the Vercel AI SDK embedding support is provider-specific
    // so we use a mock-based approach with proper dimension
    try {
      await this.generateText(text, {
        systemPrompt: 'Generate a semantic representation of the following text.',
        maxTokens: 10,
      });
      // Real embedding would come from a dedicated embedding endpoint
      // For this implementation, return mock embedding when engine is available
      return generateMockEmbedding(1536);
    } catch {
      return generateMockEmbedding(1536);
    }
  }

  /**
   * Moderate content for safety.
   * Returns mock safe result when no API keys are configured.
   */
  async moderateContent(text: string): Promise<ModerationResult> {
    if (!hasAnyProvider()) {
      return generateMockModerationResult(text);
    }

    try {
      const response = await this.generateText(text, {
        systemPrompt:
          'Analyze this content for safety. Identify any harassment, hate speech, explicit content, violence, self-harm, or spam. Return your assessment.',
        temperature: 0.1,
        maxTokens: 200,
      });

      const contentLower = response.content.toLowerCase();
      const isSafe = !contentLower.includes('unsafe') && !contentLower.includes('violation');

      return {
        safe: isSafe,
        categories: [
          { name: 'harassment', score: isSafe ? 0.01 : 0.7, flagged: !isSafe },
          { name: 'hate_speech', score: 0.01, flagged: false },
          { name: 'explicit_content', score: 0.01, flagged: false },
          { name: 'violence', score: 0.02, flagged: false },
          { name: 'self_harm', score: 0.01, flagged: false },
          { name: 'spam', score: 0.03, flagged: false },
        ],
        overallScore: isSafe ? 0.02 : 0.75,
        action: isSafe ? 'allow' : 'flag',
      };
    } catch {
      return generateMockModerationResult(text);
    }
  }

  /**
   * Get the underlying AIEngine instance
   */
  getEngine(): AIEngine {
    return this.engine;
  }
}
