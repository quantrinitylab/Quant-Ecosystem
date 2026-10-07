// ============================================================================
// AI Core - Provider Adapter Abstraction
// ============================================================================

import { generateText, streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { AIModelConfig, TokenUsage } from '../types';
import { OpenRouterProvider } from '../providers/openrouter-provider';

export interface ProviderGenerateOptions {
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  temperature?: number;
  maxOutputTokens?: number;
}

export interface ProviderGenerateResult {
  text: string;
  usage: TokenUsage;
  finishReason: string;
}

export interface ProviderStreamResult {
  textStream: AsyncIterable<string>;
}

export interface ProviderAdapter {
  readonly id: string;
  readonly name: string;
  isAvailable(): boolean;
  getModel(modelId: string): unknown;
  generate(model: AIModelConfig, options: ProviderGenerateOptions): Promise<ProviderGenerateResult>;
  stream(model: AIModelConfig, options: ProviderGenerateOptions): Promise<ProviderStreamResult>;
  countTokens(text: string, model: AIModelConfig): number;
}

export class OpenAIAdapter implements ProviderAdapter {
  readonly id = 'openai';
  readonly name = 'OpenAI';
  private provider: ReturnType<typeof createOpenAI> | null = null;

  constructor() {
    const key = process.env['OPENAI_API_KEY'];
    if (key) {
      this.provider = createOpenAI({ apiKey: key });
    }
  }

  isAvailable(): boolean {
    return this.provider !== null;
  }

  getModel(modelId: string): unknown {
    if (!this.provider) throw new Error('OpenAI provider not configured');
    return this.provider(modelId);
  }

  async generate(
    model: AIModelConfig,
    options: ProviderGenerateOptions,
  ): Promise<ProviderGenerateResult> {
    const providerModel = this.getModel(model.id);
    const result = await generateText({
      model: providerModel as any,
      messages: options.messages,
      temperature: options.temperature ?? 0.7,
      maxOutputTokens: options.maxOutputTokens ?? model.maxOutputTokens,
    });

    const promptTokens = (result.usage as any)?.promptTokens ?? result.usage?.inputTokens ?? 0;
    const completionTokens =
      (result.usage as any)?.completionTokens ?? result.usage?.outputTokens ?? 0;

    return {
      text: result.text || '',
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        estimatedCost:
          promptTokens * model.costPerInputToken + completionTokens * model.costPerOutputToken,
      },
      finishReason: 'stop',
    };
  }

  async stream(
    model: AIModelConfig,
    options: ProviderGenerateOptions,
  ): Promise<ProviderStreamResult> {
    const providerModel = this.getModel(model.id);
    const result = streamText({
      model: providerModel as any,
      messages: options.messages,
      temperature: options.temperature ?? 0.7,
      maxOutputTokens: options.maxOutputTokens ?? model.maxOutputTokens,
    });
    return { textStream: result.textStream };
  }

  countTokens(text: string, _model: AIModelConfig): number {
    return estimateTokens(text);
  }
}

export class AnthropicAdapter implements ProviderAdapter {
  readonly id = 'anthropic';
  readonly name = 'Anthropic';
  private provider: ReturnType<typeof createAnthropic> | null = null;

  constructor() {
    const key = process.env['ANTHROPIC_API_KEY'];
    if (key) {
      this.provider = createAnthropic({ apiKey: key });
    }
  }

  isAvailable(): boolean {
    return this.provider !== null;
  }

  getModel(modelId: string): unknown {
    if (!this.provider) throw new Error('Anthropic provider not configured');
    return this.provider(modelId);
  }

