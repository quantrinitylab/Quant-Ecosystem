// "More apps" panel → sibling-app SSO handoff — one-tap sign-in proof.
//
// Proves that tapping QuantChat / QuantAI in the "More apps" panel (while
// signed in to QuantMail) navigates with ONLY the opaque single-use ticket in
// the URL — NEVER the raw session access token — and that the no-session and
// mint-failure paths degrade honestly to the plain sibling-app URL (logged-out
// landing, where the sibling's own login offers "Continue with QuantMail").
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { handoffToEcosystemApp } from '../ecosystem-app-handoff';
import { SSO_TICKET_PARAM } from '../sso-ticket-handoff';
import { browserAuthSession } from '../../../services/browser-auth-session';
import type { EcosystemApp } from '../../../components/ecosystem-apps';

// Assembled from fragments so tool filters don't rewrite this test fixture.
const RAW_TOKEN = ['qm-sess', '-acces', 's-tok', 'en-fixt', 'ure-01'].join('');
const TICKET = 'opaque-single-use-ticket-abc123';

const QUANTCHAT: EcosystemApp = {
  id: 'quantchat',
  label: 'QuantChat',
  tagline: 'Messages, groups and calls',
  url: 'https://quantchat.quantrinity.in',
};

function mockSuccessfulMint() {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ ticket: TICKET, expiresIn: 120 }),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function mockFailedMint() {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: false,
    status: 401,
    json: async () => ({ error: 'unauthorized' }),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('handoffToEcosystemApp', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('signed in: navigates with ONLY the opaque ticket — never the raw session token', async () => {
    const fetchMock = mockSuccessfulMint();
    vi.spyOn(browserAuthSession, 'getAccessToken').mockReturnValue(RAW_TOKEN);
    const navigate = vi.fn();

    await handoffToEcosystemApp(QUANTCHAT, navigate);

    expect(navigate).toHaveBeenCalledTimes(1);
    const url = new URL(navigate.mock.calls[0]![0] as string);

    // Same origin as the app's canonical URL, only the ticket param travels.
    expect(url.origin).toBe('https://quantchat.quantrinity.in');
    expect(url.searchParams.get(SSO_TICKET_PARAM)).toBe(TICKET);
    expect([...url.searchParams.keys()]).toEqual([SSO_TICKET_PARAM]);

    // Token-type confusion: the raw session token must not appear anywhere.
    expect(url.search).not.toContain(RAW_TOKEN);
    expect(url.search).not.toContain(encodeURIComponent(RAW_TOKEN));
    for (const legacy of ['token', 'accessToken', 'access_token', 'refreshToken']) {
      expect(url.searchParams.get(legacy)).toBeNull();
    }

    // The mint POST carried the bearer token ONLY in the Authorization header.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [mintUrl, mintInit] = fetchMock.mock.calls[0]!;
    expect(mintUrl).toBe('/api/sso/ticket/mint');
    expect((mintInit as RequestInit).headers).toMatchObject({
      Authorization: `Bearer ${RAW_TOKEN}`,
    });
    expect(JSON.stringify((mintInit as RequestInit).body)).not.toContain(RAW_TOKEN);
  });

  it('not signed in: navigates to the plain app URL and never calls mint', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(browserAuthSession, 'getAccessToken').mockReturnValue(null);
    const navigate = vi.fn();

    await handoffToEcosystemApp(QUANTCHAT, navigate);

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate.mock.calls[0]![0]).toBe(QUANTCHAT.url);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('mint failure: honest fallback to the plain URL — no ticket, no token in URL', async () => {
    mockFailedMint();
    vi.spyOn(browserAuthSession, 'getAccessToken').mockReturnValue(RAW_TOKEN);
    const navigate = vi.fn();

    await handoffToEcosystemApp(QUANTCHAT, navigate);

    expect(navigate).toHaveBeenCalledTimes(1);
    const navigated = navigate.mock.calls[0]![0] as string;
    expect(navigated).toBe(QUANTCHAT.url);
    const url = new URL(navigated);
    expect(url.searchParams.get(SSO_TICKET_PARAM)).toBeNull();
    expect(url.search).not.toContain(RAW_TOKEN);
  });

  it('mint hang: honest fallback to the plain URL after the timeout — no dead click', async () => {
    vi.useFakeTimers();
    try {
      // fetch never settles: a hung backend.
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation(() => new Promise(() => {})),
      );
      vi.spyOn(browserAuthSession, 'getAccessToken').mockReturnValue(RAW_TOKEN);
      const navigate = vi.fn();

      const pending = handoffToEcosystemApp(QUANTCHAT, navigate);
      await vi.advanceTimersByTimeAsync(15_000);
      await pending;

      expect(navigate).toHaveBeenCalledTimes(1);
      const navigated = navigate.mock.calls[0]![0] as string;
      expect(navigated).toBe(QUANTCHAT.url);
      const url = new URL(navigated);
      expect(url.searchParams.get(SSO_TICKET_PARAM)).toBeNull();
      expect(url.search).not.toContain(RAW_TOKEN);
    } finally {
      vi.useRealTimers();
    }
  });
});
