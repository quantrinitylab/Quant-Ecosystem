// ============================================================================
// Shared QuantMail OAuth2 (PKCE) client helpers — unit tests.
// ============================================================================
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  generatePkcePair,
  generateOAuthState,
  buildAuthorizeUrl,
  validateOAuthState,
  safeReturnPath,
  scrubSsoParamsFromUrl,
  startQuantMailOAuth,
  requestPasswordReset,
  SSO_HANDOFF_PARAM_NAMES,
  PASSWORD_RESET_SENT_COPY,
} from '../sso-oauth';

describe('generatePkcePair', () => {
  it('returns a verifier and an S256 challenge that matches the verifier', async () => {
    const { verifier, challenge } = await generatePkcePair();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(challenge.length).toBeGreaterThanOrEqual(43);
    // Recompute S256 independently.
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    const bytes = new Uint8Array(digest);
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    const expected = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(challenge).toBe(expected);
  });

  it('generates unique pairs', async () => {
    const a = await generatePkcePair();
    const b = await generatePkcePair();
    expect(a.verifier).not.toBe(b.verifier);
    expect(a.challenge).not.toBe(b.challenge);
  });

  it('uses URL-safe characters only', async () => {
    const { verifier, challenge } = await generatePkcePair();
    expect(verifier).toMatch(/^[A-Za-z0-9\-_]+$/);
    expect(challenge).toMatch(/^[A-Za-z0-9\-_]+$/);
  });
});

describe('generateOAuthState', () => {
  it('returns unique URL-safe state values', () => {
    const a = generateOAuthState();
    const b = generateOAuthState();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9\-_]+$/);
    expect(a.length).toBeGreaterThanOrEqual(32);
  });
});

describe('buildAuthorizeUrl', () => {
  it('builds the Contract A authorize URL with all required params', () => {
    const url = buildAuthorizeUrl({
      clientId: 'quantgram',
      redirectUri: 'https://quantgram.quantrinity.in/api/auth/sso/callback',
      state: 'state123',
      codeChallenge: 'challenge456',
    });
    const parsed = new URL(url);
    expect(`${parsed.origin}${parsed.pathname}`).toBe('https://quantmail.in/api/oauth/authorize');
    expect(parsed.searchParams.get('response_type')).toBe('code');
    expect(parsed.searchParams.get('client_id')).toBe('quantgram');
    expect(parsed.searchParams.get('redirect_uri')).toBe(
      'https://quantgram.quantrinity.in/api/auth/sso/callback',
    );
    expect(parsed.searchParams.get('scope')).toBe('openid profile email');
    expect(parsed.searchParams.get('state')).toBe('state123');
    expect(parsed.searchParams.get('code_challenge')).toBe('challenge456');
    expect(parsed.searchParams.get('code_challenge_method')).toBe('S256');
    // No secrets in the URL: the verifier must never appear.
    expect(url).not.toContain('verifier');
  });
});

describe('validateOAuthState', () => {
  it('accepts matching state', () => {
    expect(validateOAuthState('abc123', 'abc123')).toBe(true);
  });
  it('rejects mismatched state', () => {
    expect(validateOAuthState('abc123', 'xyz789')).toBe(false);
  });
  it('rejects missing/empty state', () => {
    expect(validateOAuthState(null, 'abc')).toBe(false);
    expect(validateOAuthState('abc', undefined)).toBe(false);
    expect(validateOAuthState('', '')).toBe(false);
  });
});

describe('safeReturnPath', () => {
  it('allows same-origin absolute paths', () => {
    expect(safeReturnPath('/reels')).toBe('/reels');
    expect(safeReturnPath('/')).toBe('/');
  });
  it('rejects open redirects and arrays', () => {
    expect(safeReturnPath('https://evil.com')).toBeNull();
    expect(safeReturnPath('//evil.com/x')).toBeNull();
    expect(safeReturnPath('/\\evil')).toBeNull();
    expect(safeReturnPath(null)).toBeNull();
    expect(safeReturnPath(['https://evil.com', '/ok'])).toBeNull();
    expect(safeReturnPath(['/ok'])).toBe('/ok');
  });
});

describe('scrubSsoParamsFromUrl', () => {
  it('removes every handoff param but keeps returnTo and the hash', () => {
    const scrubbed = scrubSsoParamsFromUrl(
      'https://quantgram.quantrinity.in/login?token=abc&accessToken=def&__quant_sso_ticket=ghi&sso_ticket=jkl&returnTo=%2Freels#top',
    );
    // Returns a relative URL (for history.replaceState) — re-anchor to inspect.
    const parsed = new URL(scrubbed, 'https://quantgram.quantrinity.in');
    for (const name of SSO_HANDOFF_PARAM_NAMES) {
      expect(parsed.searchParams.has(name)).toBe(false);
    }
    expect(parsed.searchParams.get('returnTo')).toBe('/reels');
    expect(parsed.hash).toBe('#top');
  });

  it('is a no-op when no handoff params exist', () => {
    const href = 'https://quantgram.quantrinity.in/login?returnTo=%2F';
    expect(scrubSsoParamsFromUrl(href)).toBe('/login?returnTo=%2F');
  });
});