  async generate(
    model: AIModelConfig,
    options: ProviderGenerateOptions,
  ): Promise<ProviderGenerateResult> {
    const providerModel = this.getModel(model.id);
    const result = await generateText({
      model: providerModel as any,
      messages: options.messages,
      temperature: options.temperature ?? 0.7,
      maxOutputTokens: options.maxOutputTokens ?? model.maxOutputTokens,
    });

    const promptTokens = (result.usage as any)?.promptTokens ?? result.usage?.inputTokens ?? 0;
    const completionTokens =
      (result.usage as any)?.completionTokens ?? result.usage?.outputTokens ?? 0;

    return {
      text: result.text || '',
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        estimatedCost:
          promptTokens * model.costPerInputToken + completionTokens * model.costPerOutputToken,
      },
      finishReason: 'stop',
    };
  }

  async stream(
    model: AIModelConfig,
    options: ProviderGenerateOptions,
  ): Promise<ProviderStreamResult> {
    const providerModel = this.getModel(model.id);
    const result = streamText({
      model: providerModel as any,
      messages: options.messages,
      temperature: options.temperature ?? 0.7,
      maxOutputTokens: options.maxOutputTokens ?? model.maxOutputTokens,
    });
    return { textStream: result.textStream };
  }

  countTokens(text: string, _model: AIModelConfig): number {
    return estimateTokens(text);
  }
}

export class GoogleAdapter implements ProviderAdapter {
  readonly id = 'google';
  readonly name = 'Google';
  private provider: ReturnType<typeof createGoogleGenerativeAI> | null = null;

  constructor() {
    const key = process.env['GOOGLE_API_KEY'];
    if (key) {
      this.provider = createGoogleGenerativeAI({ apiKey: key });
    }
  }

  isAvailable(): boolean {
    return this.provider !== null;
  }

  getModel(modelId: string): unknown {
    if (!this.provider) throw new Error('Google provider not configured');
    return this.provider(modelId);
  }

  async generate(
    model: AIModelConfig,
    options: ProviderGenerateOptions,
  ): Promise<ProviderGenerateResult> {
    const providerModel = this.getModel(model.id);
    const result = await generateText({
      model: providerModel as any,
      messages: options.messages,
      temperature: options.temperature ?? 0.7,
      maxOutputTokens: options.maxOutputTokens ?? model.maxOutputTokens,
    });

    const promptTokens = (result.usage as any)?.promptTokens ?? result.usage?.inputTokens ?? 0;
    const completionTokens =
      (result.usage as any)?.completionTokens ?? result.usage?.outputTokens ?? 0;

    return {
      text: result.text || '',
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        estimatedCost:
          promptTokens * model.costPerInputToken + completionTokens * model.costPerOutputToken,
      },
      finishReason: 'stop',
    };
  }

  async stream(
    model: AIModelConfig,
    options: ProviderGenerateOptions,
  ): Promise<ProviderStreamResult> {
    const providerModel = this.getModel(model.id);
    const result = streamText({
      model: providerModel as any,
      messages: options.messages,
      temperature: options.temperature ?? 0.7,
      maxOutputTokens: options.maxOutputTokens ?? model.maxOutputTokens,
    });
    return { textStream: result.textStream };
  }

  countTokens(text: string, _model: AIModelConfig): number {
    return estimateTokens(text);
  }
}

/**
 * OpenRouter — an OpenAI-compatible aggregator that proxies to virtually every
 * model (OpenAI, Anthropic, Google, Meta/Llama, Mistral, DeepSeek, Qwen, ...).
 * Configured via OPENROUTER_API_KEY against the OpenRouter base URL so a single
 * key unlocks the whole catalogue (the ecosystem default model source). Models
 * are addressed by their OpenRouter id, e.g. `anthropic/claude-3.5-sonnet`,
 * `openai/gpt-4o`, `meta-llama/llama-3.1-70b-instruct`.
 */
export class OpenRouterAdapter implements ProviderAdapter {
  readonly id = 'openrouter';
  readonly name = 'OpenRouter';
  private provider: ReturnType<typeof createOpenAI> | null = null;

  constructor() {
    const key = process.env['OPENROUTER_API_KEY'];
    if (key) {
      this.provider = createOpenAI({
        apiKey: key,
        baseURL: process.env['OPENROUTER_BASE_URL'] ?? 'https://openrouter.ai/api/v1',
      });
    }
  }

  isAvailable(): boolean {
    return this.provider !== null;
  }

  getModel(modelId: string): unknown {
    if (!this.provider) throw new Error('OpenRouter provider not configured');
    return this.provider(modelId);
  }

