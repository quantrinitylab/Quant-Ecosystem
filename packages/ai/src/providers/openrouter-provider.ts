// ============================================================================
// AI Providers - OpenRouter (fetch-based, OpenAI-compatible HTTP API)
// ============================================================================
//
// OpenRouter (https://openrouter.ai) exposes an OpenAI-compatible REST API that
// proxies to virtually every model (OpenAI, Anthropic, Google, Meta/Llama,
// Mistral, DeepSeek, Qwen, ...). A single `OPENROUTER_API_KEY` therefore unlocks
// the whole catalogue, which is why it is the ecosystem's default "all models
// via OpenRouter" source.
//
// This adapter speaks the HTTP API directly via the global `fetch` (no extra
// SDK). It implements the same `ProviderAdapter` contract as the other adapters
// in `core/provider-adapter.ts` so the engine / registry can use it
// interchangeably, and it FAILS CLOSED: when no key is configured it raises a
// typed `OpenRouterNotConfiguredError` (code `OPENROUTER_NOT_CONFIGURED`) the
// moment it is invoked — never at import/construction time.

import { z } from 'zod';
import type { AIModelConfig, TokenUsage } from '../types';
import type {
  ProviderAdapter,
  ProviderGenerateOptions,
  ProviderGenerateResult,
  ProviderStreamResult,
} from '../core/provider-adapter';
import { OpenRouterNotConfiguredError } from '../core/errors';

/** Default OpenRouter API base URL (OpenAI-compatible). */
export const DEFAULT_OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

// ----------------------------------------------------------------------------
// Env / config validation (zod) — mirrors the package's zod config pattern.
// ----------------------------------------------------------------------------

/**
 * Schema for the OpenRouter-related environment variables. Everything is
 * optional at parse time so that a missing key does NOT throw on construction;
 * the provider only fails closed when actually invoked.
 */
const OpenRouterEnvSchema = z.object({
  OPENROUTER_API_KEY: z.string().trim().min(1).optional(),
  OPENROUTER_BASE_URL: z.string().trim().url().optional(),
  // Optional attribution headers recommended by OpenRouter for ranking.
  OPENROUTER_HTTP_REFERER: z.string().trim().min(1).optional(),
  OPENROUTER_APP_TITLE: z.string().trim().min(1).optional(),
});

/** Resolved OpenRouter configuration. */
export interface OpenRouterConfig {
  /** API key; `undefined` when not configured (provider then fails closed). */
  apiKey: string | undefined;
  /** Base URL for the OpenAI-compatible API (always populated). */
  baseUrl: string;
  /** Optional `HTTP-Referer` header value. */
  referer: string | undefined;
  /** Optional `X-Title` header value. */
  title: string | undefined;
}

type EnvLike = Record<string, string | undefined>;

/**
 * Read + validate the OpenRouter configuration from an environment bag.
 *
 * Uses `safeParse` so a malformed `OPENROUTER_BASE_URL` degrades gracefully to
 * the default rather than throwing at construction time (fail-closed only
 * happens on invocation when no key is present).
 */
export function loadOpenRouterConfig(env: EnvLike = process.env): OpenRouterConfig {
  const parsed = OpenRouterEnvSchema.safeParse({
    OPENROUTER_API_KEY: env['OPENROUTER_API_KEY'],
    OPENROUTER_BASE_URL: env['OPENROUTER_BASE_URL'],
    OPENROUTER_HTTP_REFERER: env['OPENROUTER_HTTP_REFERER'],
    OPENROUTER_APP_TITLE: env['OPENROUTER_APP_TITLE'],
  });

  if (!parsed.success) {
    // Fall back to a minimal, lenient read: keep the key if present, ignore a
    // bad base URL. Never throw here — construction must be side-effect free.
    const rawKey = env['OPENROUTER_API_KEY']?.trim();
    return {
      apiKey: rawKey && rawKey.length > 0 ? rawKey : undefined,
      baseUrl: DEFAULT_OPENROUTER_BASE_URL,
      referer: env['OPENROUTER_HTTP_REFERER'],
      title: env['OPENROUTER_APP_TITLE'],
    };
  }

  return {
    apiKey: parsed.data.OPENROUTER_API_KEY,
    baseUrl: parsed.data.OPENROUTER_BASE_URL ?? DEFAULT_OPENROUTER_BASE_URL,
    referer: parsed.data.OPENROUTER_HTTP_REFERER,
    title: parsed.data.OPENROUTER_APP_TITLE,
  };
}

