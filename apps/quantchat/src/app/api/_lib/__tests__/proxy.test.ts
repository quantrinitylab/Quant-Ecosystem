import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { proxyToBackend } from '../proxy';

const originalFetch = global.fetch;

describe('QuantChat Proxy Honesty (proxyToBackend)', () => {
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

    it('returns HTTP 503 UPSTREAM_UNAVAILABLE for /conversations — never fabricated data', async () => {
      const req = new NextRequest('http://localhost:3000/api/conversations');
      const res = await proxyToBackend(req, '/conversations');

      expect(res.status).toBe(503);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('UPSTREAM_UNAVAILABLE');
      expect(json.error.statusCode).toBe(503);
      // The old fabricated "General Chat" fallback must never come back.
      expect(json.data).toBeUndefined();
    });

    it('returns HTTP 503 for /conversations/ with trailing slash', async () => {
      const req = new NextRequest('http://localhost:3000/api/conversations/');
      const res = await proxyToBackend(req, '/conversations/');

      expect(res.status).toBe(503);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('UPSTREAM_UNAVAILABLE');
    });

    it('returns HTTP 503 for /conversations with query parameters', async () => {
      const req = new NextRequest('http://localhost:3000/api/conversations?limit=20&page=1');
      const res = await proxyToBackend(req, '/conversations');

      expect(res.status).toBe(503);
      const json = await res.json();
      expect(json.success).toBe(false);
    });

    it('returns HTTP 503 UPSTREAM_UNAVAILABLE for other routes (/channels)', async () => {
      const req = new NextRequest('http://localhost:3000/api/channels');
      const res = await proxyToBackend(req, '/channels');

      expect(res.status).toBe(503);
      const json = await res.json();
      expect(json).toEqual({
        success: false,
        error: {
          code: 'UPSTREAM_UNAVAILABLE',
          message: 'Backend service is unavailable',
          statusCode: 503,
        },
      });
    });

    it('returns HTTP 503 for conversation sub-id routes (/conversations/conv_123)', async () => {
      const req = new NextRequest('http://localhost:3000/api/conversations/conv_123');
      const res = await proxyToBackend(req, '/conversations/conv_123');

      expect(res.status).toBe(503);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.data).toBeUndefined();
    });

    it('returns HTTP 503 for GET /conversations/:id/messages — no invented messages', async () => {
      const req = new NextRequest('http://localhost:3000/api/conversations/conv_123/messages');
      const res = await proxyToBackend(req, '/conversations/conv_123/messages');

      expect(res.status).toBe(503);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.data).toBeUndefined();
    });

    it('returns HTTP 503 for POST /conversations/:id/messages — a send must never fake success', async () => {
      const req = new NextRequest('http://localhost:3000/api/conversations/conv_123/messages', {
        method: 'POST',
        body: JSON.stringify({ content: 'Hello', type: 'text' }),
      });
      const res = await proxyToBackend(req, '/conversations/conv_123/messages');

      expect(res.status).toBe(503);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.data).toBeUndefined();
    });
  });

  describe('Timeout Handling', () => {
    const abortingFetch = () =>
      vi.fn().mockImplementation(
        () =>
          new Promise((_, reject) => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          }),
      );

    it('returns 503 when fetch aborts due to timeout for /conversations', async () => {
      global.fetch = abortingFetch();

      const req = new NextRequest('http://localhost:3000/api/conversations');
      const res = await proxyToBackend(req, '/conversations');

      expect(res.status).toBe(503);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('UPSTREAM_UNAVAILABLE');
    });

    it('returns 503 when fetch aborts due to timeout for other routes', async () => {
      global.fetch = abortingFetch();

      const req = new NextRequest('http://localhost:3000/api/spotlight');
      const res = await proxyToBackend(req, '/spotlight');

      expect(res.status).toBe(503);
      const json = await res.json();
      expect(json.error.code).toBe('UPSTREAM_UNAVAILABLE');
    });
  });

  describe('Persistent 401 (expired session, exchange cannot recover)', () => {
    it('returns the backend real 401 — never a fabricated conversation list', async () => {
      const backend401 = {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Token expired', statusCode: 401 },
      };
      global.fetch = vi
        .fn()
        // 1st call: the data request itself 401s.
        .mockResolvedValueOnce(
          new Response(JSON.stringify(backend401), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
        // 2nd call: the transparent SSO exchange also fails (token is a
        // native QuantChat token, not a QuantMail SSO token).
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ success: false, error: { code: 'INVALID_SSO_TOKEN' } }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          }),
        );

      const req = new NextRequest('http://localhost:3000/api/conversations', {
        headers: { Authorization: 'Bearer expired-native-token' },
      });
      const res = await proxyToBackend(req, '/conversations');

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('UNAUTHORIZED');
      expect(json.data).toBeUndefined();
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
