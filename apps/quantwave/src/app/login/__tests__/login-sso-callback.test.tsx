// @vitest-environment jsdom
// ============================================================================
// QuantWave — /login SSO callback handler tests.
// QuantMail redirects back here with ?token=…&accessToken=…&__quant_sso_ticket=…
// after "Continue with Quant SSO". The page must exchange the token via
// loginWithSSO (server-side exchange through the /api/auth/sso/login proxy),
// scrub every token param from the URL, and continue to ?returnTo.
// Token priority (apps/quantwave/src/lib/sso-handoff.ts):
// token -> accessToken -> access_token -> __quant_sso_ticket.
// ============================================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';

const routerReplace = vi.fn();
const loginWithSSO = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: routerReplace, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

vi.mock('../../../providers/auth-provider', () => ({
  useAuth: () => ({
    login: vi.fn(),
    loginWithSSO,
    isLoading: false,
    isAuthenticated: false,
    error: null,
    logout: vi.fn(),
  }),
}));

// eslint-disable-next-line import/first
import LoginPage from '../page';

const TOKEN_QUERY =
  'returnTo=%2Ftrending&token=QM-JWT&accessToken=QM-JWT&__quant_sso_ticket=QM-JWT';

function goToLogin(query: string) {
  window.history.replaceState(null, '', `/login${query ? `?${query}` : ''}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  loginWithSSO.mockResolvedValue(undefined);
  goToLogin('');
});

afterEach(() => {
  cleanup();
});

describe('/login SSO callback', () => {
  it('exchanges the handoff token, scrubs it from the URL, and continues to returnTo', async () => {
    goToLogin(TOKEN_QUERY);

    render(<LoginPage />);

    await waitFor(() => expect(loginWithSSO).toHaveBeenCalledWith('QM-JWT'));

    // Every token param is stripped; returnTo survives the scrub.
    await waitFor(() => {
      const params = new URLSearchParams(window.location.search);
      expect(params.get('token')).toBeNull();
      expect(params.get('accessToken')).toBeNull();
      expect(params.get('access_token')).toBeNull();
      expect(params.get('__quant_sso_ticket')).toBeNull();
      expect(params.get('returnTo')).toBe('/trending');
    });

    await waitFor(() => expect(routerReplace).toHaveBeenCalledWith('/trending'));
  });

  it('prefers ?token= when several token params are present', async () => {
    goToLogin('__quant_sso_ticket=OLD-TICKET&token=NEW-TOKEN');

    render(<LoginPage />);

    await waitFor(() => expect(loginWithSSO).toHaveBeenCalledWith('NEW-TOKEN'));
  });

  it('shows an error and still scrubs the URL when the exchange fails', async () => {
    loginWithSSO.mockRejectedValue(new Error('Quant SSO sign-in failed.'));
    goToLogin(TOKEN_QUERY);

    render(<LoginPage />);

    await waitFor(() => expect(loginWithSSO).toHaveBeenCalled());
    expect(await screen.findByText(/Quant SSO sign-in failed/)).toBeDefined();

    await waitFor(() => {
      const params = new URLSearchParams(window.location.search);
      expect(params.get('token')).toBeNull();
      expect(params.get('__quant_sso_ticket')).toBeNull();
    });
    expect(routerReplace).not.toHaveBeenCalled();
  });

  it('does not touch SSO when no token is in the URL', async () => {
    goToLogin('returnTo=%2Ftrending');

    render(<LoginPage />);

    // Let effects settle.
    await waitFor(() => expect(screen.getByText('Sign in to QuantWave')).toBeDefined());
    expect(loginWithSSO).not.toHaveBeenCalled();
    expect(routerReplace).not.toHaveBeenCalled();
  });

  it('rejects an unsafe returnTo and falls back to /', async () => {
    goToLogin('returnTo=https%3A%2F%2Fevil.example%2F&token=QM-JWT');

    render(<LoginPage />);

    await waitFor(() => expect(loginWithSSO).toHaveBeenCalledWith('QM-JWT'));
    await waitFor(() => expect(routerReplace).toHaveBeenCalledWith('/'));
  });
});
