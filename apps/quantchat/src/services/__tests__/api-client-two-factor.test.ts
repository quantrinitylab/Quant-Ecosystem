// ============================================================================
// QC-F-141 — api-client 2FA contract (web client, real module, fetch mocked)
// ============================================================================
//
// Pins the §1e trap and its fix at the client layer:
//   - loginWithPassword on a challenge-shaped answer: NO setTokens call
//     (no half-logged-in state), union return type carries the challenge.
//   - verifyTwoFactorLogin posts { challenge, code } to /auth/2fa/verify and
//     persists the session on success (the verifyOTP pattern).
//   - isTwoFactorChallenge guards on shape, never on string-matching.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchMock = vi.hoisted(() => vi.fn());

vi.mock('@quant/api-client', () => ({
  apiFetchRaw: fetchMock,
}));

import { QuantChatApiClient, isTwoFactorChallenge } from '../api-client';

function jsonResponse(status: number, payload: unknown) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name: string) => (name === 'content-type' ? 'application/json' : null) },
    json: async () => payload,
  };
}

describe('QC-F-141 api-client 2FA contract', () => {
  let client: QuantChatApiClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new QuantChatApiClient('/api');
  });

  it('isTwoFactorChallenge guards on shape, not strings', () => {
    expect(isTwoFactorChallenge({ twoFactorRequired: true, challenge: 'abc', expiresIn: 300 })).toBe(
      true,
    );
    expect(isTwoFactorChallenge({ accessToken: 'a', refreshToken: 'r' })).toBe(false);
    expect(isTwoFactorChallenge({ twoFactorRequired: true })).toBe(false);
    expect(isTwoFactorChallenge(null)).toBe(false);
    expect(isTwoFactorChallenge('twoFactorRequired')).toBe(false);
  });

  it('loginWithPassword never persists a challenge-shaped answer', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        success: true,
        data: { twoFactorRequired: true, challenge: 'ch_1', expiresIn: 300 },
      }),
    );
    const setTokensSpy = vi.spyOn(client, 'setTokens');

    const res = await client.loginWithPassword({ identifier: 'u', password: 'p' });

    expect(res.success).toBe(true);
    expect(isTwoFactorChallenge(res.data)).toBe(true);
    if (isTwoFactorChallenge(res.data)) {
      expect(res.data.challenge).toBe('ch_1');
      expect(res.data.expiresIn).toBe(300);
    }
    // The §1e trap: a challenge must never become tokens.
    expect(setTokensSpy).not.toHaveBeenCalled();
  });

  it('loginWithPassword still persists a session-shaped answer', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        success: true,
        data: {
          accessToken: 'a1',
          refreshToken: 'r1',
          expiresIn: 3600,
          tokenType: 'Bearer',
          user: { id: 'u1', email: 'u@x.com', username: 'u1' },
        },
      }),
    );
    const setTokensSpy = vi.spyOn(client, 'setTokens');

    const res = await client.loginWithPassword({ identifier: 'u', password: 'p' });

    expect(isTwoFactorChallenge(res.data)).toBe(false);
    expect(setTokensSpy).toHaveBeenCalledWith('a1', 'r1');
  });

  it('verifyTwoFactorLogin posts { challenge, code } and persists on success', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        success: true,
        data: {
          accessToken: 'a2',
          refreshToken: 'r2',
          expiresIn: 3600,
          tokenType: 'Bearer',
          user: { id: 'u1', email: 'u@x.com', username: 'u1' },
        },
      }),
    );
    const setTokensSpy = vi.spyOn(client, 'setTokens');

    const res = await client.verifyTwoFactorLogin({ challenge: 'ch_1', code: '123456' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, { body?: string }];
    expect(url).toBe('/api/auth/2fa/verify');
    expect(JSON.parse(init.body ?? '{}')).toEqual({ challenge: 'ch_1', code: '123456' });
    expect(res.success).toBe(true);
    expect(setTokensSpy).toHaveBeenCalledWith('a2', 'r2');
  });

  it('verifyTwoFactorLogin failure persists nothing', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(401, {
        success: false,
        error: { code: 'INVALID_CODE', message: 'Invalid code.', statusCode: 401 },
      }),
    );
    const setTokensSpy = vi.spyOn(client, 'setTokens');

    const res = await client.verifyTwoFactorLogin({ challenge: 'ch_1', code: '000000' });

    expect(res.success).toBe(false);
    expect(res.error?.code).toBe('INVALID_CODE');
    expect(setTokensSpy).not.toHaveBeenCalled();
  });
});
