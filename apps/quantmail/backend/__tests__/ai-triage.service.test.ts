import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AITriageService } from '../services/ai-triage.service';

function createMockAIEngine() {
  return {
    infer: vi.fn(),
  };
}

describe('AITriageService', () => {
  let service: AITriageService;
  let aiEngine: ReturnType<typeof createMockAIEngine>;

  beforeEach(() => {
    aiEngine = createMockAIEngine();
    service = new AITriageService(aiEngine as never);
  });

  describe('triage', () => {
    it('classifies an urgent email as act_now', async () => {
      aiEngine.infer.mockResolvedValue({
        content: JSON.stringify({
          category: 'act_now',
          reason: 'Server outage requires immediate response',
          urgency: 0.95,
          suggestedAction: 'Reply immediately with ETA for fix',
        }),
        model: 'gpt-4o',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150, estimatedCost: 0.001 },
        latencyMs: 200,
        cached: false,
      });

      const result = await service.triage(
        {
          subject: 'URGENT: Production server down',
          body: 'The production server is unresponsive. Please fix ASAP.',
          from: 'ops@company.com',
          receivedAt: '2024-01-15T10:00:00Z',
        },
        'user-1',
      );

      expect(result.category).toBe('act_now');
      expect(result.urgency).toBe(0.95);
      expect(result.reason).toContain('Server outage');
      expect(aiEngine.infer).toHaveBeenCalledWith(
        expect.objectContaining({
          app: 'quantmail',
          feature: 'email-triage',
          userId: 'user-1',
          temperature: 0.2,
        }),
      );
    });

    it('classifies a newsletter as ignore', async () => {
      aiEngine.infer.mockResolvedValue({
        content: JSON.stringify({
          category: 'ignore',
          reason: 'Marketing newsletter with no action required',
          urgency: 0.1,
        }),
        model: 'gpt-4o',
        usage: { promptTokens: 80, completionTokens: 40, totalTokens: 120, estimatedCost: 0.001 },
        latencyMs: 150,
        cached: false,
      });

      const result = await service.triage(
        {
          subject: 'Weekly Tech Newsletter',
          body: 'Top stories this week in tech...',
          from: 'newsletter@techdigest.com',
        },
        'user-1',
      );

      expect(result.category).toBe('ignore');
      expect(result.urgency).toBe(0.1);
    });

    it('throws error when AI returns invalid JSON', async () => {
      aiEngine.infer.mockResolvedValue({
        content: 'not valid json',
        model: 'gpt-4o',
        usage: { promptTokens: 80, completionTokens: 10, totalTokens: 90, estimatedCost: 0.001 },
        latencyMs: 150,
        cached: false,
      });

      await expect(
        service.triage({ subject: 'Test', body: 'Test body', from: 'test@test.com' }, 'user-1'),
      ).rejects.toThrow('Failed to parse AI triage response');
    });

    it('throws error when AI returns invalid schema', async () => {
      aiEngine.infer.mockResolvedValue({
        content: JSON.stringify({ category: 'invalid_category', reason: 'test' }),
        model: 'gpt-4o',
        usage: { promptTokens: 80, completionTokens: 10, totalTokens: 90, estimatedCost: 0.001 },
        latencyMs: 150,
        cached: false,
      });

      await expect(
        service.triage({ subject: 'Test', body: 'Test body', from: 'test@test.com' }, 'user-1'),
      ).rejects.toThrow('AI returned invalid triage result');
    });
  });

  describe('triageBatch', () => {
    it('processes multiple emails and returns batch results', async () => {
      aiEngine.infer
        .mockResolvedValueOnce({
          content: JSON.stringify({
            category: 'act_now',
            reason: 'Urgent request',
            urgency: 0.9,
          }),
          model: 'gpt-4o',
          usage: { promptTokens: 80, completionTokens: 40, totalTokens: 120, estimatedCost: 0.001 },
          latencyMs: 150,
          cached: false,
        })
        .mockResolvedValueOnce({
          content: JSON.stringify({
            category: 'read_later',
            reason: 'Informational update',
            urgency: 0.3,
          }),
          model: 'gpt-4o',
          usage: { promptTokens: 80, completionTokens: 40, totalTokens: 120, estimatedCost: 0.001 },
          latencyMs: 150,
          cached: false,
        });

      const result = await service.triageBatch(
        [
          { subject: 'Urgent', body: 'Need response now', from: 'boss@company.com' },
          { subject: 'FYI', body: 'Just sharing this article', from: 'friend@example.com' },
        ],
        'user-1',
      );

      expect(result.triaged).toBe(2);
      expect(result.results).toHaveLength(2);
      expect(result.results[0].category).toBe('act_now');
      expect(result.results[1].category).toBe('read_later');
      expect(result.cost).toBeGreaterThan(0);
    });
  });
});
