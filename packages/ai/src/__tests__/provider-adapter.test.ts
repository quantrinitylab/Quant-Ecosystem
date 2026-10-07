import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('ai', () => ({
  generateText: vi.fn(),
  streamText: vi.fn(),
}));

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn(() => (modelId: string) => ({ modelId, provider: 'openai' })),
}));

vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: vi.fn(() => (modelId: string) => ({ modelId, provider: 'anthropic' })),
}));

vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: vi.fn(() => (modelId: string) => ({ modelId, provider: 'google' })),
}));

import { generateText, streamText } from 'ai';
import {
  OpenAIAdapter,
  AnthropicAdapter,
  GoogleAdapter,
  ProviderAdapterRegistry,
  estimateTokens,
} from '../core/provider-adapter';
import type { AIModelConfig } from '../types';

const mockModel: AIModelConfig = {
  id: 'gpt-4o',
  name: 'GPT-4o',
  provider: 'openai',
  capabilities: ['text_generation'],
  maxContextLength: 128000,
  maxOutputTokens: 4096,
  costPerInputToken: 0.000005,
  costPerOutputToken: 0.000015,
  latencyMs: 400,
  qualityScore: 0.95,
};

const mockAnthropicModel: AIModelConfig = {
  id: 'claude-sonnet-4',
  name: 'Claude Sonnet 4',
  provider: 'anthropic',
  capabilities: ['text_generation'],
  maxContextLength: 200000,
  maxOutputTokens: 4096,
  costPerInputToken: 0.000003,
  costPerOutputToken: 0.000015,
  latencyMs: 500,
  qualityScore: 0.97,
};

describe('estimateTokens', () => {
  it('returns 0 for empty text', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('estimates tokens for simple text', () => {
    const result = estimateTokens('Hello world');
    expect(result).toBeGreaterThan(0);
  });

  it('returns higher count for longer text', () => {
    const short = estimateTokens('Hello');
    const long = estimateTokens('Hello world this is a much longer sentence with many more words');
    expect(long).toBeGreaterThan(short);
  });
});

describe('OpenAIAdapter', () => {
  let adapter: OpenAIAdapter;

  beforeEach(() => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    adapter = new OpenAIAdapter();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('reports available when API key is set', () => {
    expect(adapter.isAvailable()).toBe(true);
  });

  it('has correct id and name', () => {
    expect(adapter.id).toBe('openai');
    expect(adapter.name).toBe('OpenAI');
  });

  it('generates text via AI SDK', async () => {
    vi.mocked(generateText).mockResolvedValue({
      text: 'Generated response',
      usage: { promptTokens: 10, completionTokens: 20 },
      finishReason: 'stop',
    } as never);

    const result = await adapter.generate(mockModel, {
      messages: [{ role: 'user', content: 'Hello' }],
    });

    expect(result.text).toBe('Generated response');
    expect(result.usage.promptTokens).toBe(10);
    expect(result.usage.completionTokens).toBe(20);
    expect(result.usage.totalTokens).toBe(30);
  });

  it('streams text via AI SDK', async () => {
    const mockStream = (async function* () {
      yield 'Hello';
      yield ' world';
    })();

    vi.mocked(streamText).mockReturnValue({
      textStream: mockStream,
    } as never);

    const result = await adapter.stream(mockModel, {
      messages: [{ role: 'user', content: 'Hello' }],
    });

    const chunks: string[] = [];
    for await (const chunk of result.textStream) {
      chunks.push(chunk);
    }
    expect(chunks).toEqual(['Hello', ' world']);
  });

  it('counts tokens', () => {
    const count = adapter.countTokens('Hello world', mockModel);
    expect(count).toBeGreaterThan(0);
  });
});

describe('AnthropicAdapter', () => {
  let adapter: AnthropicAdapter;

  beforeEach(() => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    adapter = new AnthropicAdapter();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('reports available when API key is set', () => {
    expect(adapter.isAvailable()).toBe(true);
  });

  it('has correct id and name', () => {
    expect(adapter.id).toBe('anthropic');
    expect(adapter.name).toBe('Anthropic');
  });
});

describe('GoogleAdapter', () => {
  let adapter: GoogleAdapter;

  beforeEach(() => {
    vi.stubEnv('GOOGLE_API_KEY', 'test-key');
    adapter = new GoogleAdapter();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('reports available when API key is set', () => {
    expect(adapter.isAvailable()).toBe(true);
  });

  it('has correct id and name', () => {
    expect(adapter.id).toBe('google');
    expect(adapter.name).toBe('Google');
  });
});

describe('ProviderAdapterRegistry', () => {
  let registry: ProviderAdapterRegistry;

  beforeEach(() => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    registry = new ProviderAdapterRegistry();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('has available adapters', () => {
    const available = registry.getAvailableAdapters();
    expect(available.length).toBeGreaterThan(0);
  });

  it('reports hasAnyProvider as true', () => {
    expect(registry.hasAnyProvider()).toBe(true);
  });

  it('gets adapter by provider id', () => {
    const adapter = registry.get('openai');
    expect(adapter).toBeDefined();
    expect(adapter!.id).toBe('openai');
  });

  it('returns undefined for unknown provider', () => {
    const adapter = registry.get('unknown');
    expect(adapter).toBeUndefined();
  });

  it('gets adapter for model', () => {
    const adapter = registry.getForModel(mockModel);
    expect(adapter.id).toBe('openai');
  });

  it('throws for model with no adapter', () => {
    const unknownModel: AIModelConfig = {
      ...mockModel,
      provider: 'ollama',
    };
    expect(() => registry.getForModel(unknownModel)).toThrow(/No adapter/);
  });

  describe('generateWithFallback', () => {
    it('succeeds with first model', async () => {
      vi.mocked(generateText).mockResolvedValue({
        text: 'Fallback response',
        usage: { promptTokens: 5, completionTokens: 10 },
      } as never);

      const result = await registry.generateWithFallback([mockModel], {
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(result.text).toBe('Fallback response');
      expect(result.model.id).toBe('gpt-4o');
    });

    it('falls back to second model when first fails', async () => {
      vi.mocked(generateText)
        .mockRejectedValueOnce(new Error('OpenAI failed'))
        .mockResolvedValueOnce({
          text: 'Anthropic response',
          usage: { promptTokens: 5, completionTokens: 10 },
        } as never);

      const result = await registry.generateWithFallback([mockModel, mockAnthropicModel], {
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(result.text).toBe('Anthropic response');
      expect(result.model.id).toBe('claude-sonnet-4');
    });

    it('throws when all providers fail', async () => {
      vi.mocked(generateText).mockRejectedValue(new Error('Provider error'));

      await expect(
        registry.generateWithFallback([mockModel], {
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      ).rejects.toThrow(/All providers failed/);
    });
  });

  describe('streamWithFallback', () => {
    it('streams from first available model', async () => {
      const mockStream = (async function* () {
        yield 'Hello';
        yield ' streaming';
      })();

      vi.mocked(streamText).mockReturnValue({
        textStream: mockStream,
      } as never);

      const chunks: string[] = [];
      for await (const chunk of registry.streamWithFallback([mockModel], {
        messages: [{ role: 'user', content: 'Hello' }],
      })) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(['Hello', ' streaming']);
    });
  });
});
