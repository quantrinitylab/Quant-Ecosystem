import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QuantMailAgent } from '../agents/quantmail.agent.js';
import { HttpClient } from '../clients/http-client.js';

describe('QuantMailAgent - real HTTP calls', () => {
  let mockClient: HttpClient;
  let agent: QuantMailAgent;

  beforeEach(() => {
    mockClient = {
      post: vi.fn(),
      get: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      setAuthToken: vi.fn(),
      getBaseUrl: vi.fn().mockReturnValue('http://localhost:3001'),
    } as unknown as HttpClient;

    agent = new QuantMailAgent(mockClient);
  });

  describe('quantmail_send', () => {
    it('calls POST /api/emails with correct parameters', async () => {
      (mockClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        status: 201,
        data: { id: 'msg-abc123', status: 'sent' },
      });

      const tool = (agent as any).tools.get('quantmail_send');
      const result = await tool.execute({
        to: 'user@example.com',
        subject: 'Hello',
        body: 'Test body',
      });

      expect(mockClient.post).toHaveBeenCalledWith('/api/emails', {
        to: 'user@example.com',
        subject: 'Hello',
        body: 'Test body',
        attachments: [],
      });
      expect(result.success).toBe(true);
      expect(result.messageId).toBe('msg-abc123');
      expect(result.status).toBe('sent');
    });

    it('returns error object on failure without crashing', async () => {
      (mockClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 500,
        data: null,
        error: 'Internal server error',
      });

      const tool = (agent as any).tools.get('quantmail_send');
      const result = await tool.execute({
        to: 'user@example.com',
        subject: 'Hello',
        body: 'body',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Internal server error');
    });
  });

  describe('quantmail_read', () => {
    it('calls GET /api/emails with query parameters', async () => {
      (mockClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        status: 200,
        data: { emails: [{ id: '1', subject: 'Test' }] },
      });

      const tool = (agent as any).tools.get('quantmail_read');
      const result = await tool.execute({
        folder: 'inbox',
        limit: 5,
        filter: { search: 'meeting', unread: true },
      });

      expect(mockClient.get).toHaveBeenCalledWith('/api/emails', {
        folder: 'inbox',
        limit: 5,
        search: 'meeting',
        unread: true,
      });
      expect(result.emails).toHaveLength(1);
      expect(result.count).toBe(1);
    });

    it('returns empty list on failure without crashing', async () => {
      (mockClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 503,
        data: null,
        error: 'Service unavailable',
      });

      const tool = (agent as any).tools.get('quantmail_read');
      const result = await tool.execute({ folder: 'inbox' });

      expect(result.emails).toEqual([]);
      expect(result.count).toBe(0);
      expect(result.error).toBe('Service unavailable');
    });
  });
});
