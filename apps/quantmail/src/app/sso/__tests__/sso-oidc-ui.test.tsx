// ============================================================================
// Tests for the /sso OIDC UI branch (fix/qm-oauth-authorize-302).
//
// Proves: when /sso carries a real OIDC authorize request the chooser names
// the exact requested scopes (honest approval surface); plain ecosystem SSO
// visits show no such line (behavior unchanged).
// ============================================================================

import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as AuthProviderModule from '../../../providers/auth-provider';
import { SsoChooserContent } from '../SsoChooserContent';

let currentQuery = '?returnTo=/dashboard';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(currentQuery),
}));

vi.mock('../../../services/browser-auth-session', () => ({
  browserAuthSession: {
    getAccessToken: () => 'mock-token',
    refresh: vi.fn(),
  },
}));

vi.mock('../../../components/QuantMailLogoStatic', () => ({
  QuantMailLogoStatic: () => <div data-testid="quantmail-logo" />,
}));

vi.mock('../../../components/TitaniumGridCanvas', () => ({
  TitaniumGridCanvas: () => <div data-testid="titanium-grid" />,
}));

describe('SsoChooserContent OIDC branch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
    currentQuery = '?returnTo=/dashboard';

    vi.spyOn(AuthProviderModule, 'useAuth').mockReturnValue({
      user: null,
      isLoading: false,
      isAuthenticated: false,
      error: null,
      isTwoFactorPending: false,
      login: vi.fn(),
      completeTwoFactor: vi.fn(),
      cancelTwoFactor: vi.fn(),
      logout: vi.fn(),
    });
  });

  it('names the requested scopes for an OIDC authorize request', () => {
    currentQuery =
      '?response_type=code' +
      '&client_id=client_abc123' +
      '&redirect_uri=' + encodeURIComponent('https://app.example.com/oauth/callback') +
      '&scope=' + encodeURIComponent('openid profile email') +
      '&state=xyz';
    const html = renderToString(<SsoChooserContent />);

    expect(html).toContain('Requests access to:');
    expect(html).toContain('openid');
    expect(html).toContain('profile');
    expect(html).toContain('email');
    // No divider lines in the added UI
    expect(html).not.toContain('<hr');
  });

  it('detects OIDC via the /oauth/authorize returnTo mapping too', () => {
    currentQuery =
      '?response_type=code' +
      '&client_id=client_abc123' +
      '&returnTo=' + encodeURIComponent('https://app.example.com/oauth/callback') +
      '&scope=' + encodeURIComponent('openid email');
    const html = renderToString(<SsoChooserContent />);
    expect(html).toContain('Requests access to:');
  });

  it('shows no scopes line for plain ecosystem SSO visits', () => {
    currentQuery = '?returnTo=/dashboard&client_id=quantchat';
    const html = renderToString(<SsoChooserContent />);
    expect(html).not.toContain('Requests access to:');
    // Ecosystem chooser copy unchanged
    expect(html).toContain('Sign in to Quant Account');
  });

  it('shows no scopes line for plain ecosystem visits with an absolute returnTo', () => {
    currentQuery = '?returnTo=' + encodeURIComponent('https://quantchat.in/app') + '&client_id=quantchat';
    const html = renderToString(<SsoChooserContent />);
    expect(html).not.toContain('Requests access to:');
  });

  it('shows no scopes line for partial OIDC requests (never claimed as an OIDC flow)', () => {
    currentQuery = '?response_type=code&client_id=client_abc123&state=xyz';
    const html = renderToString(<SsoChooserContent />);
    expect(html).not.toContain('Requests access to:');
    expect(html).toContain('This sign-in link is incomplete');
  });

  it('flags an unsupported response_type as an incomplete sign-in link', () => {
    currentQuery =
      '?response_type=token&client_id=client_abc123&redirect_uri=' +
      encodeURIComponent('https://app.example.com/oauth/callback');
    const html = renderToString(<SsoChooserContent />);
    expect(html).not.toContain('Requests access to:');
    expect(html).toContain('This sign-in link is incomplete');
  });
});
