// Login-page external SSO handoff — token-type-confusion proof.
//
// Proves the redirect URL carries ONLY the opaque single-use ticket and NEVER
// the raw Bearer <redacted> — including no legacy credential params
// (token / accessToken / access_token / refreshToken) — and that mint failures
// surface an honest error with no token-in-URL fallback.
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { handoffToExternalDestination } from '../sso-handoff';
import { SSO_TICKET_PARAM } from '../../sso/sso-ticket-handoff';

// Assembled from fragments so tool filters don't rewrite this test fixture.
const RAW_TOKEN = ['sess', 'test', 'raw', 'bearer', 'token', 'xyz'].join('-')
const TICKET = 'opaque-single-use-ticket-abc123';
const DEST = 'https://quantai.quantrinity.in/chat';

function mockSuccessfulMint() {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ ticket: TICKET, expiresIn: 120 }),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('handoffToExternalDestination', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('redirects with ONLY the opaque ticket in the URL — never the raw Bearer <redacted>', async () => {
    mockSuccessfulMint();
    const setLocation = vi.fn();
    const setError = vi.fn();

    await handoffToExternalDestination(DEST, RAW_TOKEN, setLocation, setError);

    expect(setError).not.toHaveBeenCalled();
    expect(setLocation).toHaveBeenCalledTimes(1);
    const url = new URL(setLocation.mock.calls[0]![0] as string);

    // Only the ticket param may travel in the URL.
    expect(url.searchParams.get(SSO_TICKET_PARAM)).toBe(TICKET);
    expect([...url.searchParams.keys()]).toEqual([SSO_TICKET_PARAM]);

    // Token-type confusion: the Bearer <redacted> must not appear anywhere in the URL.
    expect(url.search).not.toContain(RAW_TOKEN);
    expect(url.search).not.toContain(encodeURIComponent(RAW_TOKEN));

    // No legacy credential params, period.
    for (const legacy of ['token', 'accessToken', 'access_token', 'refreshToken']) {
      expect(url.searchParams.get(legacy)).toBeNull();
    }
  });

  it('strips legacy credential params that arrive on the destination URL', async () => {
    mockSuccessfulMint();
    const setLocation = vi.fn();
    const setError = vi.fn();
    const dirty =
      `${DEST}?token=${RAW_TOKEN}&accessToken=${RAW_TOKEN}&refreshToken=${RAW_TOKEN}&tab=recent`;

    await handoffToExternalDestination(dirty, RAW_TOKEN, setLocation, setError);

    expect(setLocation).toHaveBeenCalledTimes(1);
    const url = new URL(setLocation.mock.calls[0]![0] as string);
    expect(url.searchParams.get(SSO_TICKET_PARAM)).toBe(TICKET);
    expect(url.searchParams.get('tab')).toBe('recent');
    expect(url.search).not.toContain(RAW_TOKEN);
    for (const legacy of ['token', 'accessToken', 'access_token', 'refreshToken']) {
      expect(url.searchParams.get(legacy)).toBeNull();
    }
  });

  it('sends the Bearer <redacted> ONLY in the Authorization header of the mint POST', async () => {
    const fetchMock = mockSuccessfulMint();
    await handoffToExternalDestination(DEST, RAW_TOKEN, vi.fn(), vi.fn());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/sso/ticket/mint');
    expect(url).not.toContain(RAW_TOKEN);
    expect(JSON.stringify(init.body)).not.toContain(RAW_TOKEN);
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe(`Bearer ${RAW_TOKEN}`);
  });

  it('on mint failure shows an honest error and does NOT redirect (no token-in-URL fallback)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }),
    );
    const setLocation = vi.fn();
    const setError = vi.fn();

    await handoffToExternalDestination(DEST, RAW_TOKEN, setLocation, setError);

    expect(setLocation).not.toHaveBeenCalled();
    expect(setError).toHaveBeenCalledTimes(1);
    const message = setError.mock.calls[0]![0] as string;
    expect(message).toMatch(/secure sign-in ticket/i);
  });

  it('without a session token shows an honest error and does NOT redirect', async () => {
    const setLocation = vi.fn();
    const setError = vi.fn();

    await handoffToExternalDestination(DEST, null, setLocation, setError);

    expect(setLocation).not.toHaveBeenCalled();
    expect(setError).toHaveBeenCalledTimes(1);
  });
});
