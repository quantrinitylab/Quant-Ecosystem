// ============================================================================
// QuantWave — authSession.completeSsoTicket (Contract B) tests.
//
// A Contract B ticket (?sso_ticket=) must be verified server-side (POST
// /api/auth/sso/ticket) before any session state is set. The ticket is never
// trusted on its own, and no token is ever stored — the session comes from
// the httpOnly cookies the server mints, resolved via GET /api/auth/session.
// ============================================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { authSession } from '../auth-session';

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
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('authSession.completeSsoTicket', () => {
  it('POSTs the ticket to /api/auth/sso/ticket and resolves the session', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, data: { user: { id: 'u1' } } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            success: true,
            data: { user: { id: 'u1', email: 'a@b.c' }, sessionType: 'sso-ticket' },
          }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const result = await authSession.completeSsoTicket('ticket-abc-123');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/auth/sso/ticket');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ ticket: 'ticket-abc-123' });
    // After the ticket is accepted, the session is re-resolved from cookies.
    expect(fetchMock.mock.calls[1][0]).toBe('/api/auth/session');
    expect(result.success).toBe(true);
    expect(result.data?.user?.id).toBe('u1');
  });

  it('returns the ticket error without touching session state when rejected', async () => {
    const fetchMock = mockFetchOnce(
      { success: false, error: { code: 'INVALID_SSO_TICKET', message: 'rejected' } },
      { ok: false, status: 401 },
    );

    const result = await authSession.completeSsoTicket('stale-ticket');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('INVALID_SSO_TICKET');
  });

  it('maps an unreadable response body to INVALID_RESPONSE', async () => {
    mockFetchOnce(null);

    const result = await authSession.completeSsoTicket('ticket-abc-123');

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('INVALID_RESPONSE');
  });

  it('maps a network failure to NETWORK', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('fetch failed')),
    );

    const result = await authSession.completeSsoTicket('ticket-abc-123');

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('NETWORK');
  });
});

describe('authSession.getSession', () => {
  it('GETs /api/auth/session and returns the verified user', async () => {
    mockFetchOnce({
      success: true,
      data: { user: { id: 'u1', email: 'a@b.c' }, sessionType: 'oauth' },
    });

    const result = await authSession.getSession();

    expect(result.success).toBe(true);
    expect(result.data?.user?.email).toBe('a@b.c');
  });

  it('reports NO_SESSION when signed out', async () => {
    mockFetchOnce(
      { success: false, error: { code: 'NO_SESSION', message: 'No active session.' } },
      { ok: false, status: 401 },
    );

    const result = await authSession.getSession();

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('NO_SESSION');
  });
});
