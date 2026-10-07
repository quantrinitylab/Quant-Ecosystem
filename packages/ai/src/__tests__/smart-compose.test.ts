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

import { generateText } from 'ai';
import { SmartComposeService } from '../services/smart-compose';
import { AIEngine } from '../core/engine';

describe('SmartComposeService', () => {
  let service: SmartComposeService;
  let engine: AIEngine;

  beforeEach(() => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    vi.stubEnv('GOOGLE_API_KEY', '');

    engine = new AIEngine({ enableCaching: false, costBudgetPerUser: 100, costBudgetPerDay: 1000 });
    service = new SmartComposeService(engine);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  describe('compose', () => {
    it('generates composed text with default options', async () => {
      vi.mocked(generateText)
        .mockResolvedValueOnce({
          text: 'Dear Team, I wanted to follow up on our meeting.',
          usage: { promptTokens: 20, completionTokens: 30 },
        } as never)
        .mockResolvedValueOnce({
          text: 'Alternative one\nAlternative two\nAlternative three',
          usage: { promptTokens: 15, completionTokens: 20 },
        } as never);

      const result = await service.compose('follow up on meeting', 'user-1');

      expect(result.text).toBe('Dear Team, I wanted to follow up on our meeting.');
      expect(result.tone).toBe('professional');
      expect(result.wordCount).toBeGreaterThan(0);
      expect(result.suggestions).toHaveLength(3);
    });

    it('uses specified tone and length', async () => {
      vi.mocked(generateText)
        .mockResolvedValueOnce({
          text: 'Hey! Great meeting today!',
          usage: { promptTokens: 15, completionTokens: 10 },
        } as never)
        .mockResolvedValueOnce({
          text: 'Suggestion 1\nSuggestion 2',
          usage: { promptTokens: 10, completionTokens: 10 },
        } as never);

      const result = await service.compose('meeting recap', 'user-1', {
        tone: 'casual',
        length: 'short',
      });

      expect(result.tone).toBe('casual');
      expect(generateText).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.7,
        }),
      );
    });

    it('includes context when provided', async () => {
      vi.mocked(generateText)
        .mockResolvedValueOnce({
          text: 'Response with context',
          usage: { promptTokens: 25, completionTokens: 15 },
        } as never)
        .mockResolvedValueOnce({
          text: 'Suggestion',
          usage: { promptTokens: 10, completionTokens: 5 },
        } as never);

      await service.compose('write email', 'user-1', {
        context: 'Client is upset about delay',
      });

      const firstCall = vi.mocked(generateText).mock.calls[0]![0] as {
        messages: Array<{ content: string }>;
      };
      const userMsg = firstCall.messages.find((m: any) => m.content?.includes('Client is upset'));
      expect(userMsg).toBeDefined();
    });
  });

  describe('improve', () => {
    it('returns improved text', async () => {
      vi.mocked(generateText).mockResolvedValue({
        text: 'This is the improved version of your text.',
        usage: { promptTokens: 20, completionTokens: 15 },
      } as never);

      const result = await service.improve('this is my text', 'user-1');

      expect(result.text).toBe('This is the improved version of your text.');
      expect(result.suggestions).toHaveLength(0);
    });
  });

  describe('continueWriting', () => {
    it('returns continuation text', async () => {
      vi.mocked(generateText).mockResolvedValue({
        text: 'And furthermore, the results were significant.',
        usage: { promptTokens: 20, completionTokens: 15 },
      } as never);

      const result = await service.continueWriting('The study began in January.', 'user-1');

      expect(result).toBe('And furthermore, the results were significant.');
    });
  });
});
