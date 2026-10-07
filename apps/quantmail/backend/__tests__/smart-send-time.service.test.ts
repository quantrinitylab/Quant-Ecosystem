import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SmartSendTimeService } from '../services/smart-send-time.service';

function createMockAIEngine() {
  return {
    infer: vi.fn(),
  };
}

describe('SmartSendTimeService', () => {
  let service: SmartSendTimeService;
  let aiEngine: ReturnType<typeof createMockAIEngine>;

  beforeEach(() => {
    aiEngine = createMockAIEngine();
    service = new SmartSendTimeService(aiEngine as never);
  });

  describe('predictOptimalTime', () => {
    it('predicts optimal send time for recipient', async () => {
      aiEngine.infer.mockResolvedValue({
        content: JSON.stringify({
          recipientEmail: 'bob@company.com',
          suggestedTime: '2024-01-16T09:30:00Z',
          reason: 'Recipient is most active between 9-10am on weekdays',
          confidence: 0.82,
          alternativeTimes: ['2024-01-16T14:00:00Z', '2024-01-17T09:30:00Z'],
        }),
        model: 'gpt-4o',
        usage: { promptTokens: 100, completionTokens: 60, totalTokens: 160, estimatedCost: 0.001 },
        latencyMs: 200,
        cached: false,
      });

      const result = await service.predictOptimalTime('bob@company.com', 'user-1');

      expect(result.recipientEmail).toBe('bob@company.com');
      expect(result.suggestedTime).toBe('2024-01-16T09:30:00Z');
      expect(result.confidence).toBe(0.82);
      expect(result.alternativeTimes).toHaveLength(2);
      expect(aiEngine.infer).toHaveBeenCalledWith(
        expect.objectContaining({
          app: 'quantmail',
          feature: 'smart-send-time',
          temperature: 0.3,
        }),
      );
    });

    it('accepts engagement history for better predictions', async () => {
      aiEngine.infer.mockResolvedValue({
        content: JSON.stringify({
          recipientEmail: 'alice@company.com',
          suggestedTime: '2024-01-16T10:00:00Z',
          reason: 'Based on engagement history, recipient responds fastest at 10am',
          confidence: 0.92,
          alternativeTimes: ['2024-01-16T14:00:00Z'],
        }),
        model: 'gpt-4o',
        usage: { promptTokens: 150, completionTokens: 60, totalTokens: 210, estimatedCost: 0.002 },
        latencyMs: 200,
        cached: false,
      });

      const result = await service.predictOptimalTime('alice@company.com', 'user-1', {
        recipientEmail: 'alice@company.com',
        averageResponseTimeMinutes: 30,
        mostActiveHours: [9, 10, 11],
        mostActiveDays: ['Monday', 'Tuesday', 'Wednesday'],
        timezone: 'America/New_York',
      });

      expect(result.confidence).toBe(0.92);
      expect(aiEngine.infer).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringContaining('Average response time: 30 minutes'),
        }),
      );
    });

    it('throws error when AI returns invalid JSON', async () => {
      aiEngine.infer.mockResolvedValue({
        content: 'invalid json',
        model: 'gpt-4o',
        usage: { promptTokens: 100, completionTokens: 10, totalTokens: 110, estimatedCost: 0.001 },
        latencyMs: 150,
        cached: false,
      });

      await expect(service.predictOptimalTime('test@test.com', 'user-1')).rejects.toThrow(
        'Failed to parse AI send time response',
      );
    });
  });

  describe('getRecipientPatterns', () => {
    it('returns recipient engagement patterns', async () => {
      const result = await service.getRecipientPatterns('bob@company.com', 'user-1');

      expect(result.recipientEmail).toBe('bob@company.com');
      expect(result.averageResponseTimeMinutes).toBe(45);
      expect(result.mostActiveHours).toContain(9);
      expect(result.mostActiveDays).toContain('Monday');
    });
  });
});