describe('startQuantMailOAuth', () => {
  beforeEach(() => {
    vi.stubGlobal('window', undefined as unknown as Window & typeof globalThis);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('persists PKCE/state/return cookies and redirects to the authorize URL', async () => {
    const cookies: Record<string, string> = {};
    const written: string[] = [];
    Object.defineProperty(globalThis, 'document', {
      value: {
        get cookie() {
          return Object.entries(cookies)
            .map(([k, v]) => `${k}=${v}`)
            .join('; ');
        },
        set cookie(raw: string) {
          written.push(raw);
          const [pair] = raw.split(';');
          const [k, v] = (pair ?? '').split('=');
          cookies[(k ?? '').trim()] = v ?? '';
        },
      },
      configurable: true,
    });
    const location = { href: '', origin: 'https://quantgram.quantrinity.in' };
    vi.stubGlobal('window', { location } as unknown as Window & typeof globalThis);

    await startQuantMailOAuth({ appId: 'quantgram', returnTo: '/reels' });

    expect(written.some((c) => c.startsWith('quant_sso_state='))).toBe(true);
    expect(written.some((c) => c.startsWith('quant_sso_verifier='))).toBe(true);
    expect(written.some((c) => c.startsWith('quant_sso_return='))).toBe(true);
    expect(written.some((c) => c.startsWith('quant_sso_redirect='))).toBe(true);
    expect(written.every((c) => c.includes('SameSite=Lax'))).toBe(true);
    const target = new URL(location.href);
    expect(`${target.origin}${target.pathname}`).toBe('https://quantmail.in/api/oauth/authorize');
    expect(target.searchParams.get('client_id')).toBe('quantgram');
    expect(target.searchParams.get('redirect_uri')).toBe(
      'https://quantgram.quantrinity.in/api/auth/sso/callback',
    );
    expect(target.searchParams.get('state')).toBe(cookies['quant_sso_state']);
    expect(target.searchParams.get('code_challenge_method')).toBe('S256');
    // The verifier must NOT be in the URL.
    expect(location.href).not.toContain(cookies['quant_sso_verifier']);

    delete (globalThis as Record<string, unknown>)['document'];
  });
});

describe('consumeSsoTicketFromUrl', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete (globalThis as Record<string, unknown>)['document'];
  });

  it('scrubs the ticket from the URL before returning it', async () => {
    const replaceState = vi.fn();
    vi.stubGlobal('window', {
      location: { href: 'https://x/login?sso_ticket=ticket-123&returnTo=%2F', search: '?sso_ticket=ticket-123&returnTo=%2F' },
      history: { replaceState },
    } as unknown as Window & typeof globalThis);
    Object.defineProperty(globalThis, 'document', { value: { title: 't' }, configurable: true });

    const mod = await import('../sso-oauth');
    expect(mod.consumeSsoTicketFromUrl()).toBe('ticket-123');
    expect(replaceState).toHaveBeenCalledTimes(1);
    const cleanUrl = replaceState.mock.calls[0]![2] as string;
    expect(cleanUrl).not.toContain('sso_ticket');
    expect(cleanUrl).toContain('returnTo');
  });

  it('returns null when no ticket is present', async () => {
    vi.stubGlobal('window', {
      location: { href: 'https://x/login', search: '' },
      history: { replaceState: vi.fn() },
    } as unknown as Window & typeof globalThis);
    const mod = await import('../sso-oauth');
    expect(mod.consumeSsoTicketFromUrl()).toBeNull();
    expect(mod.SSO_ERROR_COPY.sso_failed).toContain('try again');
  });
});

describe('requestPasswordReset', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POSTs the email to the same-origin reset route', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    await requestPasswordReset('user@quantmail.in');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/auth/password-reset/request');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ email: 'user@quantmail.in' });
  });

  it('throws an honest error when the service fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: { message: 'Service down' } }),
      }),
    );
    await expect(requestPasswordReset('user@quantmail.in')).rejects.toThrow('Service down');
  });

  it('uses honest copy about the QuantMail inbox', () => {
    expect(PASSWORD_RESET_SENT_COPY).toContain('QuantMail inbox');
  });
});
