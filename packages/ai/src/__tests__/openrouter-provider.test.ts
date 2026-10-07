import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// OpenRouter is OpenAI-compatible, so the adapter is built on `createOpenAI`
// with an OpenRouter base URL. Mock the SDK to capture the construction args.
// `vi.hoisted` lets the mock fn be referenced inside the hoisted `vi.mock`.
const { createOpenAIMock } = vi.hoisted(() => ({
  createOpenAIMock: vi.fn((opts: { apiKey: string; baseURL?: string }) => {
    return (modelId: string) => ({ modelId, provider: 'openrouter', baseURL: opts.baseURL });
  }),
}));

vi.mock('@ai-sdk/openai', () => ({ createOpenAI: createOpenAIMock }));
vi.mock('@ai-sdk/anthropic', () => ({ createAnthropic: vi.fn(() => () => ({})) }));
vi.mock('@ai-sdk/google', () => ({ createGoogleGenerativeAI: vi.fn(() => () => ({})) }));

import { OpenRouterAdapter, ProviderAdapterRegistry } from '../core/provider-adapter';

describe('OpenRouterAdapter', () => {
  const prevKey = process.env['OPENROUTER_API_KEY'];
  const prevBase = process.env['OPENROUTER_BASE_URL'];

  beforeEach(() => {
    createOpenAIMock.mockClear();
  });

  afterEach(() => {
    if (prevKey === undefined) delete process.env['OPENROUTER_API_KEY'];
    else process.env['OPENROUTER_API_KEY'] = prevKey;
    if (prevBase === undefined) delete process.env['OPENROUTER_BASE_URL'];
    else process.env['OPENROUTER_BASE_URL'] = prevBase;
  });

  it('is unavailable without OPENROUTER_API_KEY', () => {
    delete process.env['OPENROUTER_API_KEY'];
    const adapter = new OpenRouterAdapter();
    expect(adapter.id).toBe('openrouter');
    expect(adapter.isAvailable()).toBe(false);
    expect(() => adapter.getModel('openai/gpt-4o')).toThrow(/not configured/);
  });

  it('builds an OpenAI-compatible client against the OpenRouter base URL when keyed', () => {
    process.env['OPENROUTER_API_KEY'] = 'sk-or-test';
    delete process.env['OPENROUTER_BASE_URL'];
    const adapter = new OpenRouterAdapter();

    expect(adapter.isAvailable()).toBe(true);
    expect(createOpenAIMock).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'sk-or-test', baseURL: 'https://openrouter.ai/api/v1' }),
    );
    const model = adapter.getModel('anthropic/claude-3.5-sonnet') as { modelId: string };
    expect(model.modelId).toBe('anthropic/claude-3.5-sonnet');
  });

  it('honors a custom OPENROUTER_BASE_URL', () => {
    process.env['OPENROUTER_API_KEY'] = 'sk-or-test';
    process.env['OPENROUTER_BASE_URL'] = 'https://proxy.example.com/v1';
    new OpenRouterAdapter();
    expect(createOpenAIMock).toHaveBeenCalledWith(
      expect.objectContaining({ baseURL: 'https://proxy.example.com/v1' }),
    );
  });

  it('is registered in the ProviderAdapterRegistry', () => {
    const registry = new ProviderAdapterRegistry();
    const adapter = registry.get('openrouter');
    expect(adapter).toBeDefined();
    expect(adapter?.name).toBe('OpenRouter');
  });
});