// ----------------------------------------------------------------------------
// Response parsing (zod) — OpenAI-compatible chat/completions shape.
// ----------------------------------------------------------------------------

const ChatCompletionSchema = z.object({
  id: z.string().optional(),
  model: z.string().optional(),
  choices: z
    .array(
      z.object({
        message: z
          .object({
            role: z.string().optional(),
            content: z.string().nullable().optional(),
          })
          .optional(),
        finish_reason: z.string().nullable().optional(),
      }),
    )
    .min(1),
  usage: z
    .object({
      prompt_tokens: z.number().optional(),
      completion_tokens: z.number().optional(),
      total_tokens: z.number().optional(),
    })
    .optional(),
});

/** Minimal `fetch` signature this adapter depends on (injectable for tests). */
export type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
) => Promise<{
  ok: boolean;
  status: number;
  statusText?: string;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
  body?: unknown;
}>;

export interface OpenRouterAdapterOptions {
  /** Override the environment bag (defaults to `process.env`). */
  env?: EnvLike;
  /** Inject a `fetch` implementation (defaults to `globalThis.fetch`). */
  fetchImpl?: FetchLike;
  /** Request timeout in milliseconds (default 60s). */
  timeoutMs?: number;
}

/**
 * Fetch-based OpenRouter provider implementing the shared `ProviderAdapter`
 * contract. Addresses models by their OpenRouter id, e.g. `openai/gpt-4o`,
 * `anthropic/claude-3.5-sonnet`, `meta-llama/llama-3.1-70b-instruct`.
 */
export class OpenRouterProvider implements ProviderAdapter {
  readonly id = 'openrouter';
  readonly name = 'OpenRouter';

  private readonly config: OpenRouterConfig;
  private readonly fetchImpl: FetchLike | undefined;
  private readonly timeoutMs: number;

  constructor(options: OpenRouterAdapterOptions = {}) {
    // Reading config must never throw — fail-closed happens on invocation only.
    this.config = loadOpenRouterConfig(options.env);
    this.fetchImpl = options.fetchImpl;
    this.timeoutMs = options.timeoutMs ?? 60_000;
  }

  /** True when an API key is configured. */
  isAvailable(): boolean {
    return typeof this.config.apiKey === 'string' && this.config.apiKey.length > 0;
  }

  /** The resolved base URL (useful for diagnostics / tests). */
  getBaseUrl(): string {
    return this.config.baseUrl;
  }

  /**
   * Return a lightweight model descriptor. Mirrors the SDK adapters' `getModel`
   * but, being fetch-based, just echoes the OpenRouter model id. Throws (fails
   * closed) when no key is configured.
   */
  getModel(modelId: string): unknown {
    this.requireApiKey();
    return { id: modelId, provider: this.id, baseUrl: this.config.baseUrl };
  }

