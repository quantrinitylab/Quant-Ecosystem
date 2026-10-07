import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AIMeetingExtractService } from '../services/ai-meeting-extract.service';

function createMockAIEngine() {
  return {
    infer: vi.fn(),
  };
}

describe('AIMeetingExtractService', () => {
  let service: AIMeetingExtractService;
  let aiEngine: ReturnType<typeof createMockAIEngine>;

  beforeEach(() => {
    aiEngine = createMockAIEngine();
    service = new AIMeetingExtractService(aiEngine as never);
  });

  describe('extractMeetingDetails', () => {
    it('extracts meeting details from email', async () => {
      aiEngine.infer.mockResolvedValue({
        content: JSON.stringify({
          title: 'Q4 Planning Meeting',
          date: '2024-01-20',
          time: '14:00',
          duration: '1 hour',
          location: 'Conference Room A',
          attendees: ['alice@company.com', 'bob@company.com'],
          agenda: 'Review Q4 goals and budget',
          isMeetingRequest: true,
          confidence: 0.95,
        }),
        model: 'gpt-4o',
        usage: { promptTokens: 150, completionTokens: 80, totalTokens: 230, estimatedCost: 0.002 },
        latencyMs: 300,
        cached: false,
      });

      const result = await service.extractMeetingDetails(
        {
          subject: 'Meeting: Q4 Planning',
          body: 'Let us meet on Jan 20 at 2pm in Conference Room A to discuss Q4 goals. Duration: 1 hour.',
          from: 'alice@company.com',
        },
        'user-1',
      );

      expect(result.title).toBe('Q4 Planning Meeting');
      expect(result.date).toBe('2024-01-20');
      expect(result.time).toBe('14:00');
      expect(result.isMeetingRequest).toBe(true);
      expect(result.attendees).toContain('alice@company.com');
      expect(aiEngine.infer).toHaveBeenCalledWith(
        expect.objectContaining({
          app: 'quantmail',
          feature: 'meeting-extract',
          temperature: 0.2,
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
        service.extractMeetingDetails(
          { subject: 'Meeting', body: 'Let us meet', from: 'a@b.com' },
          'user-1',
        ),
      ).rejects.toThrow('Failed to parse AI meeting extraction response');
    });

    it('throws error when AI returns invalid schema', async () => {
      aiEngine.infer.mockResolvedValue({
        content: JSON.stringify({ title: 'Test', date: '2024-01-20' }),
        model: 'gpt-4o',
        usage: { promptTokens: 100, completionTokens: 10, totalTokens: 110, estimatedCost: 0.001 },
        latencyMs: 150,
        cached: false,
      });

      await expect(
        service.extractMeetingDetails(
          { subject: 'Meeting', body: 'Let us meet', from: 'a@b.com' },
          'user-1',
        ),
      ).rejects.toThrow('AI returned invalid meeting details');
    });
  });

  describe('createCalendarEvent', () => {
    it('creates a calendar event from meeting details', async () => {
      const event = await service.createCalendarEvent(
        {
          title: 'Team Sync',
          date: '2024-01-20',
          time: '10:00',
          duration: '1 hour',
          location: 'Zoom',
          attendees: ['alice@co.com'],
          agenda: 'Weekly sync',
          isMeetingRequest: true,
          confidence: 0.9,
        },
        'user-1',
      );

      expect(event.id).toMatch(/^evt_/);
      expect(event.title).toBe('Team Sync');
      expect(event.startTime).toContain('2024-01-20');
      expect(event.status).toBe('created');
      expect(event.attendees).toContain('alice@co.com');
    });
  });
});
