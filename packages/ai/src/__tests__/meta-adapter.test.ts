import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Meta is OpenAI-compatible (api.meta.ai), so the adapter is built on
// `createOpenAI` with the Meta base URL — the same construction AIEngine uses
// (core/engine.ts). Mock the SDK to capture construction args. `vi.hoisted`
// lets the mock fn be referenced inside the hoisted `vi.mock`.
const { createOpenAIMock, generateTextMock, streamTextMock } = vi.hoisted(() => ({
  createOpenAIMock: vi.fn((opts: { apiKey: string; baseURL?: string }) => {
    return (modelId: string) => ({ modelId, provider: 'meta', baseURL: opts.baseURL });
  }),
  generateTextMock: vi.fn(),
  streamTextMock: vi.fn(),
}));

vi.mock('@ai-sdk/openai', () => ({ createOpenAI: createOpenAIMock }));
vi.mock('@ai-sdk/anthropic', () => ({ createAnthropic: vi.fn(() => () => ({})) }));
vi.mock('@ai-sdk/google', () => ({ createGoogleGenerativeAI: vi.fn(() => () => ({})) }));
vi.mock('ai', () => ({ generateText: generateTextMock, streamText: streamTextMock }));

import { MetaAdapter, ProviderAdapterRegistry } from '../core/provider-adapter';
import type { AIModelConfig } from '../types';

const META_KEY = 'META_API_KEY';
const META_AI_KEY = 'META_AI_API_KEY';
const META_BASE = 'META_API_BASE_URL';

const mockMetaModel: AIModelConfig = {
  id: 'muse-spark-1.3',
  name: 'Muse Spark 1.3',
  provider: 'meta',
  capabilities: ['text_generation'],
  maxContextLength: 128000,
  maxOutputTokens: 4096,
  costPerInputToken: 0.00000125,
  costPerOutputToken: 0.00000425,
  latencyMs: 400,
  qualityScore: 0.95,
};

