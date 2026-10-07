// ============================================================================
// QuantWave — authSession.loginWithSSO (SSO callback exchange) tests.
// The QuantMail token arriving in the /login URL must be exchanged server-side
// (POST /api/auth/sso/login proxy) for a QuantWave session before anything is
// stored. The exchange deliberately uses a plain fetch — NOT the api-client —
// so a 401 (invalid SSO token) is reported as an SSO failure instead of
// triggering the api-client's session-death path.
// ============================================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// eslint-disable-next-line import/first
import { authSession, getAccessToken, clearAccessToken } from '../auth-session';

function mockFetchOnce(json: unknown, init: { ok?: boolean; status?: number } = {}) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: () => Promise.resolve(json),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.clearAllMocks();
  clearAccessToken();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('authSession.loginWithSSO', () => {
  it('POSTs the QuantMail token to the SSO proxy and stores the session credential', async () => {
    const fetchMock = mockFetchOnce({
      success: true,
      data: {
        accessToken: 'qw-session-token',
        user: { id: 'u1', email: 'a@b.c', username: 'a', role: 'user' },
      },
    });

    const result = await authSession.loginWithSSO('quantmail-jwt');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/auth/sso/login');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ quantMailToken: 'quantmail-jwt' });
    expect(result.success).toBe(true);
    expect(result.data?.accessToken).toBe('qw-session-token');
    expect(getAccessToken()).toBe('qw-session-token');
  });

  it('returns the proxy error payload when the token is rejected (401)', async () => {
    const fetchMock = mockFetchOnce(
      { success: false, error: { code: 'SSO_INVALID', message: 'rejected', statusCode: 401 } },
      { ok: false, status: 401 },
    );

    const result = await authSession.loginWithSSO('bad-jwt');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('SSO_INVALID');
    expect(getAccessToken()).toBeNull();
  });

  it('maps an unreadable response body to INVALID_RESPONSE', async () => {
    mockFetchOnce(null);

    const result = await authSession.loginWithSSO('quantmail-jwt');

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('INVALID_RESPONSE');
    expect(getAccessToken()).toBeNull();
  });

  it('maps a network failure to NETWORK', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('fetch failed')),
    );

    const result = await authSession.loginWithSSO('quantmail-jwt');

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('NETWORK');
    expect(getAccessToken()).toBeNull();
  });
});
