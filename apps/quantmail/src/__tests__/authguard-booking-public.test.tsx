// @vitest-environment jsdom
// fix/qm-booking-guest-bounce — public calendar booking links must not
// hard-bounce signed-out guests to /login.
//
// - AuthGuard is a pure-black-shell gate; the booking flow page header states
//   "Completely public page: NO auth gate, unauthenticated guests can book!".
//   A signed-out guest opening /calendar/booking/<slug> must see the flow
//   (or the honest dead-link state for a bad slug), never a /login redirect.
// - The dead-link honesty panel (fix/qm-booking-deadlink-details) is guest-
//   observable: a bad slug 404s on the public GET and must render
//   "Booking link not found" signed-out.
//
// Test strategy follows the repo's established component-test pattern
// (renderToStaticMarkup + module mocks, see booking-page.test.tsx); the
// async dead-link panel assertion mounts the page in jsdom because the panel
// only appears after the link-load fetch settles (effects do not run in
// static markup).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// React 19 act() requires this flag in the jsdom test environment.
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const authState = vi.hoisted(() => ({
  isLoading: false,
  isAuthenticated: false,
  user: null as { email: string } | null,
}));
const navState = vi.hoisted(() => ({ pathname: '/' }));
const apiFetchRawMock = vi.hoisted(() => vi.fn());

vi.mock('../providers/auth-provider', () => ({
  useAuth: () => authState,
}));
vi.mock('next/navigation', () => ({
  usePathname: () => navState.pathname,
}));
vi.mock('@quant/shared-ui', () => ({
  LoadingState: ({ text }: { text?: string }) => <div data-testid="loading">{text}</div>,
}));
// The booking page talks to the same-origin Next proxy via @quant/api-client.
// Stub it so the dead-link assertion controls the backend answer per test.
vi.mock('@quant/api-client', () => ({
  apiFetchRaw: apiFetchRawMock,
}));

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthGuard } from '../components/AuthGuard';
import PublicBookingPage from '../app/(app)/calendar/booking/[slug]/page';

const CONTENT_MARKER = 'booking-guest-content-marker';

function renderGuard(pathname: string, authenticated: boolean): string {
  navState.pathname = pathname;
  authState.isLoading = false;
  authState.isAuthenticated = authenticated;
  authState.user = authenticated ? { email: 'me@quantmail.in' } : null;
  return renderToStaticMarkup(
    <AuthGuard>
      <div data-marker={CONTENT_MARKER}>booking flow</div>
    </AuthGuard>,
  );
}

describe('AuthGuard: /calendar/booking/* is public for signed-out guests (fix/qm-booking-guest-bounce)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.isLoading = false;
    authState.isAuthenticated = false;
    authState.user = null;
  });

  it('renders children for a signed-out guest on /calendar/booking/<slug>', () => {
    const html = renderGuard('/calendar/booking/host-slug-123', false);
    expect(html).toContain(CONTENT_MARKER);
  });

  it('renders children for a signed-out guest on a nested booking path', () => {
    const html = renderGuard('/calendar/booking/host-slug-123/confirm', false);
    expect(html).toContain(CONTENT_MARKER);
  });

  it('still hard-gates private surfaces for signed-out visitors (no regression)', () => {
    // AuthGuard returns null for private pages when signed out; the page
    // itself never reaches the browser — the login redirect fires instead.
    // NOTE (fix/qm-unknown-route-404): /inbox is not a real route — it is
    // unknown and now renders the branded 404's children instead of gating.
    expect(renderGuard('/calendar', false)).not.toContain(CONTENT_MARKER);
    expect(renderGuard('/drive', false)).not.toContain(CONTENT_MARKER);
    expect(renderGuard('/settings/account', false)).not.toContain(CONTENT_MARKER);
  });

  it('renders children for unknown routes signed-out (branded 404, fix/qm-unknown-route-404)', () => {
    // Dead links must reach not-found.tsx, never bounce to /login.
    expect(renderGuard('/no-such-page-xyz', false)).toContain(CONTENT_MARKER);
    expect(renderGuard('/inbox', false)).toContain(CONTENT_MARKER);
    expect(renderGuard('/invitations', false)).toContain(CONTENT_MARKER);
  });

  it('renders children while loading on unknown routes (no auth spinner on the 404)', () => {
    navState.pathname = '/no-such-page-xyz';
    authState.isLoading = true;
    authState.isAuthenticated = false;
    const html = renderToStaticMarkup(
      <AuthGuard>
        <div data-marker={CONTENT_MARKER}>not found</div>
      </AuthGuard>,
    );
    expect(html).toContain(CONTENT_MARKER);
    expect(html).not.toContain('Authenticating...');
  });

  it('keeps exact PUBLIC_PATHS working for signed-out visitors (no regression)', () => {
    expect(renderGuard('/login', false)).toContain(CONTENT_MARKER);
    expect(renderGuard('/register', false)).toContain(CONTENT_MARKER);
    expect(renderGuard('/invite/abc123', false)).toContain(CONTENT_MARKER);
    expect(renderGuard('/groups/join/team-1', false)).toContain(CONTENT_MARKER);
  });

  it('renders private surfaces for signed-in users (no regression)', () => {
    expect(renderGuard('/inbox', true)).toContain(CONTENT_MARKER);
    expect(renderGuard('/calendar/booking/host-slug-123', true)).toContain(CONTENT_MARKER);
  });
});

describe('Booking page: bad slug renders the honest dead-link state signed-out (fix/qm-booking-deadlink-details + fix/qm-booking-guest-bounce)', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    apiFetchRawMock.mockReset();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('shows "Booking link not found" for a bad slug instead of bouncing or inventing the booking UI', async () => {
    // Signed-out guest: the public GET 404s for an unknown slug.
    apiFetchRawMock.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: { message: 'Booking link not found' } }),
    });

    await act(async () => {
      root.render(
        <PublicBookingPage params={Promise.resolve({ slug: 'dead-slug-xyz' })} />,
      );
      // Flush the params unwrap + link-load fetch effects.
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    // The fetch resolution lands while we poll, so poll inside act() to keep
    // the resulting state update inside React's test scope.
    await act(async () => {
      await vi.waitFor(() => {
        expect(container.textContent).toContain('Booking link not found');
      });
    });

    // The honest panel replaces the booking flow — no slot picker, no
    // confirm button, no invented meeting details for the dead slug.
    expect(container.textContent).not.toContain('Confirm Booking');
    expect(container.textContent).not.toContain('Select a Date');
    // No slot fetch was attempted for a dead link.
    expect(apiFetchRawMock).toHaveBeenCalledTimes(1);
    expect(apiFetchRawMock).toHaveBeenCalledWith('/api/calendar/booking/dead-slug-xyz');
  });
});
