import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QuantChatAgent } from '../agents/quantchat.agent.js';
import { HttpClient } from '../clients/http-client.js';

describe('QuantChatAgent - real HTTP calls', () => {
  let mockClient: HttpClient;
  let agent: QuantChatAgent;

  beforeEach(() => {
    mockClient = {
      post: vi.fn(),
      get: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      setAuthToken: vi.fn(),
      getBaseUrl: vi.fn().mockReturnValue('http://localhost:3002'),
    } as unknown as HttpClient;

    agent = new QuantChatAgent(mockClient);
  });

  describe('quantchat_send', () => {
    it('calls POST /api/messages with correct parameters', async () => {
      (mockClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        status: 201,
        data: { id: 'msg-chat-001', createdAt: '2024-01-01T00:00:00Z' },
      });

      const tool = (agent as any).tools.get('quantchat_send');
      const result = await tool.execute({
        conversationId: 'conv-123',
        content: 'Hello team!',
        type: 'text',
      });

      expect(mockClient.post).toHaveBeenCalledWith('/api/messages', {
        conversationId: 'conv-123',
        content: 'Hello team!',
        type: 'text',
      });
      expect(result.success).toBe(true);
      expect(result.messageId).toBe('msg-chat-001');
      expect(result.timestamp).toBe('2024-01-01T00:00:00Z');
    });

    it('returns error object on failure without crashing', async () => {
      (mockClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 400,
        data: null,
        error: 'Invalid conversation',
      });

      const tool = (agent as any).tools.get('quantchat_send');
      const result = await tool.execute({
        conversationId: 'invalid',
        content: 'test',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid conversation');
    });
  });

  describe('quantchat_smart_reply', () => {
    it('calls POST /api/ai/smart-replies and returns suggestions', async () => {
      (mockClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        status: 200,
        data: { suggestions: ['Sure!', 'Will do.', 'Got it.'] },
      });

      const tool = (agent as any).tools.get('quantchat_smart_reply');
      const result = await tool.execute({
        conversationId: 'conv-123',
        lastMessage: 'Can you review this PR?',
      });

      expect(mockClient.post).toHaveBeenCalledWith('/api/ai/smart-replies', {
        conversationId: 'conv-123',
        lastMessage: 'Can you review this PR?',
      });
      expect(result.suggestions).toEqual(['Sure!', 'Will do.', 'Got it.']);
    });

    it('returns fallback suggestions on failure', async () => {
      (mockClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 503,
        data: null,
        error: 'AI service unavailable',
      });

      const tool = (agent as any).tools.get('quantchat_smart_reply');
      const result = await tool.execute({
        conversationId: 'conv-123',
        lastMessage: 'Hello?',
      });

      expect(result.suggestions).toHaveLength(3);
      expect(result.suggestions[0]).toBe('Sounds good!');
    });
  });
});
