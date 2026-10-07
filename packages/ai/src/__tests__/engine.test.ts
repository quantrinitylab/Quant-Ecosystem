import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the AI SDK modules
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
import { AIEngine } from '../core/engine';

describe('AIEngine', () => {
  let engine: AIEngine;

  beforeEach(() => {
    vi.stubEnv('OPENAI_API_KEY', 'test-openai-key');
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-anthropic-key');

    vi.mocked(generateText).mockResolvedValue({
      text: 'Mocked AI response content',
      usage: { promptTokens: 10, completionTokens: 20 },
      finishReason: 'stop',
    } as never);

    engine = new AIEngine({
      enableCaching: true,
      cacheTtlMs: 60000,
      costBudgetPerUser: 100.0,
      costBudgetPerDay: 1000.0,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  describe('infer', () => {
    it('calls generateText with correct parameters', async () => {
      const response = await engine.infer({
        prompt: 'Tell me about AI',
        systemPrompt: 'You are a helpful assistant',
        userId: 'user1',
        app: 'quantchat',
        feature: 'chat',
        temperature: 0.5,
      });

      expect(generateText).toHaveBeenCalledTimes(1);
      expect(response.content).toBe('Mocked AI response content');
      expect(response.cached).toBe(false);
      expect(response.finishReason).toBe('stop');
    });

    it('returns cached response on second call', async () => {
      const request = {
        prompt: 'Tell me about AI',
        userId: 'user1',
        app: 'quantchat' as const,
        feature: 'chat',
      };

      await engine.infer(request);
      const response2 = await engine.infer(request);

      expect(response2.cached).toBe(true);
      expect(generateText).toHaveBeenCalledTimes(1); // Only called once
    });

    it('tracks token usage', async () => {
      const response = await engine.infer({
        prompt: 'Test prompt',
        userId: 'user1',
        app: 'quantchat',
        feature: 'chat',
      });

      expect(response.usage.promptTokens).toBe(10);
      expect(response.usage.completionTokens).toBe(20);
      expect(response.usage.totalTokens).toBe(30);
    });

    it('enforces budget limits', async () => {
      const cheapEngine = new AIEngine({
        costBudgetPerUser: 0.000001,
        costBudgetPerDay: 1000.0,
        enableCaching: false,
      });

      // First call works - it costs more than 0.0001 based on mock tokens (10 + 20)
      await cheapEngine.infer({
        prompt: 'Test',
        userId: 'user1',
        app: 'quantchat',
        feature: 'chat',
      });

      // Second call should fail due to budget
      await expect(
        cheapEngine.infer({
          prompt: 'Test again with different text',
          userId: 'user1',
          app: 'quantchat',
          feature: 'chat',
        }),
      ).rejects.toThrow(/budget/i);
    });

    it('processes input through safety pipeline', async () => {
      await engine.infer({
        prompt: 'Send to user@example.com',
        userId: 'user1',
        app: 'quantchat',
        feature: 'chat',
      });

      // The generateText call should receive redacted input
      const call = vi.mocked(generateText).mock.calls[0]![0] as {
        messages: Array<{ role: string; content: string }>;
      };
      const userMessage = call.messages.find((m) => m.role === 'user');
      expect(userMessage?.content).toContain('[EMAIL_REDACTED]');
    });
  });

  describe('stream', () => {
    it('returns an async generator of chunks', async () => {
      const mockStream = (async function* () {
        yield 'Hello';
        yield ' ';
        yield 'world';
      })();

      vi.mocked(streamText).mockReturnValue({
        textStream: mockStream,
      } as never);

      const chunks: string[] = [];
      for await (const chunk of engine.stream({
        prompt: 'Hello',
        userId: 'user1',
        app: 'quantchat',
        feature: 'chat',
      })) {
        chunks.push(chunk.content);
      }

      // Last chunk is the done signal with empty content
      expect(chunks.filter(Boolean)).toEqual(['Hello', ' ', 'world']);
      expect(chunks[chunks.length - 1]).toBe('');
    });
  });

  describe('getStats', () => {
    it('returns engine statistics', () => {
      const stats = engine.getStats();
      expect(stats.activeRequests).toBe(0);
      expect(stats.cacheSize).toBe(0);
      expect(stats.dailyCost).toBe(0);
    });
  });

  describe('clearCache', () => {
    it('clears the semantic cache', async () => {
      await engine.infer({
        prompt: 'Test prompt',
        userId: 'user1',
        app: 'quantchat',
        feature: 'chat',
      });

      expect(engine.getStats().cacheSize).toBe(1);
      engine.clearCache();
      expect(engine.getStats().cacheSize).toBe(0);
    });
  });

  describe('provider configuration', () => {
    it('throws when no API key is configured', async () => {
      vi.stubEnv('OPENAI_API_KEY', '');
      vi.stubEnv('ANTHROPIC_API_KEY', '');
      vi.stubEnv('GOOGLE_API_KEY', '');
      vi.stubEnv('CLOUDFLARE_API_TOKEN', '');
      vi.stubEnv('CLOUDFLARE_API_KEY', '');
      delete process.env['OPENAI_API_KEY'];
      delete process.env['ANTHROPIC_API_KEY'];
      delete process.env['GOOGLE_API_KEY'];
      delete process.env['CLOUDFLARE_API_TOKEN'];
      delete process.env['CLOUDFLARE_API_KEY'];

      const noKeyEngine = new AIEngine();

      await expect(
        noKeyEngine.infer({
          prompt: 'test',
          userId: 'user1',
          app: 'quantchat',
          feature: 'chat',
        }),
      ).rejects.toThrow(/not configured/i);
    });

    it('initializes Google provider when GOOGLE_API_KEY is set', async () => {
      const { createGoogleGenerativeAI } = await import('@ai-sdk/google');

      vi.stubEnv('OPENAI_API_KEY', '');
      vi.stubEnv('ANTHROPIC_API_KEY', '');
      vi.stubEnv('GOOGLE_API_KEY', 'test-google-key');
      delete process.env['OPENAI_API_KEY'];
      delete process.env['ANTHROPIC_API_KEY'];

      vi.mocked(generateText).mockClear();
      vi.mocked(generateText).mockResolvedValue({
        text: 'Google response',
        usage: { promptTokens: 5, completionTokens: 10 },
        finishReason: 'stop',
      } as never);

      const googleEngine = new AIEngine({
        enableCaching: false,
      });

      await googleEngine.infer({
        prompt: 'test',
        model: 'gemini-2.5-flash',
        userId: 'user1',
        app: 'quantchat',
        feature: 'chat',
      });

      expect(createGoogleGenerativeAI).toHaveBeenCalledWith({ apiKey: 'test-google-key' });
      expect(generateText).toHaveBeenCalledTimes(1);
    });
  });
});
