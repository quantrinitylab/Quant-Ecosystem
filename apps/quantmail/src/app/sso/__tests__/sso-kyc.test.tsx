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

describe('SSO Phone KYC Flow', () => {
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

  it('renders phone KYC form if user is not phoneVerified', () => {
    const html = renderToString(<SsoChooserContent initialStage="phone-kyc" />);

    expect(html).toContain('Quant Identity KYC');
    expect(html).toContain('Phone Verification');
    expect(html).toContain('Google KYC Parity');
    expect(html).toContain('+91');
    expect(html).toContain('Send Verification Code');
  });

  it('renders the demo OTP auto-fill chip when OTP is sent', () => {
    const demoInfo = { isDemo: true, demoCode: '123456', message: 'Demo mode activated' };
    const html = renderToString(
      <SsoChooserContent
        initialStage="phone-kyc"
        initialKycOtpSent={true}
        initialKycDemoInfo={demoInfo}
      />,
    );

    expect(html).toContain('✨ Auto-Fill Demo OTP: <!-- -->123456');
    expect(html).toContain('Verify &amp; Complete KYC ✓');
  });
});
