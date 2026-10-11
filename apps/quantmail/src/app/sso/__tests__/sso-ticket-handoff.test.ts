// SSO ticket handoff — the raw bearer token must NEVER travel in a URL.
// Proves: (1) the mint call sends the token ONLY in the Authorization header,
// (2) the redirect URL carries ONLY the opaque ticket, (3) legacy credential
// params are stripped, (4) mint failures throw (the UI shows an honest error,
// never a token-in-URL fallback).
import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  buildSsoHandoffUrl,
  mintSsoTicket,
  SSO_TICKET_PARAM,
} from '../sso-ticket-handoff';

const RAW_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEyMyJ9.c2lnbmF0dXJl';
const TICKET = 'opaque-single-use-ticket-abc123';

describe('mintSsoTicket', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('POSTs to /api/sso/ticket/mint with the bearer token ONLY in the Authorization header', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ticket: TICKET, expiresIn: 120 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const ticket = await mintSsoTicket(RAW_TOKEN, {
      clientId: 'quantai',
      returnTo: 'https://quantai.in/chat',
    });

    expect(ticket).toBe(TICKET);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    // The token must not appear anywhere in the request URL...
    expect(url).toBe('/api/sso/ticket/mint');
    expect(url).not.toContain(RAW_TOKEN);
    // ...nor in the request body (clientId/returnTo are not credentials).
    const body = JSON.parse(init.body as string) as Record<string, string>;
    expect(JSON.stringify(body)).not.toContain(RAW_TOKEN);
    expect(body['clientId']).toBe('quantai');
    // The token travels in the Authorization header only.
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe(`Bearer ${RAW_TOKEN}`);
    expect(init.method).toBe('POST');
  });

  it('throws on mint failure — the UI must show an error, never a token-in-URL fallback', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }),
    );
    await expect(mintSsoTicket(RAW_TOKEN)).rejects.toThrow(/HTTP 401/);
  });

  it('throws when the mint response carries no ticket', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
    );
    await expect(mintSsoTicket(RAW_TOKEN)).rejects.toThrow(/no ticket/);
  });
});

describe('buildSsoHandoffUrl', () => {
  it('puts ONLY the opaque ticket in the URL — never the raw bearer token', () => {
    const url = new URL(buildSsoHandoffUrl('https://quantai.in/chat', TICKET));
    expect(url.searchParams.get(SSO_TICKET_PARAM)).toBe(TICKET);
    const query = url.search;
    expect(query).not.toContain(RAW_TOKEN);
    expect(url.searchParams.get('token')).toBeNull();
    expect(url.searchParams.get('accessToken')).toBeNull();
    expect(url.searchParams.get('access_token')).toBeNull();
    expect(url.searchParams.get('refreshToken')).toBeNull();
  });

  it('strips legacy credential params that arrive on the returnTo URL', () => {
    const dirty =
      `https://quantai.in/chat?token=${RAW_TOKEN}` +
      `&accessToken=${RAW_TOKEN}&refreshToken=${RAW_TOKEN}&keep=1`;
    const url = new URL(buildSsoHandoffUrl(dirty, TICKET));
    expect(url.searchParams.get(SSO_TICKET_PARAM)).toBe(TICKET);
    expect(url.searchParams.get('keep')).toBe('1');
    expect(url.search).not.toContain(RAW_TOKEN);
    expect(url.searchParams.get('token')).toBeNull();
    expect(url.searchParams.get('accessToken')).toBeNull();
    expect(url.searchParams.get('refreshToken')).toBeNull();
  });

  it('preserves the return path and non-credential params', () => {
    const url = new URL(buildSsoHandoffUrl('https://quantai.in/chat?tab=recent#top', TICKET));
    expect(url.pathname).toBe('/chat');
    expect(url.searchParams.get('tab')).toBe('recent');
    expect(url.hash).toBe('#top');
  });
});
