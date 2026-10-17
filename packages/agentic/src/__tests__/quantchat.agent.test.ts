import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QuantChatAgent } from '../agents/quantchat.agent.js';
import { HttpClient } from '../clients/http-client.js';

// QC-F-465: this suite pins the REAL QuantChat owner contract (mocked
// transport — no real HTTP happens here, and the suite name says so).
// Owner contract, firsthand from origin/main:
// - Send: POST /conversations/:id/messages, body { content, type?, ... }
//   (apps/quantchat/backend/app.ts '/conversations' prefix +
//   routes/messages.ts), success 201 { success: true, data: message }.
// - Smart replies: POST /ai/smart-replies, body
//   { conversationId, recentMessages: [{ sender, content }] }
//   (routes/ai.ts + services/ai-smart-replies.service SmartReplyInputSchema),
//   success 200 { success: true, data: { suggestions: string[] } }.
// HttpClient returns the whole envelope as `data`; the payload is data.data.
const OWNER_CENSUS = [
  {
    tool: 'quantchat_send',
    method: 'POST',
    pathTemplate: '/conversations/:id/messages',
    bodyKeys: ['content', 'type'],
  },
  {
    tool: 'quantchat_smart_reply',
    method: 'POST',
    pathTemplate: '/ai/smart-replies',
    bodyKeys: ['conversationId', 'recentMessages'],
  },
] as const;

const FABRICATED_SUGGESTIONS = [
  'Sounds good!',
  'Let me check and get back to you.',
  'Thanks for letting me know.',
];

