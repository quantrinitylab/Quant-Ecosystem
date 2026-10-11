// ============================================================================
// QuantCooks — POST /api/auth/sso/exchange route tests (Contract B migration).
//
// The old contract accepted a QuantMail-issued JWT ({ ssoToken }) from
// ?token= URLs and verified it via userinfo. It is RETIRED: the route now
// delegates to the shared ticket handler — it accepts a single-use /sso
// chooser ticket ({ ticket }), verifies it back-channel via QuantMail's
// /api/oauth/sso-ticket/verify, and mints an HMAC-signed identity session.
// The old { ssoToken } shape is rejected; no tokens are ever returned.
// ============================================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';
import { SSO_COOKIES } from '@quant/api-client/sso-server';

const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

function postRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/auth/sso/exchange', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function ticketOk() {
  return {
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        success: true,
        data: { id: 'u1', email: 'user@quantmail.in', username: 'user', displayName: 'User' },
      }),
  };
}

function setCookies(res: Response): string[] {
  const headers = res.headers as Headers & { getSetCookie?: () => string[] };
  return headers.getSetCookie?.() ?? [];
}

beforeEach(() => {
  mockFetch.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /api/auth/sso/exchange (ticket contract)', () => {
  it('verifies a ticket back-channel and mints a signed identity session', async () => {
    mockFetch.mockResolvedValueOnce(ticketOk());
    const res = await POST(postRequest({ ticket: 'single-use-ticket-abc' }));

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://quantmail.in/api/oauth/sso-ticket/verify');
    expect(JSON.parse(init.body as string)).toEqual({ ticket: 'single-use-ticket-abc' });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      success: true,
      data: { user: { id: 'u1', email: 'user@quantmail.in' } },
    });
    // The old contract echoed the token back as { data: { accessToken } } —
    // the ticket contract returns identity only, never tokens.
    expect(JSON.stringify(body)).not.toContain('accessToken');
    const session = setCookies(res).find((c) => c.startsWith(`${SSO_COOKIES.session}=`));
    expect(session).toContain('HttpOnly');
  });

  it('rejects the retired { ssoToken } shape with 400', async () => {
    const res = await POST(postRequest({ ssoToken: 'eyJhbGciOiJIUzI1NiJ9.valid.token' }));
    expect(res.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('rejects a missing ticket with 400 BAD_REQUEST', async () => {
    const res = await POST(postRequest(null));
    expect(res.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('never echoes user PII beyond the verified profile', async () => {
    mockFetch.mockResolvedValueOnce(ticketOk());
    const res = await POST(postRequest({ ticket: 'single-use-ticket-abc' }));
    const raw = await res.text();
    // The verified profile (id/email) is the session identity — that is
    // returned. No tokens, no secrets.
    expect(raw).not.toContain('single-use-ticket-abc');
  });

  it('fails closed with 401 INVALID_SSO_TICKET when QuantMail rejects the ticket', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401, json: () => Promise.resolve({}) });
    const res = await POST(postRequest({ ticket: 'stale-ticket' }));
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({
      success: false,
      error: { code: 'INVALID_SSO_TICKET' },
    });
    expect(setCookies(res)).toHaveLength(0);
  });

  it('fails closed when the identity service is unreachable', async () => {
    mockFetch.mockRejectedValueOnce(new Error('fetch failed'));
    const res = await POST(postRequest({ ticket: 'single-use-ticket-abc' }));
    // Fail-closed: an unreachable verifier means the ticket cannot be
    // verified, so no session is minted.
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({
      success: false,
      error: { code: 'INVALID_SSO_TICKET' },
    });
    expect(setCookies(res)).toHaveLength(0);
  });
});
