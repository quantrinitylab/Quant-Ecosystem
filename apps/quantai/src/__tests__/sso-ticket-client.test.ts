import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Browser-side opaque-ticket SSO client: extraction, single-flight exchange,
// honest error mapping, and address-bar scrubbing.
import {
  extractSsoTicket,
  resolveSsoTicket,
  scrubSsoTicketFromAddressBar,
  SsoTicketError,
  SSO_TICKET_ERROR_COPY,
} from '../lib/sso-ticket-client';

function mockFetchOnce(status: number, body: unknown) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('extractSsoTicket', () => {
  it('reads __quant_sso_ticket and ignores legacy params', () => {
    expect(extractSsoTicket('?__quant_sso_ticket=tick-123')).toBe('tick-123');
    expect(extractSsoTicket('?token=legacy&__quant_sso_ticket=tick-123')).toBe('tick-123');
  });

  it('returns null when absent or blank', () => {
    expect(extractSsoTicket('?token=legacy')).toBeNull();
    expect(extractSsoTicket('?__quant_sso_ticket=')).toBeNull();
    expect(extractSsoTicket('?__quant_sso_ticket=%20%20')).toBeNull();
    expect(extractSsoTicket('')).toBeNull();
  });
});

describe('resolveSsoTicket', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('POSTs the ticket to the same-origin backend and returns the session', async () => {
    const fetchMock = mockFetchOnce(200, {
      success: true,
      data: {
        user: { id: 'u1', email: 'u@quantmail.in', displayName: 'U' },
        sessionToken: 'sess-abc',
      },
    });
    const result = await resolveSsoTicket('tick-1');
    expect(result.sessionToken).toBe('sess-abc');
    expect(result.user.email).toBe('u@quantmail.in');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/auth/sso/ticket');
    expect(JSON.parse(init.body as string)).toEqual({ ticket: 'tick-1' });
  });

  it('dedupes concurrent resolutions of the same ticket (single-use guard)', async () => {
    let release!: (v: Response) => void;
    const gate = new Promise<Response>((resolve) => {
      release = resolve;
    });
    const fetchMock = vi.fn(() => gate);
    vi.stubGlobal('fetch', fetchMock);

    const p1 = resolveSsoTicket('tick-single');
    const p2 = resolveSsoTicket('tick-single');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    release(
      new Response(
        JSON.stringify({
          success: true,
          data: { user: { id: 'u1', email: 'u@quantmail.in' }, sessionToken: 's' },
        }),
        { status: 200 },
      ),
    );
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.sessionToken).toBe('s');
    expect(r2.sessionToken).toBe('s');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('maps an expired/used ticket to honest, non-retryable copy', async () => {
    mockFetchOnce(401, {
      success: false,
      error: { code: 'SSO_TICKET_INVALID', message: 'expired', statusCode: 401 },
    });
    const err = await resolveSsoTicket('burned-tick').catch((e) => e);
    expect(err).toBeInstanceOf(SsoTicketError);
    expect(err.code).toBe('SSO_TICKET_INVALID');
    expect(err.retryable).toBe(false);
    expect(err.message).toMatch(/expired or was already used/);
  });

  it('maps identity outages to retryable copy', async () => {
    mockFetchOnce(502, {
      success: false,
      error: { code: 'SSO_IDENTITY_UNAVAILABLE', message: 'down', statusCode: 502 },
    });
    const err = await resolveSsoTicket('tick-2').catch((e) => e);
    expect(err.code).toBe('SSO_IDENTITY_UNAVAILABLE');
    expect(err.retryable).toBe(true);
    expect(err.message).toMatch(/temporarily unreachable/);
  });

  it('maps a network timeout to a retryable error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('aborted', 'AbortError')),
            );
          }),
      ),
    );
    const err = await resolveSsoTicket('tick-3', 50).catch((e) => e);
    expect(err).toBeInstanceOf(SsoTicketError);
    expect(err.code).toBe('SSO_IDENTITY_UNAVAILABLE');
    expect(err.retryable).toBe(true);
  });

  it('treats a success envelope without a session token as failure', async () => {
    mockFetchOnce(200, { success: true, data: { user: { id: 'u1' } } });
    const err = await resolveSsoTicket('tick-4').catch((e) => e);
    expect(err).toBeInstanceOf(SsoTicketError);
  });

  it('every error code has honest user-facing copy', () => {
    for (const [code, copy] of Object.entries(SSO_TICKET_ERROR_COPY)) {
      expect(copy.message.length).toBeGreaterThan(20);
      expect(typeof copy.retryable).toBe('boolean');
      const err = new SsoTicketError(code);
      expect(err.message).toBe(copy.message);
      expect(err.retryable).toBe(copy.retryable);
    }
  });
});

describe('scrubSsoTicketFromAddressBar', () => {
  it('removes the ticket and legacy SSO params without reloading', () => {
    window.history.replaceState(
      {},
      '',
      '/login?__quant_sso_ticket=tick-9&token=legacy&__quant_return=%2Fchat&keep=1',
    );
    scrubSsoTicketFromAddressBar();
    expect(window.location.search).not.toContain('__quant_sso_ticket');
    expect(window.location.search).not.toContain('token=');
    expect(window.location.search).not.toContain('__quant_return');
    expect(window.location.search).toContain('keep=1');
  });
});
