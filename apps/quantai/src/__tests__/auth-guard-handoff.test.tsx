// ============================================================================
// F-205 — AuthGuard SSO-handoff detection.
//
// Root cause: the old guard used `window.location.search.includes('token=')`,
// a raw substring match that false-positived on any query param whose VALUE
// merely contained the literal text (e.g. `?ref=token%3Dx`). On a false
// positive the guard skipped the /login redirect while `isAuthenticated`
// stayed false, stranding the visitor on a permanent "redirecting" screen.
//
// These tests pin the exact-key contract: the guard must treat a request as a
// handoff only when one of the keys `UniversalSSOTokenBridge.consumeHandoffTicket`
// actually reads is present with a non-empty value.
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { isSsoHandoffUrl, SSO_HANDOFF_KEYS } from '../lib/sso-handoff';
import { AuthGuard } from '../components/AuthGuard';

// Enable React 19 act environment in jsdom
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// ---------------------------------------------------------------------------
// Pure detection unit tests
// ---------------------------------------------------------------------------

describe('isSsoHandoffUrl', () => {
  it('matches the exact key set the bridge ingests (no drift)', () => {
    // UniversalSSOTokenBridge.consumeHandoffTicket reads these four keys.
    expect([...SSO_HANDOFF_KEYS].sort()).toEqual(
      ['__quant_sso_ticket', 'access_token', 'accessToken', 'token'].sort(),
    );
  });

  it('detects every exact handoff key', () => {
    expect(isSsoHandoffUrl('?__quant_sso_ticket=abc123')).toBe(true);
    expect(isSsoHandoffUrl('?token=eyJhbGciOi')).toBe(true);
    expect(isSsoHandoffUrl('?accessToken=tok')).toBe(true);
    expect(isSsoHandoffUrl('?access_token=tok')).toBe(true);
    expect(isSsoHandoffUrl('?foo=1&token=tok&bar=2')).toBe(true);
  });

  it('rejects F-205 substring false-positives: value contains "token=" but no exact key', () => {
    expect(isSsoHandoffUrl('?ref=token%3Dx')).toBe(false); // ref value decodes to "token=x"
    expect(isSsoHandoffUrl('?comment=has-token%3D-inside')).toBe(false);
    expect(isSsoHandoffUrl('?note=my%20token%3Dfoo')).toBe(false);
    expect(isSsoHandoffUrl('?next=/page%3Ftoken%3Dabc')).toBe(false);
    expect(isSsoHandoffUrl('?__quant_sso_tickets=abc')).toBe(false); // key suffix
    expect(isSsoHandoffUrl('?mytoken=abc')).toBe(false); // key prefix
  });

  it('treats present-but-empty keys as no handoff (bridge returns null for them too)', () => {
    expect(isSsoHandoffUrl('?token=')).toBe(false);
    expect(isSsoHandoffUrl('?__quant_sso_ticket=&foo=1')).toBe(false);
  });

  it('returns false for empty / missing / malformed input instead of throwing', () => {
    expect(isSsoHandoffUrl('')).toBe(false);
    expect(isSsoHandoffUrl(null)).toBe(false);
    expect(isSsoHandoffUrl(undefined)).toBe(false);
    expect(isSsoHandoffUrl('?')).toBe(false);
    expect(isSsoHandoffUrl('not a query at all ???')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Component behavior: the redirect must fire unless a REAL handoff is present
// ---------------------------------------------------------------------------

const hoisted = vi.hoisted(() => ({
  pathname: '/chat',
  isAuthenticated: false,
  isLoading: false,
  replace: vi.fn(),
  router: null as null | { replace: (...args: unknown[]) => void },
}));
hoisted.router = { replace: (...args: unknown[]) => hoisted.replace(...args) };

vi.mock('next/navigation', () => ({
  usePathname: () => hoisted.pathname,
  useRouter: () => hoisted.router,
}));

vi.mock('../providers/auth-provider', () => ({
  useAuth: () => ({
    isAuthenticated: hoisted.isAuthenticated,
    isLoading: hoisted.isLoading,
  }),
}));

// Stub shared-ui's AuthPending so we observe the guard's decision, not the
// spinner copy.
vi.mock('@quant/shared-ui', () => ({
  AuthPending: ({ state }: { state: string }) => (
    <div data-testid="auth-pending" data-state={state}>
      pending:{state}
    </div>
  ),
}));

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function setUrl(path: string) {
  window.history.replaceState({}, '', path);
}

function renderGuard() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <AuthGuard>
        <div data-testid="child">secret content</div>
      </AuthGuard>,
    );
  });
}

function unmountGuard() {
  if (root) {
    act(() => root!.unmount());
    root = null;
  }
  container?.remove();
  container = null;
  setUrl('/');
}

beforeEach(() => {
  hoisted.pathname = '/chat';
  hoisted.isAuthenticated = false;
  hoisted.isLoading = false;
  hoisted.replace.mockClear();
  vi.useRealTimers();
});

afterEach(() => {
  unmountGuard();
});

describe('AuthGuard handoff behavior (F-205)', () => {
  it('skips the /login redirect when a real SSO ticket is in the URL', () => {
    setUrl('/chat?__quant_sso_ticket=abc123');
    renderGuard();
    expect(hoisted.replace).not.toHaveBeenCalled();
    expect(container!.querySelector('[data-testid="auth-pending"]')).not.toBeNull();
  });

  it('redirects unauthenticated visitors even when a query VALUE contains "token="', () => {
    // The old substring heuristic false-positived here and stranded the user.
    setUrl('/chat?ref=token%3Dx');
    renderGuard();
    expect(hoisted.replace).toHaveBeenCalledTimes(1);
    expect(hoisted.replace).toHaveBeenCalledWith('/login?returnTo=%2Fchat');
  });

  it('redirects when the only candidate key is present but empty', () => {
    setUrl('/chat?token=');
    renderGuard();
    expect(hoisted.replace).toHaveBeenCalledTimes(1);
    expect(hoisted.replace).toHaveBeenCalledWith('/login?returnTo=%2Fchat');
  });

  it('redirects plain unauthenticated deep links with no handoff keys', () => {
    setUrl('/chat');
    renderGuard();
    expect(hoisted.replace).toHaveBeenCalledWith('/login?returnTo=%2Fchat');
  });

  it('leaves public routes untouched (no redirect on /login)', () => {
    hoisted.pathname = '/login';
    setUrl('/login');
    renderGuard();
    expect(hoisted.replace).not.toHaveBeenCalled();
    expect(container!.querySelector('[data-testid="child"]')).not.toBeNull();
  });

  it('renders the protected content for authenticated users', () => {
    hoisted.isAuthenticated = true;
    setUrl('/chat?ref=token%3Dx');
    renderGuard();
    expect(hoisted.replace).not.toHaveBeenCalled();
    expect(container!.querySelector('[data-testid="child"]')).not.toBeNull();
  });

  it('escalates to an honest clickable /login link if the redirect never fires', () => {
    vi.useFakeTimers();
    setUrl('/chat');
    renderGuard();
    // Redirect was issued...
    expect(hoisted.replace).toHaveBeenCalledWith('/login?returnTo=%2Fchat');
    // ...but navigation never happened; after the stall timeout the guard
    // must render a real link instead of a silent "redirecting" screen.
    act(() => {
      vi.advanceTimersByTime(10_001);
    });
    const link = container!.querySelector('a[href^="/login"]');
    expect(link).not.toBeNull();
    expect(link!.getAttribute('href')).toBe('/login?returnTo=%2Fchat');
    expect(container!.textContent).toContain('Go to sign in');
    vi.useRealTimers();
  });
});
