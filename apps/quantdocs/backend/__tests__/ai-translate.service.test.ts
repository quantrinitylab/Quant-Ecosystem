import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AITranslateService } from '../services/ai-translate.service';

function createMockAI() {
  return {
    infer: vi.fn(),
  };
}

describe('AITranslateService', () => {
  let service: AITranslateService;
  let ai: ReturnType<typeof createMockAI>;

  beforeEach(() => {
    ai = createMockAI();
    service = new AITranslateService(ai as never);
  });

  describe('translate', () => {
    it('returns translated content with source language and confidence', async () => {
      ai.infer.mockResolvedValue({
        id: 'resp-1',
        content: JSON.stringify({
          translated: 'Bonjour le monde',
          sourceLanguage: 'English',
          confidence: 0.95,
        }),
        model: 'gpt-4',
        finishReason: 'stop',
        usage: { promptTokens: 60, completionTokens: 20, totalTokens: 80, estimatedCost: 0.005 },
        latencyMs: 350,
        cached: false,
      });

      const result = await service.translate('Hello world', 'French', false, 'user-1');

      expect(result.translated).toBe('Bonjour le monde');
      expect(result.sourceLanguage).toBe('English');
      expect(result.confidence).toBe(0.95);
    });

    it('preserveFormatting flag is passed correctly in prompt', async () => {
      ai.infer.mockResolvedValue({
        id: 'resp-2',
        content: JSON.stringify({
          translated: '<h1>Hola Mundo</h1><p>Este es un documento.</p>',
          sourceLanguage: 'English',
          confidence: 0.92,
        }),
        model: 'gpt-4',
        finishReason: 'stop',
        usage: { promptTokens: 70, completionTokens: 25, totalTokens: 95, estimatedCost: 0.006 },
        latencyMs: 400,
        cached: false,
      });

      await service.translate(
        '<h1>Hello World</h1><p>This is a document.</p>',
        'Spanish',
        true,
        'user-1',
      );

      expect(ai.infer).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringContaining('Preserve all formatting'),
          app: 'quantdocs',
          feature: 'ai-translate',
        }),
      );
    });

    it('includes plain text instruction when preserveFormatting is false', async () => {
      ai.infer.mockResolvedValue({
        id: 'resp-3',
        content: JSON.stringify({
          translated: 'Hallo Welt',
          sourceLanguage: 'English',
          confidence: 0.98,
        }),
        model: 'gpt-4',
        finishReason: 'stop',
        usage: { promptTokens: 50, completionTokens: 15, totalTokens: 65, estimatedCost: 0.004 },
        latencyMs: 300,
        cached: false,
      });

      await service.translate('Hello World', 'German', false, 'user-1');

      expect(ai.infer).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringContaining('Translate the plain text content'),
        }),
      );
    });

    it('throws on invalid JSON response', async () => {
      ai.infer.mockResolvedValue({
        id: 'resp-4',
        content: 'not json',
        model: 'gpt-4',
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15, estimatedCost: 0.001 },
        latencyMs: 100,
        cached: false,
      });

      await expect(service.translate('Hello', 'French', false, 'user-1')).rejects.toThrow(
        'Failed to parse AI translate response',
      );
    });
  });
});
