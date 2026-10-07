import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { proxyToBackend } from '../proxy';

const originalFetch = global.fetch;

describe('QuantChat Proxy Resiliency (proxyToBackend)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('Offline Upstream Backend (ECONNREFUSED / Network Failure)', () => {
    beforeEach(() => {
      global.fetch = vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:3002'));
    });

    it('returns HTTP 200 with fallback conversation array for /conversations', async () => {
      const req = new NextRequest('http://localhost:3000/api/conversations');
      const res = await proxyToBackend(req, '/conversations');

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.data)).toBe(true);
      expect(json.data).toHaveLength(1);

      const conv = json.data[0];
      expect(conv.id).toBe('conv_general');
      expect(conv.name).toBe('General Chat');
      expect(conv.type).toBe('GROUP');
      expect(conv.lastMessage).toBe('Welcome to QuantChat sovereign messaging!');
      expect(typeof conv.timestamp).toBe('string');
      expect(conv.unreadCount).toBe(0);
      expect(conv.avatarInitial).toBe('Q');
      expect(conv.presence).toBe('online');
      expect(conv.isPinned).toBe(true);
      expect(conv.isArchived).toBe(false);
      expect(conv.participants).toEqual([]);
    });

    it('returns HTTP 200 with fallback conversation array for /conversations/ with trailing slash', async () => {
      const req = new NextRequest('http://localhost:3000/api/conversations/');
      const res = await proxyToBackend(req, '/conversations/');

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data[0].id).toBe('conv_general');
    });

    it('returns HTTP 200 with fallback conversation array for /conversations with query parameters', async () => {
      const req = new NextRequest('http://localhost:3000/api/conversations?limit=20&page=1');
      const res = await proxyToBackend(req, '/conversations');

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data[0].id).toBe('conv_general');
    });

    it('returns HTTP 503 UPSTREAM_OFFLINE for other routes (/channels)', async () => {
      const req = new NextRequest('http://localhost:3000/api/channels');
      const res = await proxyToBackend(req, '/channels');

      expect(res.status).toBe(503);
      const json = await res.json();
      expect(json).toEqual({
        success: false,
        error: {
          code: 'UPSTREAM_OFFLINE',
          message: 'Backend service is offline in development mode',
          statusCode: 503,
        },
      });
    });

    it('returns HTTP 200 with fallback conversation for conversation sub-id routes (/conversations/conv_123)', async () => {
      const req = new NextRequest('http://localhost:3000/api/conversations/conv_123');
      const res = await proxyToBackend(req, '/conversations/conv_123');

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.id).toBe('conv_123');
      expect(json.data.name).toBe('General Chat');
      expect(json.data.type).toBe('GROUP');
    });

    it('returns HTTP 200 with fallback messages for GET /conversations/:id/messages', async () => {
      const req = new NextRequest('http://localhost:3000/api/conversations/conv_123/messages');
      const res = await proxyToBackend(req, '/conversations/conv_123/messages');

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.data)).toBe(true);
      expect(json.data).toHaveLength(4);
      expect(json.data[0].id).toBe('msg_welcome');
      expect(json.data[1].id).toBe('msg_voice');
      expect(json.data[1].type).toBe('voice');
      expect(json.data[1].voiceDurationMs).toBe(4200);
      expect(json.data[2].status).toBe('delivered');
      expect(json.data[3].status).toBe('read');
    });

    it('returns HTTP 200 with created message for POST /conversations/:id/messages', async () => {
      const req = new NextRequest('http://localhost:3000/api/conversations/conv_123/messages', {
        method: 'POST',
        body: JSON.stringify({ content: 'Hello', type: 'text' }),
      });
      const res = await proxyToBackend(req, '/conversations/conv_123/messages');

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.id).toMatch(/^msg_\d+$/);
      expect(json.data.conversationId).toBe('conv_123');
      expect(json.data.content).toBe('Hello');
      expect(json.data.type).toBe('text');
      expect(json.data.senderId).toBe('user_me');
    });
  });

  describe('Timeout Handling', () => {
    it('returns fallback 200 when fetch aborts due to timeout for /conversations', async () => {
      global.fetch = vi.fn().mockImplementation(
        () =>
          new Promise((_, reject) => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          }),
      );

      const req = new NextRequest('http://localhost:3000/api/conversations');
      const res = await proxyToBackend(req, '/conversations');

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data[0].id).toBe('conv_general');
    });

    it('returns 503 when fetch aborts due to timeout for other routes', async () => {
      global.fetch = vi.fn().mockImplementation(
        () =>
          new Promise((_, reject) => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          }),
      );

      const req = new NextRequest('http://localhost:3000/api/spotlight');
      const res = await proxyToBackend(req, '/spotlight');

      expect(res.status).toBe(503);
      const json = await res.json();
      expect(json.error.code).toBe('UPSTREAM_OFFLINE');
    });
  });

  describe('Online Backend (Happy Path & Bad Responses)', () => {
    it('forwards successful backend JSON response', async () => {
      const mockPayload = {
        success: true,
        data: [{ id: 'conv_live', name: 'Live Team Chat' }],
      };
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(mockPayload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const req = new NextRequest('http://localhost:3000/api/conversations');
      const res = await proxyToBackend(req, '/conversations');

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual(mockPayload);
    });

    it('returns 502 INVALID_RESPONSE if backend returns non-JSON', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response('<html>Bad Gateway</html>', {
          status: 502,
          headers: { 'Content-Type': 'text/html' },
        }),
      );

      const req = new NextRequest('http://localhost:3000/api/conversations');
      const res = await proxyToBackend(req, '/conversations');

      expect(res.status).toBe(502);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('INVALID_RESPONSE');
    });
  });
});