describe('MetaAdapter', () => {
  const prev: Record<string, string | undefined> = {
    [META_KEY]: process.env[META_KEY],
    [META_AI_KEY]: process.env[META_AI_KEY],
    [META_BASE]: process.env[META_BASE],
  };

  beforeEach(() => {
    createOpenAIMock.mockClear();
    generateTextMock.mockReset();
    streamTextMock.mockReset();
    delete process.env[META_KEY];
    delete process.env[META_AI_KEY];
    delete process.env[META_BASE];
  });

  afterEach(() => {
    for (const k of [META_KEY, META_AI_KEY, META_BASE]) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  });

  it('exposes id/meta identity and is unavailable without any key', () => {
    const adapter = new MetaAdapter();
    expect(adapter.id).toBe('meta');
    expect(adapter.name).toBe('Meta');
    expect(adapter.isAvailable()).toBe(false);
    expect(() => adapter.getModel('muse-spark-1.3')).toThrow(/not configured/);
  });

  it('builds an OpenAI-compatible client against api.meta.ai when META_API_KEY is set', () => {
    process.env[META_KEY] = 'sk-meta-test';
    const adapter = new MetaAdapter();

    expect(adapter.isAvailable()).toBe(true);
    expect(createOpenAIMock).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'sk-meta-test', baseURL: 'https://api.meta.ai/v1' }),
    );
    const model = adapter.getModel('muse-spark-1.3') as { modelId: string };
    expect(model.modelId).toBe('muse-spark-1.3');
  });

  it('falls back to META_AI_API_KEY when META_API_KEY is unset', () => {
    process.env[META_AI_KEY] = 'sk-meta-ai-test';
    const adapter = new MetaAdapter();

    expect(adapter.isAvailable()).toBe(true);
    expect(createOpenAIMock).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'sk-meta-ai-test' }),
    );
  });

  it('does NOT fall through on empty-string META_API_KEY (?? semantics, matches PROVIDER_CONFIGS)', () => {
    process.env[META_KEY] = '';
    process.env[META_AI_KEY] = 'sk-meta-ai-test';
    const adapter = new MetaAdapter();

    expect(adapter.isAvailable()).toBe(false);
    expect(createOpenAIMock).not.toHaveBeenCalled();
  });

  it('honors a custom META_API_BASE_URL', () => {
    process.env[META_KEY] = 'sk-meta-test';
    process.env[META_BASE] = 'https://proxy.example.com/meta/v1';
    new MetaAdapter();
    expect(createOpenAIMock).toHaveBeenCalledWith(
      expect.objectContaining({ baseURL: 'https://proxy.example.com/meta/v1' }),
    );
  });

  it('generate() sends the Meta request shape and maps usage', async () => {
    process.env[META_KEY] = 'sk-meta-test';
    generateTextMock.mockResolvedValue({
      text: 'hello from meta',
      usage: { promptTokens: 10, completionTokens: 5 },
    });

    const adapter = new MetaAdapter();
    const result = await adapter.generate(mockMetaModel, {
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [{ role: 'user', content: 'hi' }],
        temperature: 0.7,
        maxOutputTokens: 4096,
      }),
    );
    expect(result.text).toBe('hello from meta');
    expect(result.usage.promptTokens).toBe(10);
    expect(result.usage.completionTokens).toBe(5);
    expect(result.usage.totalTokens).toBe(15);
    expect(result.usage.estimatedCost).toBeCloseTo(10 * 0.00000125 + 5 * 0.00000425, 10);
    expect(result.finishReason).toBe('stop');
  });

  it('generate() maps AI-SDK input/output token naming', async () => {
    process.env[META_KEY] = 'sk-meta-test';
    generateTextMock.mockResolvedValue({
      text: 'x',
      usage: { inputTokens: 7, outputTokens: 3 },
    });

    const adapter = new MetaAdapter();
    const result = await adapter.generate(mockMetaModel, {
      messages: [{ role: 'user', content: 'hi' }],
      temperature: 0.2,
      maxOutputTokens: 100,
    });

    expect(result.usage.promptTokens).toBe(7);
    expect(result.usage.completionTokens).toBe(3);
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({ temperature: 0.2, maxOutputTokens: 100 }),
    );
  });

  it('stream() returns the SDK text stream', async () => {
    process.env[META_KEY] = 'sk-meta-test';
    const fakeStream = (async function* () {
      yield 'a';
      yield 'b';
    })();
    streamTextMock.mockReturnValue({ textStream: fakeStream });

    const adapter = new MetaAdapter();
    const { textStream } = await adapter.stream(mockMetaModel, {
      messages: [{ role: 'user', content: 'hi' }],
    });

    const chunks: string[] = [];
    for await (const c of textStream) chunks.push(c);
    expect(chunks).toEqual(['a', 'b']);
  });

  it('generate() throws a not-configured error when no key is set', async () => {
    const adapter = new MetaAdapter();
    await expect(
      adapter.generate(mockMetaModel, { messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toThrow(/not configured/);
  });
});

describe('ProviderAdapterRegistry with Meta', () => {
  const prev: Record<string, string | undefined> = {
    [META_KEY]: process.env[META_KEY],
    [META_AI_KEY]: process.env[META_AI_KEY],
  };

  beforeEach(() => {
    createOpenAIMock.mockClear();
    delete process.env[META_KEY];
    delete process.env[META_AI_KEY];
    delete process.env['OPENAI_API_KEY'];
    delete process.env['ANTHROPIC_API_KEY'];
    delete process.env['GOOGLE_API_KEY'];
    delete process.env['OPENROUTER_API_KEY'];
  });

  afterEach(() => {
    for (const k of [META_KEY, META_AI_KEY]) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  });

  it('selects the Meta adapter when only META_API_KEY is set', () => {
    process.env[META_KEY] = 'sk-meta-test';
    const registry = new ProviderAdapterRegistry();

    const adapter = registry.getForModel(mockMetaModel);
    expect(adapter.id).toBe('meta');
    expect(adapter).toBeInstanceOf(MetaAdapter);
  });

  it('lists meta among available adapters and reports hasAnyProvider()', () => {
    process.env[META_KEY] = 'sk-meta-test';
    const registry = new ProviderAdapterRegistry();

    expect(registry.getAvailableAdapters().map((a) => a.id)).toContain('meta');
    expect(registry.hasAnyProvider()).toBe(true);
  });

  it('throws for provider "meta" when no Meta key is configured', () => {
    const registry = new ProviderAdapterRegistry();
    expect(() => registry.getForModel(mockMetaModel)).toThrow(/not configured/);
  });
});
