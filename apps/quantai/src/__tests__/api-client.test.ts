// ============================================================================
// QuantAIApiClient tests (F-162: trimmed dead-method surface + fail-closed
// HTTP error mapping; F-161: listConversations also removed as dead, so the
// request() behavior is exercised directly via a typed accessor).
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@quant/api-client', () => ({
  apiFetchRaw: vi.fn(),
}));
vi.mock('../lib/auth', () => ({
  getAuthToken: vi.fn(),
}));

import { apiFetchRaw } from '@quant/api-client';
import { getAuthToken } from '../lib/auth';
import { apiClient } from '../services/api-client';

const mockFetchRaw = vi.mocked(apiFetchRaw);
const mockGetAuthToken = vi.mocked(getAuthToken);

// F-161 removed listConversations (dead hook), leaving request() as the only
// live method. Exercise it directly — it carries the token wiring and the
// fail-closed HTTP error mapping under test here.
function callRequest(method = 'GET', path = '/test', body?: unknown) {
  const client = apiClient as unknown as {
    request: (m: string, p: string, b?: unknown) => Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>;
  };
  return client.request(method, path, body);
}

function jsonResponse(
  body: unknown,
  init: { status?: number; statusText?: string } = {},
): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    statusText: init.statusText ?? 'OK',
    headers: { 'Content-Type': 'application/json' },
  });
}

type FetchInit = { method?: string; headers?: Record<string, string>; body?: string };
function lastCallInit(): FetchInit {
  const calls = mockFetchRaw.mock.calls;
  return (calls[calls.length - 1] as [string, FetchInit])[1];
}

describe('QuantAIApiClient (F-162 trimmed surface)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiClient.setToken('');
    mockGetAuthToken.mockReturnValue(null);
  });

  describe('token wiring', () => {
    it('sends the explicitly-set bearer token', async () => {
      apiClient.setToken('tok-123');
      mockFetchRaw.mockResolvedValueOnce(jsonResponse({ success: true, data: [] }));

      const res = await callRequest();

      expect(res.success).toBe(true);
      expect(mockFetchRaw).toHaveBeenCalledWith(
        '/api/test',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({ Authorization: 'Bearer tok-123' }),
        }),
      );
    });

    it('falls back to getAuthToken() when no explicit token is set', async () => {
      mockGetAuthToken.mockReturnValue('stored-token');
      mockFetchRaw.mockResolvedValueOnce(jsonResponse({ success: true, data: [] }));

      await callRequest();

      expect(lastCallInit().headers?.Authorization).toBe('Bearer stored-token');
    });

    it('omits the Authorization header when no token is available at all', async () => {
      mockFetchRaw.mockResolvedValueOnce(jsonResponse({ success: true, data: [] }));

      await callRequest();

      expect(lastCallInit().headers?.Authorization).toBeUndefined();
    });
  });

  describe('request (the only live method)', () => {
    it('returns the parsed envelope on 2xx', async () => {
      const data = [{ id: 'c1', title: 'Hello' }];
      mockFetchRaw.mockResolvedValueOnce(jsonResponse({ success: true, data }));

      const res = await callRequest();

      expect(res).toEqual({ success: true, data });
    });

    it('propagates a server-returned failure envelope unchanged on 2xx', async () => {
      mockFetchRaw.mockResolvedValueOnce(
        jsonResponse({ success: false, error: { code: 'AUTH', message: 'expired' } }),
      );

      const res = await callRequest();

      expect(res.success).toBe(false);
      expect(res.error?.message).toBe('expired');
    });
  });

  describe('fail-closed HTTP error mapping (F-162 improvement)', () => {
    it('maps a non-2xx with a JSON error body to { success:false, error }', async () => {
      mockFetchRaw.mockResolvedValueOnce(
        jsonResponse(
          { success: false, error: { code: 'UPSTREAM', message: 'backend exploded' } },
          { status: 500, statusText: 'Internal Server Error' },
        ),
      );

      const res = await callRequest();

      expect(res.success).toBe(false);
      expect(res.error?.code).toBe('HTTP_500');
      expect(res.error?.message).toBe('backend exploded');
    });

    it('maps a non-2xx with a non-JSON (HTML) body instead of throwing', async () => {
      mockFetchRaw.mockResolvedValueOnce(
        new Response('<html>502 Bad Gateway</html>', {
          status: 502,
          statusText: 'Bad Gateway',
          headers: { 'Content-Type': 'text/html' },
        }),
      );

      const res = await callRequest();

      expect(res).toEqual({
        success: false,
        error: { code: 'HTTP_502', message: 'Bad Gateway' },
      });
    });

    it('maps a non-2xx with an empty body using the status text', async () => {
      mockFetchRaw.mockResolvedValueOnce(
        new Response(null, { status: 503, statusText: 'Service Unavailable' }),
      );

      const res = await callRequest();

      expect(res.error?.code).toBe('HTTP_503');
      expect(res.error?.message).toBe('Service Unavailable');
    });

    it('propagates network rejections from apiFetchRaw (native fetch semantics)', async () => {
      mockFetchRaw.mockRejectedValueOnce(new TypeError('fetch failed'));

      await expect(callRequest()).rejects.toThrow('fetch failed');
    });
  });

  describe('dead-code regression guard', () => {
    it('exposes only the live method surface', () => {
      const proto = Object.getPrototypeOf(apiClient) as Record<string, unknown>;
      const methods = Object.getOwnPropertyNames(proto)
        .filter((n) => n !== 'constructor')
        .sort();
      // If a new route method is added here it must have a verified caller —
      // new routes belong at the call site via apiFetchRaw, not on this class.
      expect(methods).toEqual(['request', 'setToken']);
    });
  });
});