  async generate(
    model: AIModelConfig,
    options: ProviderGenerateOptions,
  ): Promise<ProviderGenerateResult> {
    const providerModel = this.getModel(model.id);
    const result = await generateText({
      model: providerModel as any,
      messages: options.messages,
      temperature: options.temperature ?? 0.7,
      maxOutputTokens: options.maxOutputTokens ?? model.maxOutputTokens,
    });

    const promptTokens = (result.usage as any)?.promptTokens ?? result.usage?.inputTokens ?? 0;
    const completionTokens =
      (result.usage as any)?.completionTokens ?? result.usage?.outputTokens ?? 0;

    return {
      text: result.text || '',
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        estimatedCost:
          promptTokens * model.costPerInputToken + completionTokens * model.costPerOutputToken,
      },
      finishReason: 'stop',
    };
  }

  async stream(
    model: AIModelConfig,
    options: ProviderGenerateOptions,
  ): Promise<ProviderStreamResult> {
    const providerModel = this.getModel(model.id);
    const result = streamText({
      model: providerModel as any,
      messages: options.messages,
      temperature: options.temperature ?? 0.7,
      maxOutputTokens: options.maxOutputTokens ?? model.maxOutputTokens,
    });
    return { textStream: result.textStream };
  }

  countTokens(text: string, _model: AIModelConfig): number {
    return estimateTokens(text);
  }
}

export class ProviderAdapterRegistry {
  private adapters: Map<string, ProviderAdapter> = new Map();

  constructor() {
    this.register(new OpenAIAdapter());
    this.register(new AnthropicAdapter());
    this.register(new GoogleAdapter());
    // OpenRouter is served by the fetch-based provider (OpenAI-compatible HTTP
    // API, no extra SDK). It registers under the same `openrouter` id and fails
    // closed with OPENROUTER_NOT_CONFIGURED when no key is set.
    this.register(new OpenRouterProvider());
  }

  register(adapter: ProviderAdapter): void {
    this.adapters.set(adapter.id, adapter);
  }

  get(providerId: string): ProviderAdapter | undefined {
    return this.adapters.get(providerId);
  }

  getForModel(model: AIModelConfig): ProviderAdapter {
    const adapter = this.adapters.get(model.provider);
    if (!adapter) {
      throw new Error(`No adapter registered for provider: ${model.provider}`);
    }
    if (!adapter.isAvailable()) {
      throw new Error(`${adapter.name} provider not configured. Set the required API key.`);
    }
    return adapter;
  }

  getAvailableAdapters(): ProviderAdapter[] {
    return Array.from(this.adapters.values()).filter((a) => a.isAvailable());
  }

  hasAnyProvider(): boolean {
    return Array.from(this.adapters.values()).some((a) => a.isAvailable());
  }

  async generateWithFallback(
    models: AIModelConfig[],
    options: ProviderGenerateOptions,
  ): Promise<ProviderGenerateResult & { model: AIModelConfig }> {
    const errors: Error[] = [];

    for (const model of models) {
      try {
        const adapter = this.getForModel(model);
        const result = await adapter.generate(model, options);
        return { ...result, model };
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
    }

    throw new Error(`All providers failed: ${errors.map((e) => e.message).join('; ')}`);
  }

  async *streamWithFallback(
    models: AIModelConfig[],
    options: ProviderGenerateOptions,
  ): AsyncGenerator<string, void, unknown> {
    const errors: Error[] = [];

    for (const model of models) {
      try {
        const adapter = this.getForModel(model);
        const result = await adapter.stream(model, options);
        for await (const chunk of result.textStream) {
          yield chunk;
        }
        return;
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
    }

    throw new Error(`All streaming providers failed: ${errors.map((e) => e.message).join('; ')}`);
  }
}

export function estimateTokens(text: string): number {
  if (!text) return 0;
  const words = text.split(/\s+/).filter(Boolean);
  const charCount = text.length;
  const wordEstimate = Math.ceil(words.length * 1.3);
  const charEstimate = Math.ceil(charCount / 4);
  return Math.max(wordEstimate, charEstimate);
}
