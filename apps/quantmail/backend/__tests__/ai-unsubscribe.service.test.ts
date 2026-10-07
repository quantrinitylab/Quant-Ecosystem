import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AIUnsubscribeService } from '../services/ai-unsubscribe.service';

function createMockAIEngine() {
  return {
    infer: vi.fn(),
  };
}

describe('AIUnsubscribeService', () => {
  let service: AIUnsubscribeService;
  let aiEngine: ReturnType<typeof createMockAIEngine>;

  beforeEach(() => {
    aiEngine = createMockAIEngine();
    service = new AIUnsubscribeService(aiEngine as never);
  });

  describe('detectNewsletters', () => {
    it('detects newsletters from email metadata', async () => {
      aiEngine.infer.mockResolvedValue({
        content: JSON.stringify([
          {
            id: 'email-1',
            from: 'newsletter@tech.com',
            isNewsletter: true,
            confidence: 0.95,
            neverOpened: true,
            frequency: 'weekly',
          },
          {
            id: 'email-2',
            from: 'boss@company.com',
            isNewsletter: false,
            confidence: 0.98,
            neverOpened: false,
            frequency: 'unknown',
          },
        ]),
        model: 'gpt-4o',
        usage: { promptTokens: 200, completionTokens: 100, totalTokens: 300, estimatedCost: 0.003 },
        latencyMs: 300,
        cached: false,
      });

      const result = await service.detectNewsletters(
        [
          {
            id: 'email-1',
            from: 'newsletter@tech.com',
            subject: 'Weekly Tech Digest',
            openCount: 0,
            receivedAt: '2024-01-15T10:00:00Z',
            hasUnsubscribeHeader: true,
          },
          {
            id: 'email-2',
            from: 'boss@company.com',
            subject: 'Meeting Tomorrow',
            openCount: 3,
            receivedAt: '2024-01-15T11:00:00Z',
            hasUnsubscribeHeader: false,
          },
        ],
        'user-1',
      );

      expect(result).toHaveLength(2);
      expect(result[0].isNewsletter).toBe(true);
      expect(result[0].neverOpened).toBe(true);
      expect(result[1].isNewsletter).toBe(false);
    });

    it('throws error when AI returns invalid JSON', async () => {
      aiEngine.infer.mockResolvedValue({
        content: 'not json',
        model: 'gpt-4o',
        usage: { promptTokens: 100, completionTokens: 10, totalTokens: 110, estimatedCost: 0.001 },
        latencyMs: 150,
        cached: false,
      });

      await expect(
        service.detectNewsletters(
          [{ id: '1', from: 'a@b.com', subject: 'Test', openCount: 0, receivedAt: '2024-01-01' }],
          'user-1',
        ),
      ).rejects.toThrow('Failed to parse AI newsletter detection response');
    });
  });

  describe('generateUnsubscribeActions', () => {
    it('generates actions only for never-opened newsletters', () => {
      const actions = service.generateUnsubscribeActions([
        {
          id: 'email-1',
          from: 'news@a.com',
          isNewsletter: true,
          confidence: 0.9,
          neverOpened: true,
          frequency: 'weekly',
        },
        {
          id: 'email-2',
          from: 'updates@b.com',
          isNewsletter: true,
          confidence: 0.8,
          neverOpened: false,
          frequency: 'daily',
        },
        {
          id: 'email-3',
          from: 'boss@c.com',
          isNewsletter: false,
          confidence: 0.95,
          neverOpened: true,
        },
      ]);

      expect(actions).toHaveLength(1);
      expect(actions[0].emailId).toBe('email-1');
      expect(actions[0].method).toBe('header');
      expect(actions[0].status).toBe('pending');
    });
  });

  describe('executeBatchUnsubscribe', () => {
    it('processes batch unsubscribe actions', async () => {
      const result = await service.executeBatchUnsubscribe(
        [
          { emailId: 'email-1', from: 'news@a.com', method: 'header', status: 'pending' },
          { emailId: 'email-2', from: 'news@b.com', method: 'link', status: 'pending' },
        ],
        'user-1',
      );

      expect(result.completed).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.results).toHaveLength(2);
      expect(result.results[0].status).toBe('completed');
    });
  });
});
