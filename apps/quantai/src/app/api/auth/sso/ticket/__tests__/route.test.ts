import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Next.js POST /api/auth/sso/ticket — exchanges the QuantMail opaque SSO
// ticket server-to-server with the identity root (POST /sso/ticket/exchange)
// and establishes the session via the HttpOnly cookie (same attributes as
// the hardened login route).
import { NextRequest } from 'next/server';
import { POST } from '../route';

function postTicket(body: unknown, origin = 'https://quantai.quantrinity.in') {
  return new NextRequest('http://localhost:3000/api/auth/sso/ticket', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/sso/ticket (Next.js)', () => {
  const prevClientId = process.env['QUANT_SSO_CLIENT_ID'];
  const prevClientSecret = process.env['QUANT_SSO_CLIENT_SECRET'];

  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    process.env['QUANT_SSO_CLIENT_ID'] = 'client_quantai_1';
    process.env['QUANT_SSO_CLIENT_SECRET'] = 'secret_quantai_1';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    if (prevClientId === undefined) delete process.env['QUANT_SSO_CLIENT_ID'];
    else process.env['QUANT_SSO_CLIENT_ID'] = prevClientId;
    if (prevClientSecret === undefined) delete process.env['QUANT_SSO_CLIENT_SECRET'];
    else process.env['QUANT_SSO_CLIENT_SECRET'] = prevClientSecret;
  });

  it('rejects a missing ticket with 400', async () => {
    const res = await POST(postTicket({}));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('SSO_TICKET_MISSING');
  });

  it('fails honestly when the OAuth client credentials are not configured', async () => {
    delete process.env['QUANT_SSO_CLIENT_ID'];
    delete process.env['QUANT_SSO_CLIENT_SECRET'];
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await POST(postTicket({ ticket: 'tick-1' }));
    expect(res.status).toBe(500);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('SSO_CLIENT_MISCONFIGURED');
    // Must not call the identity root without credentials.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('exchanges the ticket with the identity root and sets the HttpOnly session cookie', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            success: true,
            data: {
              user: { id: 'u1', email: 'u@quantmail.in', displayName: 'U' },
              accessToken: 'tok-xyz',
            },
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = await POST(postTicket({ ticket: 'tick-1' }));
    expect(res.status).toBe(200);

    // vi.fn(async () => …) declares no parameters, so the mock's recorded-call
    // type is the empty tuple [] and a direct assertion to [string,
    // RequestInit] is a TS2352 error. The route does call fetch(url, init) at
    // runtime, so convert through `unknown` to read the pair back out.
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/sso/ticket/exchange');
    expect(JSON.parse(init.body as string)).toEqual({
      ticket: 'tick-1',
      client_id: 'client_quantai_1',
      client_secret: 'secret_quantai_1',
    });
    // The browser's Origin is forwarded: the identity backend's trusted-origin
    // check 403s auth-adjacent calls that arrive without one.
    const sentHeaders = init.headers as Record<string, string>;
    expect(sentHeaders['origin']).toBe('https://quantai.quantrinity.in');

    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('quant_access_token=tok-xyz');
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
    expect(json.data.sessionToken).toBe('tok-xyz');
  });

  it('relays backend SSO errors with their codes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              success: false,
              error: { code: 'invalid_grant', message: 'expired', statusCode: 400 },
            }),
            { status: 400 },
          ),
      ),
    );
    const res = await POST(postTicket({ ticket: 'burned' }));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('invalid_grant');
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

  it('fails 502 when the backend stalls mid-body (deadline covers the body)', async () => {
    // The resolve deadline covers body parsing: headers arrive, the body
    // never does, and the route must fail closed instead of hanging.
    const prev = process.env['QUANT_SSO_WEB_RESOLVE_TIMEOUT_MS'];
    process.env['QUANT_SSO_WEB_RESOLVE_TIMEOUT_MS'] = '150';
    try {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (_url: string, init?: RequestInit) => {
          const signal = init?.signal as AbortSignal | undefined;
          return new Response(
            new ReadableStream({
              start() {
                return new Promise<void>((_resolve, reject) => {
                  if (!signal) return;
                  if (signal.aborted) {
                    reject(signal.reason);
                    return;
                  }
                  signal.addEventListener('abort', () => reject(signal.reason), { once: true });
                });
              },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }),
      );
      const res = await POST(postTicket({ ticket: 'tick-1' }));
      expect(res.status).toBe(502);
      const json = (await res.json()) as { error: { code: string } };
      expect(json.error.code).toBe('SSO_IDENTITY_UNAVAILABLE');
      expect(res.headers.get('set-cookie')).toBeNull();
    } finally {
      if (prev === undefined) delete process.env['QUANT_SSO_WEB_RESOLVE_TIMEOUT_MS'];
      else process.env['QUANT_SSO_WEB_RESOLVE_TIMEOUT_MS'] = prev;
    }
  });
});
