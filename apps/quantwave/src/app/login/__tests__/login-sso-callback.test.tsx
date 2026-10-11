// @vitest-environment jsdom
// ============================================================================
// QuantWave — /login SSO return-handler tests (Contract B + OAuth errors).
//
// Contract B: QuantMail's /sso chooser hands back ?sso_ticket=. The page must
// scrub the ticket from the URL FIRST (before any network), verify it via
// completeSsoTicket (server-side ticket verification), and continue to
// ?returnTo. Legacy token params are scrubbed defensively but never trusted.
//
// Contract A failures: /api/auth/sso/callback redirects back with
// ?error=<code>; the page surfaces honest copy and scrubs the param.
// ============================================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';

const routerReplace = vi.fn();
const completeSsoTicket = vi.fn();
const startQuantMailOAuth = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: routerReplace, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

vi.mock('../../../providers/auth-provider', () => ({
  useAuth: () => ({
    login: vi.fn(),
    completeSsoTicket,
    isLoading: false,
    isAuthenticated: false,
    error: null,
    logout: vi.fn(),
    refreshSession: vi.fn(),
  }),
}));

vi.mock('@quant/shared-ui', async (importOriginal) => {
  const original = await importOriginal<typeof import('@quant/shared-ui')>();
  return {
    ...original,
    startQuantMailOAuth: (...args: unknown[]) => startQuantMailOAuth(...args),
  };
});

import LoginPage from '../page';

function goToLogin(query: string) {
  window.history.replaceState(null, '', `/login${query ? `?${query}` : ''}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  completeSsoTicket.mockResolvedValue(undefined);
  goToLogin('');
});

afterEach(() => {
  cleanup();
});

describe('/login SSO return handler (Contract B ticket)', () => {
  it('scrubs the ticket from the URL first, verifies it, and continues to returnTo', async () => {
    goToLogin('returnTo=%2Ftrending&sso_ticket=ticket-abc-123');

    render(<LoginPage />);

    await waitFor(() => expect(completeSsoTicket).toHaveBeenCalledWith('ticket-abc-123'));

    // The ticket is stripped before/while verifying; returnTo survives.
    await waitFor(() => {
      const params = new URLSearchParams(window.location.search);
      expect(params.get('sso_ticket')).toBeNull();
      expect(params.get('returnTo')).toBe('/trending');
    });

    await waitFor(() => expect(routerReplace).toHaveBeenCalledWith('/trending'));
  });

  it('shows an error and still scrubs the URL when ticket verification fails', async () => {
    completeSsoTicket.mockRejectedValue(new Error('The QuantMail sign-in ticket was rejected.'));
    goToLogin('sso_ticket=stale-ticket');

    render(<LoginPage />);

    await waitFor(() => expect(completeSsoTicket).toHaveBeenCalled());
    expect(await screen.findByText(/ticket was rejected/)).toBeDefined();

    await waitFor(() => {
      expect(new URLSearchParams(window.location.search).get('sso_ticket')).toBeNull();
    });
    expect(routerReplace).not.toHaveBeenCalled();
  });

  it('does not touch SSO when no ticket is in the URL', async () => {
    goToLogin('returnTo=%2Ftrending');

    render(<LoginPage />);

    await waitFor(() => expect(screen.getByText('Sign in to QuantWave')).toBeDefined());
    expect(completeSsoTicket).not.toHaveBeenCalled();
    expect(routerReplace).not.toHaveBeenCalled();
  });

  it('never treats legacy token params as a session', async () => {
    goToLogin('returnTo=%2Ftrending&token=QM-JWT&accessToken=QM-JWT');

    render(<LoginPage />);

    await waitFor(() => expect(screen.getByText('Sign in to QuantWave')).toBeDefined());
    expect(completeSsoTicket).not.toHaveBeenCalled();
    expect(routerReplace).not.toHaveBeenCalled();
  });
});

describe('/login OAuth error param (Contract A failures)', () => {
  it('surfaces honest copy for ?error=sso_failed and scrubs the param', async () => {
    goToLogin('error=sso_failed');

    render(<LoginPage />);

    expect(await screen.findByText(/QuantMail sign-in failed/)).toBeDefined();
    await waitFor(() => {
      expect(new URLSearchParams(window.location.search).get('error')).toBeNull();
    });
    expect(completeSsoTicket).not.toHaveBeenCalled();
  });
});

describe('/login "Continue with QuantMail" (Contract A start)', () => {
  it('starts the PKCE OAuth flow with the return destination', async () => {
    goToLogin('returnTo=%2Ftrending');
    startQuantMailOAuth.mockResolvedValue(undefined);

    render(<LoginPage />);

    const button = await screen.findByRole('button', { name: /Continue with QuantMail/ });
    button.click();

    await waitFor(() =>
      expect(startQuantMailOAuth).toHaveBeenCalledWith({
        appId: 'quantwave',
        returnTo: '/trending',
      }),
    );
  });
});
