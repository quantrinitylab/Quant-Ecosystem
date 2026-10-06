// ============================================================================
// QuantWave — completeSSO (SSO callback exchange) tests.
// The QuantMail token arriving in the /login URL must be exchanged server-side
// for a QuantWave session before anything is stored.
// ============================================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api-client', () => ({
  quantSyncAPI: {
    loginWithSSO: vi.fn(),
    setToken: vi.fn(),
    clearToken: vi.fn(),
  },
}));

// eslint-disable-next-line import/first
import { quantSyncAPI } from '../api-client';
// eslint-disable-next-line import/first
import { completeSSO, getAccessToken, clearAccessToken } from '../auth-session';

const loginWithSSO = vi.mocked(quantSyncAPI.loginWithSSO);

beforeEach(() => {
  vi.clearAllMocks();
  clearAccessToken();
});

describe('completeSSO', () => {
  it('exchanges the QuantMail token and stores the session credential', async () => {
    loginWithSSO.mockResolvedValue({
      success: true,
      data: {
        accessToken: 'qw-session-token',
        user: { id: 'u1', email: 'a@b.c', username: 'a', role: 'user' },
      },
    });

    const result = await completeSSO('quantmail-jwt');

    expect(loginWithSSO).toHaveBeenCalledTimes(1);
    expect(loginWithSSO).toHaveBeenCalledWith('quantmail-jwt');
    expect(result.success).toBe(true);
    expect(result.data?.accessToken).toBe('qw-session-token');
    expect(getAccessToken()).toBe('qw-session-token');
  });

  it('rejects a blank token without calling the exchange endpoint', async () => {
    const result = await completeSSO('   ');

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('SSO_MISSING_TOKEN');
    expect(loginWithSSO).not.toHaveBeenCalled();
    expect(getAccessToken()).toBeNull();
  });

  it('returns the backend error code when the exchange payload fails', async () => {
    loginWithSSO.mockResolvedValue({
      success: false,
      error: { code: 'SSO_INVALID', message: 'rejected', statusCode: 401 },
    });

    const result = await completeSSO('bad-jwt');

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('SSO_INVALID');
    expect(getAccessToken()).toBeNull();
  });

  it('maps a 401 from the exchange to SSO_REJECTED', async () => {
    const authRequired = Object.assign(new Error('Please sign in to continue.'), {
      name: 'AuthRequiredError',
    });
    loginWithSSO.mockRejectedValue(authRequired);

    const result = await completeSSO('expired-jwt');

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('SSO_REJECTED');
    expect(getAccessToken()).toBeNull();
  });

  it('maps a network failure to SSO_EXCHANGE_FAILED', async () => {
    loginWithSSO.mockRejectedValue(new Error('fetch failed'));

    const result = await completeSSO('quantmail-jwt');

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('SSO_EXCHANGE_FAILED');
    expect(getAccessToken()).toBeNull();
  });
});
