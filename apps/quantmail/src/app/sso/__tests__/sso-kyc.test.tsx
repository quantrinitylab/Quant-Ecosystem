import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as AuthProviderModule from '../../../providers/auth-provider';
import { SsoChooserContent } from '../SsoChooserContent';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams('?returnTo=/dashboard'),
}));

vi.mock('../../../services/browser-auth-session', () => ({
  browserAuthSession: {
    getAccessToken: () => 'mock-token',
  },
}));

vi.mock('../../../components/QuantMailLogo', () => ({
  QuantMailLogo: () => <div data-testid="quantmail-logo" />,
}));

const mockLogin = vi.fn();

describe('SSO Flow (no phone-KYC gate)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();

    vi.spyOn(AuthProviderModule, 'useAuth').mockReturnValue({
      user: null,
      isLoading: false,
      isAuthenticated: false,
      error: null,
      isTwoFactorPending: false,
      login: mockLogin,
      completeTwoFactor: vi.fn(),
      cancelTwoFactor: vi.fn(),
      logout: vi.fn(),
    });
  });

  it('renders the sign-in form without any phone verification step', () => {
    const html = renderToString(<SsoChooserContent initialStage="credentials" />);

    expect(html).toContain('Sign in to Quant Account');
    expect(html).not.toContain('Quant Identity KYC');
    expect(html).not.toContain('Phone &amp; Email Verification');
    expect(html).not.toContain('Google KYC Parity');
  });

  it('does not render phone number input or OTP fields', () => {
    const html = renderToString(<SsoChooserContent initialStage="credentials" />);

    expect(html).not.toContain('Mobile Number');
    expect(html).not.toContain('6-Digit Code');
    expect(html).not.toContain('Verify &amp; Complete KYC');
  });

  it('renders two-factor stage when specified', () => {
    const html = renderToString(<SsoChooserContent initialStage="two-factor" />);

    expect(html).toContain('Two-Factor Authentication Code');
  });
});
