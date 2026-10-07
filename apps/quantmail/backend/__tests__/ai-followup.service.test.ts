import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AIFollowupService } from '../services/ai-followup.service';

function createMockAIEngine() {
  return {
    infer: vi.fn(),
  };
}

describe('AIFollowupService', () => {
  let service: AIFollowupService;
  let aiEngine: ReturnType<typeof createMockAIEngine>;

  beforeEach(() => {
    aiEngine = createMockAIEngine();
    service = new AIFollowupService(aiEngine as never);
  });

  describe('detectCommitments', () => {
    it('detects commitments in an email', async () => {
      aiEngine.infer.mockResolvedValue({
        content: JSON.stringify([
          {
            description: 'Send the report by Friday',
            dueDate: '2024-01-19T17:00:00Z',
            assignee: 'john@company.com',
            confidence: 0.92,
            emailId: 'email-1',
          },
        ]),
        model: 'gpt-4o',
        usage: { promptTokens: 150, completionTokens: 60, totalTokens: 210, estimatedCost: 0.002 },
        latencyMs: 250,
        cached: false,
      });

      const result = await service.detectCommitments(
        {
          id: 'email-1',
          subject: 'Report',
          body: "I'll send the report by Friday.",
          from: 'john@company.com',
          date: '2024-01-15T10:00:00Z',
        },
        'user-1',
      );

      expect(result).toHaveLength(1);
      expect(result[0].description).toContain('report');
      expect(result[0].dueDate).toBe('2024-01-19T17:00:00Z');
      expect(result[0].assignee).toBe('john@company.com');
      expect(aiEngine.infer).toHaveBeenCalledWith(
        expect.objectContaining({
          app: 'quantmail',
          feature: 'email-followup',
          temperature: 0.2,
        }),
      );
    });

    it('throws error when AI returns invalid JSON', async () => {
      aiEngine.infer.mockResolvedValue({
        content: 'not valid json',
        model: 'gpt-4o',
        usage: { promptTokens: 100, completionTokens: 10, totalTokens: 110, estimatedCost: 0.001 },
        latencyMs: 150,
        cached: false,
      });

      await expect(
        service.detectCommitments(
          { id: '1', subject: 'Test', body: 'Body', from: 'a@b.com', date: '2024-01-01' },
          'user-1',
        ),
      ).rejects.toThrow('Failed to parse AI commitment detection response');
    });

    it('throws error when AI returns invalid schema', async () => {
      aiEngine.infer.mockResolvedValue({
        content: JSON.stringify([{ description: 'test' }]),
        model: 'gpt-4o',
        usage: { promptTokens: 100, completionTokens: 10, totalTokens: 110, estimatedCost: 0.001 },
        latencyMs: 150,
        cached: false,
      });

      await expect(
        service.detectCommitments(
          { id: '1', subject: 'Test', body: 'Body', from: 'a@b.com', date: '2024-01-01' },
          'user-1',
        ),
      ).rejects.toThrow('AI returned invalid commitment result');
    });
  });

  describe('createReminder', () => {
    it('creates a reminder from a commitment', async () => {
      const reminder = await service.createReminder(
        {
          description: 'Send report',
          dueDate: '2024-01-19T17:00:00Z',
          assignee: 'john@company.com',
          confidence: 0.9,
          emailId: 'email-1',
        },
        'user-1',
      );

      expect(reminder.id).toMatch(/^reminder_/);
      expect(reminder.commitmentDescription).toBe('Send report');
      expect(reminder.dueDate).toBe('2024-01-19T17:00:00Z');
      expect(reminder.userId).toBe('user-1');
      expect(reminder.status).toBe('active');
    });
  });

  describe('getActiveReminders', () => {
    it('returns active reminders for user', async () => {
      await service.createReminder(
        {
          description: 'Task 1',
          dueDate: '2024-01-20',
          assignee: 'a@b.com',
          confidence: 0.9,
          emailId: 'e1',
        },
        'user-1',
      );
      await service.createReminder(
        {
          description: 'Task 2',
          dueDate: '2024-01-21',
          assignee: 'c@d.com',
          confidence: 0.8,
          emailId: 'e2',
        },
        'user-1',
      );

      const reminders = await service.getActiveReminders('user-1');
      expect(reminders).toHaveLength(2);
    });

    it('returns empty array for user with no reminders', async () => {
      const reminders = await service.getActiveReminders('user-2');
      expect(reminders).toHaveLength(0);
    });
  });
});