describe('QuantChatAgent — owner-contract (mocked transport)', () => {
  let mockClient: HttpClient;
  let postMock: ReturnType<typeof vi.fn>;
  let agent: QuantChatAgent;

  function makeAgent(hasToken: boolean) {
    postMock = vi.fn();
    mockClient = {
      post: postMock,
      get: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      setAuthToken: vi.fn(),
      hasAuthToken: vi.fn().mockReturnValue(hasToken),
      getBaseUrl: vi.fn().mockReturnValue('http://localhost:3002'),
    } as unknown as HttpClient;
    agent = new QuantChatAgent(mockClient);
    return agent;
  }

  beforeEach(() => {
    makeAgent(true);
  });

  function tool(name: string) {
    return (agent as any).tools.get(name);
  }

  it('declares only tool-backed capabilities (6 → 2)', () => {
    expect((agent as any).config.capabilities).toEqual(['send_message', 'smart_replies']);
  });

  it('setAuthToken delegates to its HttpClient', () => {
    agent.setAuthToken('user-jwt');
    expect(mockClient.setAuthToken).toHaveBeenCalledWith('user-jwt');
  });

  describe('quantchat_send', () => {
    it('P1: posts to the owner path with conversationId as path param and unwraps the envelope', async () => {
      postMock.mockResolvedValue({
        ok: true,
        status: 201,
        data: {
          success: true,
          data: { id: 'msg-chat-001', createdAt: '2024-01-01T00:00:00Z' },
        },
      });

      const result = await tool('quantchat_send').execute({
        conversationId: 'conv-123',
        content: 'Hello team!',
        type: 'text',
      });

      expect(postMock).toHaveBeenCalledWith('/conversations/conv-123/messages', {
        content: 'Hello team!',
        type: 'text',
      });
      expect(result).toEqual({
        success: true,
        messageId: 'msg-chat-001',
        timestamp: '2024-01-01T00:00:00Z',
      });
    });

    it('URL-encodes the conversationId path param', async () => {
      postMock.mockResolvedValue({
        ok: true,
        status: 201,
        data: { success: true, data: { id: 'm1', createdAt: '2024-01-01T00:00:00Z' } },
      });

      await tool('quantchat_send').execute({ conversationId: 'conv/1?x', content: 'hi' });

      expect(postMock).toHaveBeenCalledWith(
        '/conversations/conv%2F1%3Fx/messages',
        expect.anything(),
      );
    });

    it('returns error object with status on failure without crashing', async () => {
      postMock.mockResolvedValue({
        ok: false,
        status: 400,
        data: null,
        error: 'Invalid conversation',
      });

      const result = await tool('quantchat_send').execute({
        conversationId: 'invalid',
        content: 'test',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid conversation');
      expect(result.status).toBe(400);
    });

    it('NC3: a 404 fails honestly and never claims a messageId; the wrong path is never called', async () => {
      postMock.mockResolvedValue({
        ok: false,
        status: 404,
        data: null,
        error: 'Not found',
      });

      const result = await tool('quantchat_send').execute({
        conversationId: 'conv-123',
        content: 'test',
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe(404);
      expect(result.messageId).toBeUndefined();
      expect(postMock).not.toHaveBeenCalledWith('/api/messages', expect.anything());
    });

    it('NC5: missing conversationId/content (planner {goal}-only shape) fails without any HTTP call', async () => {
      const plannerShaped = await tool('quantchat_send').execute({ goal: 'message the team' });
      expect(plannerShaped).toEqual({ success: false, error: 'MISSING_PARAMETERS' });

      const noContent = await tool('quantchat_send').execute({ conversationId: 'conv-123' });
      expect(noContent).toEqual({ success: false, error: 'MISSING_PARAMETERS' });

      expect(postMock).not.toHaveBeenCalled();
    });

    it('rejects a type outside the owner enum without any HTTP call', async () => {
      const result = await tool('quantchat_send').execute({
        conversationId: 'conv-123',
        content: 'hi',
        type: 'hologram',
      });

      expect(result.success).toBe(false);
      expect(postMock).not.toHaveBeenCalled();
    });

    it('NC6: an envelope without a real message id is MALFORMED_RESPONSE, never success', async () => {
      postMock.mockResolvedValue({
        ok: true,
        status: 201,
        data: { success: true, data: {} },
      });

      const result = await tool('quantchat_send').execute({
        conversationId: 'conv-123',
        content: 'hi',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('MALFORMED_RESPONSE');
      expect(result.messageId).toBeUndefined();
    });
  });

  describe('quantchat_smart_reply', () => {
    it('P2: posts recentMessages to the owner path and unwraps the envelope', async () => {
      postMock.mockResolvedValue({
        ok: true,
        status: 200,
        data: { success: true, data: { suggestions: ['Sure!', 'Will do.'] } },
      });

      const result = await tool('quantchat_smart_reply').execute({
        conversationId: 'conv-123',
        recentMessages: [{ sender: 'them', content: 'Can you review this PR?' }],
      });

      expect(postMock).toHaveBeenCalledWith('/ai/smart-replies', {
        conversationId: 'conv-123',
        recentMessages: [{ sender: 'them', content: 'Can you review this PR?' }],
      });
      expect(result).toEqual({ success: true, suggestions: ['Sure!', 'Will do.'] });
    });

    it('NC2: failure is honest — success:false, real error, empty suggestions, no fabricated strings', async () => {
      postMock.mockResolvedValue({
        ok: false,
        status: 503,
        data: null,
        error: 'AI service unavailable',
      });

      const result = await tool('quantchat_smart_reply').execute({
        conversationId: 'conv-123',
        recentMessages: [{ sender: 'them', content: 'Hello?' }],
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('AI service unavailable');
      expect(result.status).toBe(503);
      expect(result.suggestions).toEqual([]);
      for (const fake of FABRICATED_SUGGESTIONS) {
        expect(JSON.stringify(result)).not.toContain(fake);
      }
    });

    it('NC5: missing/empty recentMessages (or legacy lastMessage-only) fails without any HTTP call', async () => {
      const legacy = await tool('quantchat_smart_reply').execute({
        conversationId: 'conv-123',
        lastMessage: 'Hello?',
      });
      expect(legacy).toEqual({
        success: false,
        error: 'MISSING_PARAMETERS',
        suggestions: [],
      });

      const empty = await tool('quantchat_smart_reply').execute({
        conversationId: 'conv-123',
        recentMessages: [],
      });
      expect(empty.success).toBe(false);
      expect(empty.error).toBe('MISSING_PARAMETERS');

      expect(postMock).not.toHaveBeenCalled();
    });

    it('a malformed success envelope is MALFORMED_RESPONSE, never the raw envelope as suggestions', async () => {
      postMock.mockResolvedValue({
        ok: true,
        status: 200,
        data: { success: true, data: { suggestions: 'not-an-array' } },
      });

      const result = await tool('quantchat_smart_reply').execute({
        conversationId: 'conv-123',
        recentMessages: [{ sender: 'them', content: 'hi' }],
      });

      expect(result).toEqual({
        success: false,
        error: 'MALFORMED_RESPONSE',
        suggestions: [],
      });
    });
  });

  describe('NC1: owner-route census contract', () => {
    it('every tool call matches the census (method, path template, body keys) and no legacy shape survives', async () => {
      postMock.mockImplementation(async (path: string) => {
        if (path.startsWith('/conversations/')) {
          return {
            ok: true,
            status: 201,
            data: { success: true, data: { id: 'm1', createdAt: '2024-01-01T00:00:00Z' } },
          };
        }
        return {
          ok: true,
          status: 200,
          data: { success: true, data: { suggestions: ['ok'] } },
        };
      });

      await tool('quantchat_send').execute({
        conversationId: 'conv-123',
        content: 'Hello team!',
        type: 'text',
      });
      await tool('quantchat_smart_reply').execute({
        conversationId: 'conv-123',
        recentMessages: [{ sender: 'them', content: 'Can you review this PR?' }],
      });

      expect(postMock).toHaveBeenCalledTimes(2);
      const calls = postMock.mock.calls as [string, Record<string, unknown>][];

      for (const census of OWNER_CENSUS) {
        const call = calls.find(([path]) =>
          census.pathTemplate === '/ai/smart-replies'
            ? path === census.pathTemplate
            : path === census.pathTemplate.replace(':id', 'conv-123'),
        );
        expect(call, `census entry for ${census.tool}`).toBeDefined();
        const [, body] = call!;
        for (const key of census.bodyKeys) {
          expect(body).toHaveProperty(key);
        }
      }

      const [sendPath, sendBody] = calls[0]!;
      expect(sendPath).toBe('/conversations/conv-123/messages');
      expect(sendBody).not.toHaveProperty('conversationId');
      const [, smartBody] = calls[1]!;
      expect(smartBody).not.toHaveProperty('lastMessage');
      expect(smartBody).toHaveProperty('recentMessages');
      expect(postMock).not.toHaveBeenCalledWith('/api/messages', expect.anything());
      expect(postMock).not.toHaveBeenCalledWith('/api/ai/smart-replies', expect.anything());
    });
  });

  describe('NC4: no-token honest failure', () => {
    it('both tools return AUTH_REQUIRED without any HTTP call when the client has no token', async () => {
      makeAgent(false);

      const send = await tool('quantchat_send').execute({
        conversationId: 'conv-123',
        content: 'hi',
      });
      expect(send).toEqual({ success: false, error: 'AUTH_REQUIRED' });

      const smart = await tool('quantchat_smart_reply').execute({
        conversationId: 'conv-123',
        recentMessages: [{ sender: 'them', content: 'hi' }],
      });
      expect(smart).toEqual({ success: false, error: 'AUTH_REQUIRED', suggestions: [] });

      expect(postMock).not.toHaveBeenCalled();
    });
  });
});
