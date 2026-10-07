import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AIStyleLearnerService } from '../services/ai-style-learner.service';

function createMockAIEngine() {
  return {
    infer: vi.fn(),
  };
}

describe('AIStyleLearnerService', () => {
  let service: AIStyleLearnerService;
  let aiEngine: ReturnType<typeof createMockAIEngine>;

  beforeEach(() => {
    aiEngine = createMockAIEngine();
    service = new AIStyleLearnerService(aiEngine as never);
  });

  describe('analyzeSentItems', () => {
    it('analyzes sent emails and creates a style profile', async () => {
      aiEngine.infer.mockResolvedValue({
        content: JSON.stringify({
          userId: 'user-1',
          tone: 'professional but warm',
          averageSentenceLength: 12,
          vocabularyLevel: 'moderate',
          greetingStyle: 'Hi [Name],',
          closingStyle: 'Best regards',
          formality: 0.7,
          traits: ['uses bullet points', 'concise', 'action-oriented'],
          confidence: 0.85,
        }),
        model: 'gpt-4o',
        usage: { promptTokens: 800, completionTokens: 100, totalTokens: 900, estimatedCost: 0.008 },
        latencyMs: 500,
        cached: false,
      });

      const result = await service.analyzeSentItems(
        [
          {
            subject: 'Update',
            body: 'Hi Team,\n\nHere is the update.\n\nBest regards',
            to: 'team@co.com',
          },
          {
            subject: 'Follow-up',
            body: 'Hi John,\n\nJust checking in.\n\nBest regards',
            to: 'john@co.com',
          },
        ],
        'user-1',
      );

      expect(result.userId).toBe('user-1');
      expect(result.tone).toContain('professional');
      expect(result.formality).toBe(0.7);
      expect(result.traits).toContain('concise');
      expect(aiEngine.infer).toHaveBeenCalledWith(
        expect.objectContaining({
          app: 'quantmail',
          feature: 'style-learner',
          temperature: 0.3,
        }),
      );
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
        service.analyzeSentItems([{ subject: 'Test', body: 'Body', to: 'a@b.com' }], 'user-1'),
      ).rejects.toThrow('Failed to parse AI style analysis response');
    });
  });

  describe('getStyleProfile', () => {
    it('throws when no profile exists', async () => {
      await expect(service.getStyleProfile('user-1')).rejects.toThrow('No style profile found');
    });

    it('returns existing profile after analysis', async () => {
      aiEngine.infer.mockResolvedValue({
        content: JSON.stringify({
          userId: 'user-1',
          tone: 'casual',
          averageSentenceLength: 8,
          vocabularyLevel: 'simple',
          greetingStyle: 'Hey,',
          closingStyle: 'Thanks',
          formality: 0.3,
          traits: ['informal', 'brief'],
          confidence: 0.9,
        }),
        model: 'gpt-4o',
        usage: { promptTokens: 400, completionTokens: 80, totalTokens: 480, estimatedCost: 0.004 },
        latencyMs: 400,
        cached: false,
      });

      await service.analyzeSentItems(
        [{ subject: 'Hi', body: 'Hey, quick note.', to: 'friend@co.com' }],
        'user-1',
      );

      const profile = await service.getStyleProfile('user-1');
      expect(profile.tone).toBe('casual');
      expect(profile.formality).toBe(0.3);
    });
  });

  describe('generateStyledDraft', () => {
    it('generates a draft matching user style', async () => {
      // First, set up a style profile
      aiEngine.infer.mockResolvedValueOnce({
        content: JSON.stringify({
          userId: 'user-1',
          tone: 'professional',
          averageSentenceLength: 14,
          vocabularyLevel: 'moderate',
          greetingStyle: 'Hello,',
          closingStyle: 'Regards',
          formality: 0.8,
          traits: ['polite', 'structured'],
          confidence: 0.88,
        }),
        model: 'gpt-4o',
        usage: { promptTokens: 400, completionTokens: 80, totalTokens: 480, estimatedCost: 0.004 },
        latencyMs: 400,
        cached: false,
      });

      await service.analyzeSentItems(
        [
          {
            subject: 'Meeting',
            body: 'Hello,\n\nLooking forward to the meeting.\n\nRegards',
            to: 'a@b.com',
          },
        ],
        'user-1',
      );

      // Now generate a styled draft
      aiEngine.infer.mockResolvedValueOnce({
        content: JSON.stringify({
          body: 'Hello,\n\nI wanted to inform you that the project deadline has been extended by one week. Please adjust your timelines accordingly.\n\nRegards',
          matchScore: 0.88,
          adjustments: ['Added formal greeting', 'Used structured paragraphs'],
        }),
        model: 'gpt-4o',
        usage: { promptTokens: 200, completionTokens: 60, totalTokens: 260, estimatedCost: 0.002 },
        latencyMs: 300,
        cached: false,
      });

      const result = await service.generateStyledDraft(
        'Tell the team the project deadline is extended by one week',
        'user-1',
      );

      expect(result.body).toContain('Hello');
      expect(result.matchScore).toBe(0.88);
      expect(result.adjustments).toHaveLength(2);
    });

    it('throws error when AI returns invalid JSON', async () => {
      aiEngine.infer.mockResolvedValue({
        content: 'invalid',
        model: 'gpt-4o',
        usage: { promptTokens: 100, completionTokens: 10, totalTokens: 110, estimatedCost: 0.001 },
        latencyMs: 150,
        cached: false,
      });

      await expect(service.generateStyledDraft('content', 'user-1')).rejects.toThrow(
        'Failed to parse AI styled draft response',
      );
    });
  });
});
