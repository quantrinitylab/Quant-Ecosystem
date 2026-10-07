// ============================================================================
// Tests - Fetch-based OpenRouter provider
// ============================================================================
//
// Verifies the real HTTP behavior of the fetch-based OpenRouter provider:
//  - fails closed (OPENROUTER_NOT_CONFIGURED) without a key, never at import;
//  - with a key, builds the correct request (URL, Authorization header, model
//    id, messages) and parses an OpenRouter response into the package shape.
//
// `fetch` is stubbed via vi.stubGlobal — no real network is touched.

import { describe, it, expect, vi, afterEach } from 'vitest';

import { OpenRouterProvider } from '../providers/openrouter-provider';
import { OpenRouterNotConfiguredError, AIProviderUnavailableError } from '../core/errors';
import type { AIModelConfig } from '../types';
import type { ProviderGenerateOptions } from '../core/provider-adapter';
import type { FetchLike } from '../providers/openrouter-provider';

type FetchInit = Parameters<FetchLike>[1];

const MODEL: AIModelConfig = {
  id: 'anthropic/claude-3.5-sonnet',
  name: 'Claude 3.5 Sonnet (via OpenRouter)',
  provider: 'openrouter',
  capabilities: ['text_generation'],
  maxContextLength: 200000,
  maxOutputTokens: 1024,
  costPerInputToken: 0.000003,
  costPerOutputToken: 0.000015,
  latencyMs: 500,
  qualityScore: 0.97,
};

const OPTIONS: ProviderGenerateOptions = {
  messages: [
    { role: 'system', content: 'You are helpful.' },
    { role: 'user', content: 'Hello there' },
  ],
  temperature: 0.3,
  maxOutputTokens: 256,
};

function mockOkResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('OpenRouterProvider — fail closed without a key', () => {
  it('does not throw at construction when no key is set', () => {
    const provider = new OpenRouterProvider({ env: {} });
    expect(provider.id).toBe('openrouter');
    expect(provider.name).toBe('OpenRouter');
    expect(provider.isAvailable()).toBe(false);
  });

  it('getModel throws OpenRouterNotConfiguredError (code OPENROUTER_NOT_CONFIGURED)', () => {
    const provider = new OpenRouterProvider({ env: {} });
    try {
      provider.getModel('openai/gpt-4o');
      throw new Error('expected to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(OpenRouterNotConfiguredError);
      expect(err).toBeInstanceOf(AIProviderUnavailableError);
      expect((err as OpenRouterNotConfiguredError).code).toBe('OPENROUTER_NOT_CONFIGURED');
    }
  });

  it('generate rejects with OpenRouterNotConfiguredError and never calls fetch', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const provider = new OpenRouterProvider({ env: {} });
    await expect(provider.generate(MODEL, OPTIONS)).rejects.toBeInstanceOf(
      OpenRouterNotConfiguredError,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('OpenRouterProvider — keyed request building + response parsing', () => {
  it('builds the correct request and parses the response (via injected fetch)', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: FetchInit) =>
      mockOkResponse({
        id: 'gen-123',
        model: 'anthropic/claude-3.5-sonnet',
        choices: [
          {
            message: { role: 'assistant', content: 'General Kenobi!' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 11, completion_tokens: 4, total_tokens: 15 },
      }),
    );

    const provider = new OpenRouterProvider({
      env: { OPENROUTER_API_KEY: 'sk-or-abc123' },
      fetchImpl: fetchMock,
    });

    expect(provider.isAvailable()).toBe(true);

    const result = await provider.generate(MODEL, OPTIONS);

    // Exactly one HTTP call
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;

    // URL: default base + /chat/completions
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');

    // Method + auth header + content type
    expect(init?.method).toBe('POST');
    expect(init?.headers?.['Authorization']).toBe('Bearer sk-or-abc123');
    expect(init?.headers?.['Content-Type']).toBe('application/json');

    // Body: model id + messages passed through
    const parsedBody = JSON.parse(init?.body as string);
    expect(parsedBody.model).toBe('anthropic/claude-3.5-sonnet');
    expect(parsedBody.messages).toEqual(OPTIONS.messages);
    expect(parsedBody.temperature).toBe(0.3);
    expect(parsedBody.max_tokens).toBe(256);

    // Parsed into the package's ProviderGenerateResult shape
    expect(result.text).toBe('General Kenobi!');
    expect(result.finishReason).toBe('stop');
    expect(result.usage.promptTokens).toBe(11);
    expect(result.usage.completionTokens).toBe(4);
    expect(result.usage.totalTokens).toBe(15);
    expect(result.usage.estimatedCost).toBeCloseTo(
      11 * MODEL.costPerInputToken + 4 * MODEL.costPerOutputToken,
      12,
    );
  });

  it('uses the global fetch when no impl is injected (vi.stubGlobal)', async () => {
    const globalFetch = vi.fn(async (_url: string, _init?: FetchInit) =>
      mockOkResponse({
        choices: [{ message: { content: 'hi' }, finish_reason: 'stop' }],
      }),
    );
    vi.stubGlobal('fetch', globalFetch);

    const provider = new OpenRouterProvider({ env: { OPENROUTER_API_KEY: 'sk-or-xyz' } });
    const result = await provider.generate(MODEL, OPTIONS);

    expect(globalFetch).toHaveBeenCalledTimes(1);
    expect(result.text).toBe('hi');
    // usage falls back to estimates when the API omits it
    expect(result.usage.totalTokens).toBeGreaterThan(0);
  });

  it('honors a custom OPENROUTER_BASE_URL and attribution headers', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: FetchInit) =>
      mockOkResponse({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] }),
    );

    const provider = new OpenRouterProvider({
      env: {
        OPENROUTER_API_KEY: 'sk-or-abc',
        OPENROUTER_BASE_URL: 'https://proxy.example.com/v1',
        OPENROUTER_HTTP_REFERER: 'https://quant.ai',
        OPENROUTER_APP_TITLE: 'Quant',
      },
      fetchImpl: fetchMock,
    });

    expect(provider.getBaseUrl()).toBe('https://proxy.example.com/v1');

    await provider.generate(MODEL, OPTIONS);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://proxy.example.com/v1/chat/completions');
    expect(init?.headers?.['HTTP-Referer']).toBe('https://quant.ai');
    expect(init?.headers?.['X-Title']).toBe('Quant');
  });

  it('fails closed (typed error) on a non-2xx HTTP response', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: FetchInit) => ({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({}),
      text: async () => 'invalid api key',
    }));

    const provider = new OpenRouterProvider({
      env: { OPENROUTER_API_KEY: 'sk-or-bad' },
      fetchImpl: fetchMock,
    });

    await expect(provider.generate(MODEL, OPTIONS)).rejects.toBeInstanceOf(
      AIProviderUnavailableError,
    );
  });
});

describe('OpenRouterProvider — streaming', () => {
  it('parses SSE deltas from the response body into text chunks', async () => {
    const sse =
      'data: {"choices":[{"delta":{"content":"Hel"}}]}\n' +
      'data: {"choices":[{"delta":{"content":"lo"}}]}\n' +
      'data: [DONE]\n';
    const bytes = new TextEncoder().encode(sse);

    const body = {
      getReader() {
        let sent = false;
        return {
          async read() {
            if (sent) return { done: true, value: undefined };
            sent = true;
            return { done: false, value: bytes };
          },
          releaseLock() {},
        };
      },
    };

    const fetchMock = vi.fn(async (_url: string, _init?: FetchInit) => ({
      ok: true,
      status: 200,
      json: async () => ({}),
      text: async () => '',
      body,
    }));

    const provider = new OpenRouterProvider({
      env: { OPENROUTER_API_KEY: 'sk-or-stream' },
      fetchImpl: fetchMock,
    });

    const { textStream } = await provider.stream(MODEL, OPTIONS);
    const chunks: string[] = [];
    for await (const chunk of textStream) chunks.push(chunk);

    expect(chunks.join('')).toBe('Hello');
    const [, init] = fetchMock.mock.calls[0]!;
    expect(JSON.parse(init?.body as string).stream).toBe(true);
  });
});