  /** Non-streaming chat completion via the OpenRouter HTTP API. */
  async generate(
    model: AIModelConfig,
    options: ProviderGenerateOptions,
  ): Promise<ProviderGenerateResult> {
    const apiKey = this.requireApiKey();
    const fetchImpl = this.resolveFetch();

    const url = `${this.config.baseUrl}/chat/completions`;
    const requestBody = {
      model: model.id,
      messages: options.messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxOutputTokens ?? model.maxOutputTokens,
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Awaited<ReturnType<FetchLike>>;
    try {
      response = await fetchImpl(url, {
        method: 'POST',
        headers: this.buildHeaders(apiKey),
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
    } catch (error) {
      throw new OpenRouterNotConfiguredError(
        `OpenRouter request failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const detail = await safeReadText(response);
      throw new OpenRouterNotConfiguredError(
        `OpenRouter returned ${response.status}${
          response.statusText ? ` ${response.statusText}` : ''
        }${detail ? `: ${detail}` : ''}`,
      );
    }

    const payload = await response.json();
    const parsed = ChatCompletionSchema.safeParse(payload);
    if (!parsed.success) {
      throw new OpenRouterNotConfiguredError(
        `OpenRouter returned an unexpected response shape: ${parsed.error.message}`,
      );
    }

    const choice = parsed.data.choices[0];
    const text = choice?.message?.content ?? '';
    const promptTokens =
      parsed.data.usage?.prompt_tokens ?? estimateTokenCount(serializeMessages(options.messages));
    const completionTokens = parsed.data.usage?.completion_tokens ?? estimateTokenCount(text);
    const totalTokens = parsed.data.usage?.total_tokens ?? promptTokens + completionTokens;

    const usage: TokenUsage = {
      promptTokens,
      completionTokens,
      totalTokens,
      estimatedCost:
        promptTokens * model.costPerInputToken + completionTokens * model.costPerOutputToken,
    };

    return {
      text,
      usage,
      finishReason: choice?.finish_reason ?? 'stop',
    };
  }

  /**
   * Streaming chat completion via Server-Sent Events. Parses the OpenAI-style
   * `data: {...}` chunks and yields `choices[0].delta.content` deltas.
   */
  async stream(
    model: AIModelConfig,
    options: ProviderGenerateOptions,
  ): Promise<ProviderStreamResult> {
    const apiKey = this.requireApiKey();
    const fetchImpl = this.resolveFetch();

    const url = `${this.config.baseUrl}/chat/completions`;
    const requestBody = {
      model: model.id,
      messages: options.messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxOutputTokens ?? model.maxOutputTokens,
      stream: true,
    };

    let response: Awaited<ReturnType<FetchLike>>;
    try {
      response = await fetchImpl(url, {
        method: 'POST',
        headers: this.buildHeaders(apiKey),
        body: JSON.stringify(requestBody),
      });
    } catch (error) {
      throw new OpenRouterNotConfiguredError(
        `OpenRouter stream request failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    if (!response.ok) {
      const detail = await safeReadText(response);
      throw new OpenRouterNotConfiguredError(
        `OpenRouter returned ${response.status}${detail ? `: ${detail}` : ''}`,
      );
    }

    const body = response.body as ReadableStream<Uint8Array> | null | undefined;
    return { textStream: parseSseStream(body) };
  }

  /** Rough token estimate (no tokenizer dependency). */
  countTokens(text: string, _model: AIModelConfig): number {
    return estimateTokenCount(text);
  }

  // --- internal helpers -----------------------------------------------------

  private requireApiKey(): string {
    if (!this.isAvailable()) {
      throw new OpenRouterNotConfiguredError();
    }
    return this.config.apiKey as string;
  }

  private resolveFetch(): FetchLike {
    const impl = this.fetchImpl ?? (globalThis.fetch as unknown as FetchLike | undefined);
    if (typeof impl !== 'function') {
      throw new OpenRouterNotConfiguredError(
        'No fetch implementation available for the OpenRouter provider.',
      );
    }
    return impl;
  }

  private buildHeaders(apiKey: string): Record<string, string> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };
    if (this.config.referer) headers['HTTP-Referer'] = this.config.referer;
    if (this.config.title) headers['X-Title'] = this.config.title;
    return headers;
  }
}

// ----------------------------------------------------------------------------
// Free helpers
// ----------------------------------------------------------------------------

async function safeReadText(response: { text: () => Promise<string> }): Promise<string> {
  try {
    const text = await response.text();
    return text.slice(0, 500);
  } catch {
    return '';
  }
}

function serializeMessages(messages: ProviderGenerateOptions['messages']): string {
  return messages.map((m) => m.content).join('\n');
}

/** Rough token estimate identical in spirit to the SDK adapters' helper. */
export function estimateTokenCount(text: string): number {
  if (!text) return 0;
  const words = text.split(/\s+/).filter(Boolean);
  const wordEstimate = Math.ceil(words.length * 1.3);
  const charEstimate = Math.ceil(text.length / 4);
  return Math.max(wordEstimate, charEstimate);
}

/**
 * Parse an SSE byte stream of OpenAI-style chat completion chunks into an async
 * iterable of text deltas. Tolerates partial frames and the terminal
 * `data: [DONE]` sentinel.
 */
async function* parseSseStream(
  body: ReadableStream<Uint8Array> | null | undefined,
): AsyncGenerator<string, void, unknown> {
  if (!body || typeof body.getReader !== 'function') return;

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (!line || !line.startsWith('data:')) continue;
        const data = line.slice('data:'.length).trim();
        if (data === '[DONE]') return;
        try {
          const json = JSON.parse(data) as {
            choices?: Array<{ delta?: { content?: string | null } }>;
          };
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch {
          // Ignore non-JSON keep-alive lines.
        }
      }
    }
  } finally {
    reader.releaseLock?.();
  }
}
