import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AIContactContextService } from '../services/ai-contact-context.service';

function createMockAIEngine() {
  return {
    infer: vi.fn(),
  };
}

describe('AIContactContextService', () => {
  let service: AIContactContextService;
  let aiEngine: ReturnType<typeof createMockAIEngine>;

  beforeEach(() => {
    aiEngine = createMockAIEngine();
    service = new AIContactContextService(aiEngine as never);
  });

  describe('getContactContext', () => {
    it('returns contact context with interaction history', async () => {
      aiEngine.infer.mockResolvedValue({
        content: JSON.stringify({
          contactEmail: 'alice@company.com',
          totalInteractions: 25,
          firstContact: '2023-06-15',
          lastContact: '2024-01-10',
          relationship: 'Colleague in engineering team',
          topTopics: ['project updates', 'code reviews', 'sprint planning'],
          sentiment: 'positive and collaborative',
          confidence: 0.88,
        }),
        model: 'gpt-4o',
        usage: { promptTokens: 200, completionTokens: 80, totalTokens: 280, estimatedCost: 0.003 },
        latencyMs: 300,
        cached: false,
      });

      const result = await service.getContactContext('alice@company.com', 'user-1', [
        {
          date: '2024-01-10',
          subject: 'Sprint Review',
          direction: 'received',
          snippet: 'Great work on the feature',
        },
        {
          date: '2024-01-05',
          subject: 'Code Review',
          direction: 'sent',
          snippet: 'Looks good, just one comment',
        },
      ]);

      expect(result.contactEmail).toBe('alice@company.com');
      expect(result.totalInteractions).toBe(25);
      expect(result.relationship).toContain('Colleague');
      expect(result.topTopics).toContain('code reviews');
      expect(aiEngine.infer).toHaveBeenCalledWith(
        expect.objectContaining({
          app: 'quantmail',
          feature: 'contact-context',
          temperature: 0.3,
        }),
      );
    });

    it('throws error when AI returns invalid JSON', async () => {
      aiEngine.infer.mockResolvedValue({
        content: 'invalid',
        model: 'gpt-4o',
        usage: { promptTokens: 100, completionTokens: 10, totalTokens: 110, estimatedCost: 0.001 },
        latencyMs: 150,
        cached: false,
      });

      await expect(service.getContactContext('test@test.com', 'user-1')).rejects.toThrow(
        'Failed to parse AI contact context response',
      );
    });

    it('throws error when AI returns invalid schema', async () => {
      aiEngine.infer.mockResolvedValue({
        content: JSON.stringify({ contactEmail: 'test@test.com' }),
        model: 'gpt-4o',
        usage: { promptTokens: 100, completionTokens: 10, totalTokens: 110, estimatedCost: 0.001 },
        latencyMs: 150,
        cached: false,
      });

      await expect(service.getContactContext('test@test.com', 'user-1')).rejects.toThrow(
        'AI returned invalid contact context',
      );
    });
  });

  describe('getRecentInteractions', () => {
    it('returns an empty array (pending implementation)', async () => {
      const result = await service.getRecentInteractions('alice@company.com', 'user-1');
      expect(result).toEqual([]);
    });
  });
});
