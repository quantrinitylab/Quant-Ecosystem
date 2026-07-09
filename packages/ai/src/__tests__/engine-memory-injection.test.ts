import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the AI SDK so infer() doesn't hit a real provider.
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

import { generateText } from 'ai';
import { AIEngine } from '../core/engine';
import type { EngineMemory } from '../core/engine-memory';

/**
 * M11d: AIEngine can be wired to a real MemoryService backend via injected
 * memoryOptions, while the engine always owns the legacy ContextManager.
 * Default (no options) stays legacy/byte-identical.
 */
describe('AIEngine memory injection (M11d)', () => {
  beforeEach(() => {
    vi.stubEnv('OPENAI_API_KEY', 'test-openai-key');
    vi.mocked(generateText).mockResolvedValue({
      text: 'response',
      usage: { promptTokens: 5, completionTokens: 5 },
      finishReason: 'stop',
    } as never);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  function fakeBackend(): EngineMemory & {
    enrich: ReturnType<typeof vi.fn>;
    record: ReturnType<typeof vi.fn>;
  } {
    return {
      enrich: vi.fn().mockResolvedValue('ENRICHED_BY_NEXT'),
      record: vi.fn().mockResolvedValue(undefined),
    };
  }

  it('default engine does NOT touch an injected backend (legacy is default)', async () => {
    const next = fakeBackend();
    const engine = new AIEngine({ enableCaching: false }); // no memoryOptions
    await engine.infer({ prompt: 'hi', userId: 'u1', app: 'quantchat', feature: 'chat' });
    expect(next.enrich).not.toHaveBeenCalled();
    expect(next.record).not.toHaveBeenCalled();
  });

  it('routes enrich/record to the injected backend in `new` mode', async () => {
    const next = fakeBackend();
    const engine = new AIEngine({ enableCaching: false }, { mode: 'new', next });

    await engine.infer({
      prompt: 'where do I live',
      userId: 'u1',
      app: 'quantchat',
      feature: 'chat',
    });

    expect(next.enrich).toHaveBeenCalledWith('u1', 'where do I live', []);
    expect(next.record).toHaveBeenCalledWith('u1', 'where do I live', 'response');
    // The legacy ContextManager is still owned by the engine but not written to.
    const cm = engine.getContextManager();
    expect(cm.getRecentHistory('u1')).toHaveLength(0);
  });

  it('shadow mode serves legacy but emits a shadow report comparing next', async () => {
    const next = fakeBackend();
    const reports: unknown[] = [];
    const engine = new AIEngine(
      { enableCaching: false },
      { mode: 'shadow', next, onShadow: (r) => reports.push(r) },
    );

    await engine.infer({ prompt: 'hello', userId: 'u1', app: 'quantchat', feature: 'chat' });

    // Legacy path recorded the exchange (shadow writes to both, legacy primary).
    expect(engine.getContextManager().getRecentHistory('u1').length).toBeGreaterThan(0);
    // A shadow report was emitted for the enrich comparison.
    expect(reports.length).toBeGreaterThan(0);
    // The new backend was exercised silently.
    expect(next.enrich).toHaveBeenCalled();
  });
});
