// @vitest-environment jsdom
// ============================================================================
// QuantWave — /login SSO callback handler tests.
// QuantMail redirects back here with ?token=…&accessToken=…&__quant_sso_ticket=…
// after "Continue with Quant SSO". The page must exchange the token via
// ssoLogin, scrub every token param from the URL, and continue to ?returnTo.
// ============================================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';

const routerReplace = vi.fn();
const ssoLogin = vi.fn();

let searchQuery = '';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: routerReplace, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(searchQuery),
}));

vi.mock('../../../providers/auth-provider', () => ({
  useAuth: () => ({
    login: vi.fn(),
    ssoLogin,
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
  ssoLogin.mockResolvedValue(undefined);
  searchQuery = '';
  goToLogin('');
});

afterEach(() => {
  cleanup();
});

describe('/login SSO callback', () => {
  it('exchanges the handoff token, scrubs it from the URL, and continues to returnTo', async () => {
    searchQuery = TOKEN_QUERY;
    goToLogin(TOKEN_QUERY);

    render(<LoginPage />);

    await waitFor(() => expect(ssoLogin).toHaveBeenCalledWith('QM-JWT'));

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

  it('prefers __quant_sso_ticket when several token params are present', async () => {
    searchQuery = 'token=OLD&__quant_sso_ticket=NEW-TICKET';
    goToLogin(searchQuery);

    render(<LoginPage />);

    await waitFor(() => expect(ssoLogin).toHaveBeenCalledWith('NEW-TICKET'));
  });

  it('shows an error and still scrubs the URL when the exchange fails', async () => {
    ssoLogin.mockRejectedValue(new Error('Quant Account sign-in failed.'));
    searchQuery = TOKEN_QUERY;
    goToLogin(TOKEN_QUERY);

    render(<LoginPage />);

    await waitFor(() => expect(ssoLogin).toHaveBeenCalled());
    expect(await screen.findByText(/Quant Account sign-in failed/)).toBeDefined();

    await waitFor(() => {
      const params = new URLSearchParams(window.location.search);
      expect(params.get('token')).toBeNull();
      expect(params.get('__quant_sso_ticket')).toBeNull();
    });
    expect(routerReplace).not.toHaveBeenCalled();
  });

  it('does not touch SSO when no token is in the URL', async () => {
    searchQuery = 'returnTo=%2Ftrending';
    goToLogin(searchQuery);

    render(<LoginPage />);

    // Let effects settle.
    await waitFor(() => expect(screen.getByText('Sign in to QuantWave')).toBeDefined());
    expect(ssoLogin).not.toHaveBeenCalled();
    expect(routerReplace).not.toHaveBeenCalled();
  });

  it('rejects an unsafe returnTo and falls back to /', async () => {
    searchQuery = 'returnTo=https%3A%2F%2Fevil.example%2F&token=QM-JWT';
    goToLogin(searchQuery);

    render(<LoginPage />);

    await waitFor(() => expect(ssoLogin).toHaveBeenCalledWith('QM-JWT'));
    await waitFor(() => expect(routerReplace).toHaveBeenCalledWith('/'));
  });
});
