// ============================================================================
// QuantCooks — POST /api/auth/sso/exchange route tests (P0-1).
//
// The SSO handoff from QuantMail redirects back with a QuantMail-issued JWT
// (?token=...). The route must verify that token back-channel against the
// identity service's /oauth/userinfo — never trust it on its claims alone —
// and fail closed on bad input or a rejected token. It never echoes user PII.
// ============================================================================
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

function postRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/auth/sso/exchange', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function identityOk() {
  return {
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        success: true,
        data: { id: 'u1', email: 'user@quantmail.in', username: 'user' },
      }),
  };
}

beforeEach(() => {
  mockFetch.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /api/auth/sso/exchange', () => {
  it('rejects a missing body with 400 BAD_REQUEST', async () => {
    const res = await POST(postRequest(null));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      success: false,
      error: { code: 'BAD_REQUEST' },
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('rejects a non-string ssoToken with 400', async () => {
    const res = await POST(postRequest({ ssoToken: 12345 }));
    expect(res.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('rejects a too-short ssoToken with 400', async () => {
    const res = await POST(postRequest({ ssoToken: 'short' }));
    expect(res.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('verifies the token back-channel against the identity /oauth/userinfo', async () => {
    mockFetch.mockResolvedValueOnce(identityOk());
    const res = await POST(postRequest({ ssoToken: 'eyJhbGciOiJIUzI1NiJ9.valid.token' }));

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/oauth/userinfo');
    expect((init.headers as Record<string, string>)['Authorization']).toBe(
      'Bearer eyJhbGciOiJIUzI1NiJ9.valid.token',
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      success: true,
      data: { accessToken: 'eyJhbGciOiJIUzI1NiJ9.valid.token' },
    });
  });

  it('never echoes user PII (email) back to the caller', async () => {
    mockFetch.mockResolvedValueOnce(identityOk());
    const res = await POST(postRequest({ ssoToken: 'eyJhbGciOiJIUzI1NiJ9.valid.token' }));
    const raw = await res.text();
    expect(raw).not.toContain('user@quantmail.in');
  });

  it('fails closed with 401 INVALID_SSO_TOKEN when the identity service rejects the token', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401, json: () => Promise.resolve({}) });
    const res = await POST(postRequest({ ssoToken: 'eyJhbGciOiJIUzI1NiJ9.forged.token' }));
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({
      success: false,
      error: { code: 'INVALID_SSO_TOKEN' },
    });
  });

  it('fails closed with 401 when identity answers 200 but the profile has no email', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: true, data: { id: 'u1' } }),
    });
    const res = await POST(postRequest({ ssoToken: 'eyJhbGciOiJIUzI1NiJ9.valid.token' }));
    expect(res.status).toBe(401);
  });

  it('returns 502 when the identity service is unreachable', async () => {
    mockFetch.mockRejectedValueOnce(new Error('fetch failed'));
    const res = await POST(postRequest({ ssoToken: 'eyJhbGciOiJIUzI1NiJ9.valid.token' }));
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({
      success: false,
      error: { code: 'UPSTREAM_UNAVAILABLE' },
    });
  });
});
