// ============================================================================
// AI Services - Unified AI Service
// ============================================================================

import OpenAI from 'openai';
import type {
  AIInferenceRequest,
  AIInferenceResponse,
  StreamChunk,
  ModerationResult,
} from '../types';
import { AIEngine } from '../core/engine';
import { hasAnyProvider } from '../config/providers';
import { isFailClosedMode } from '../config/runtime';
import { AIProviderUnavailableError } from '../core/errors';
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
 *
 * Provider credentials (OPENAI_API_KEY / ANTHROPIC_API_KEY / GOOGLE_API_KEY)
 * are sourced from the runtime environment so AI features run against a real
 * provider (Requirement 3.2).
 *
 * In production (or when `QUANT_AI_FAIL_CLOSED` is enabled) the service fails
 * closed: if no real provider is configured, or a provider call cannot be
 * completed, it raises an explicit {@link AIProviderUnavailableError} instead
 * of returning a mock/simulated payload (Requirements 3.1, 3.3). In
 * non-production runtimes the legacy mock fallback is preserved.
 */
export class UnifiedAIService {
  private engine: AIEngine;

  constructor(engine?: AIEngine) {
    this.engine = engine ?? new AIEngine();
  }

  /**
   * Guard the silent mock-response fallback. When the engine must fail closed
   * (production / failClosed mode), throw an explicit typed error rather than
   * returning a simulated payload.
   */
  private assertMockFallbackAllowed(operation: string): void {
    if (isFailClosedMode()) {
      throw new AIProviderUnavailableError(
        `${operation} cannot complete: no AI provider is configured and mock fallback is ` +
          `disabled in production. Set OPENAI_API_KEY, ANTHROPIC_API_KEY, or GOOGLE_API_KEY ` +
          `to run against a real provider.`,
      );
    }
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
      this.assertMockFallbackAllowed('AI text generation');
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
      this.assertMockFallbackAllowed('AI stream generation');
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
   * Uses OpenAI text-embedding-3-large when OPENAI_API_KEY is set.
   * Falls back to mock embeddings when no provider is available.
   */
  async generateEmbedding(text: string): Promise<number[]> {
    const apiKey = process.env['OPENAI_API_KEY'];
    if (!apiKey) {
      this.assertMockFallbackAllowed('AI embedding generation');
      return generateMockEmbedding(1536);
    }

    try {
      const client = new OpenAI({ apiKey });
      const response = await client.embeddings.create({
        model: 'text-embedding-3-large',
        input: text,
      });
      return response.data[0]!.embedding;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Embedding generation failed: ${message}`);
    }
  }

  /**
   * Moderate content for safety.
   * Returns mock safe result when no API keys are configured.
   */
  async moderateContent(text: string): Promise<ModerationResult> {
    if (!hasAnyProvider()) {
      this.assertMockFallbackAllowed('AI content moderation');
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
    } catch (error) {
      // Fail closed in production: a provider failure must surface as an
      // explicit error, never a silently-fabricated "safe" moderation result.
      if (isFailClosedMode()) {
        if (error instanceof AIProviderUnavailableError) {
          throw error;
        }
        const message = error instanceof Error ? error.message : 'Unknown error';
        throw new AIProviderUnavailableError(`AI content moderation failed: ${message}`);
      }
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
