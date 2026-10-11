import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Next.js POST /api/auth/sso/ticket — thin proxy to the QuantAI backend that
// establishes the session via the HttpOnly cookie (same attributes as the
// hardened login route).
import { NextRequest } from 'next/server';
import { POST } from '../route';

function postTicket(body: unknown) {
  return new NextRequest('http://localhost:3000/api/auth/sso/ticket', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/sso/ticket (Next.js)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('rejects a missing ticket with 400', async () => {
    const res = await POST(postTicket({}));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('SSO_TICKET_MISSING');
  });

  it('proxies to the backend and sets the HttpOnly session cookie', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            success: true,
            data: {
              user: { id: 'u1', email: 'u@quantmail.in', displayName: 'U' },
              sessionToken: 'sess-xyz',
            },
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = await POST(postTicket({ ticket: 'tick-1' }));
    expect(res.status).toBe(200);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/auth/sso/ticket');
    expect(JSON.parse(init.body as string)).toEqual({ ticket: 'tick-1' });

    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('quant_access_token=sess-xyz');
    expect(setCookie).toMatch(/httponly/i);
    expect(setCookie).toMatch(/samesite=lax/i);
    expect(setCookie).toContain('Path=/');
    expect(setCookie).toContain('Max-Age=3600');

    const json = (await res.json()) as {
      success: boolean;
      data: { user: { id: string }; sessionToken: string };
    };
    expect(json.success).toBe(true);
    expect(json.data.user.id).toBe('u1');
    // Same-origin JSON body (never a URL) so the frontend can populate its
    // Authorization header like the /auth/refresh flow.
    expect(json.data.sessionToken).toBe('sess-xyz');
  });

  it('relays backend SSO errors with their codes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              success: false,
              error: { code: 'SSO_TICKET_INVALID', message: 'expired', statusCode: 401 },
            }),
            { status: 401 },
          ),
      ),
    );
    const res = await POST(postTicket({ ticket: 'burned' }));
    expect(res.status).toBe(401);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('SSO_TICKET_INVALID');
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('maps an unreachable backend to 502', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('fetch failed');
      }),
    );
    const res = await POST(postTicket({ ticket: 'tick-1' }));
    expect(res.status).toBe(502);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('SSO_IDENTITY_UNAVAILABLE');
  });
});
