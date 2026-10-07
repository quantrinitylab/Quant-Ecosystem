import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QuantMeetAgent } from '../agents/quantmeet.agent.js';
import { HttpClient } from '../clients/http-client.js';

describe('QuantMeetAgent - real HTTP calls', () => {
  let mockClient: HttpClient;
  let agent: QuantMeetAgent;

  beforeEach(() => {
    mockClient = {
      post: vi.fn(),
      get: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      setAuthToken: vi.fn(),
      getBaseUrl: vi.fn().mockReturnValue('http://localhost:3004'),
    } as unknown as HttpClient;

    agent = new QuantMeetAgent(mockClient);
  });

  describe('quantmeet_create_room', () => {
    it('calls POST /api/rooms with correct parameters', async () => {
      (mockClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        status: 201,
        data: {
          id: 'room-xyz',
          joinUrl: 'https://meet.quant.app/room-xyz',
          token: 'jwt-token-123',
        },
      });

      const tool = (agent as any).tools.get('quantmeet_create_room');
      const result = await tool.execute({
        title: 'Sprint Planning',
        participants: ['alice@quant.app', 'bob@quant.app'],
        scheduledTime: '2024-01-15T10:00:00Z',
      });

      expect(mockClient.post).toHaveBeenCalledWith('/api/rooms', {
        title: 'Sprint Planning',
        participants: ['alice@quant.app', 'bob@quant.app'],
        scheduledTime: '2024-01-15T10:00:00Z',
      });
      expect(result.success).toBe(true);
      expect(result.roomId).toBe('room-xyz');
      expect(result.joinUrl).toBe('https://meet.quant.app/room-xyz');
      expect(result.token).toBe('jwt-token-123');
    });

    it('returns error object on failure without crashing', async () => {
      (mockClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 503,
        data: null,
        error: 'LiveKit unavailable',
      });

      const tool = (agent as any).tools.get('quantmeet_create_room');
      const result = await tool.execute({ title: 'Test' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('LiveKit unavailable');
    });
  });

  describe('quantmeet_summarize', () => {
    it('calls POST /api/meetings/summarize and returns summary', async () => {
      (mockClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        status: 200,
        data: {
          summary: 'Team discussed Q1 roadmap priorities.',
          actionItems: ['Finalize designs', 'Update backlog'],
          participants: ['alice', 'bob'],
          duration: 3600,
        },
      });

      const tool = (agent as any).tools.get('quantmeet_summarize');
      const result = await tool.execute({ meetingId: 'meeting-001' });

      expect(mockClient.post).toHaveBeenCalledWith('/api/meetings/summarize', {
        meetingId: 'meeting-001',
      });
      expect(result.summary).toBe('Team discussed Q1 roadmap priorities.');
      expect(result.actionItems).toEqual(['Finalize designs', 'Update backlog']);
      expect(result.duration).toBe(3600);
    });

    it('returns fallback summary on failure', async () => {
      (mockClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 500,
        data: null,
        error: 'AI inference failed',
      });

      const tool = (agent as any).tools.get('quantmeet_summarize');
      const result = await tool.execute({ meetingId: 'meeting-002' });

      expect(result.summary).toContain('Unable to generate summary');
      expect(result.actionItems).toEqual([]);
      expect(result.error).toBe('AI inference failed');
    });
  });
});
