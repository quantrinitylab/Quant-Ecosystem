import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import Page from '../page';
import LoginPage from '../../../components/auth/LoginPage';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/login',
}));

describe('QuantChat SSO-primary Login UI — LoginPage & Page', () => {
  it('renders dark luxury container with emerald/violet ambient glows via Page', () => {
    const html = renderToString(<Page />);

    // Edge-to-edge dark luxury design tokens
    expect(html).toContain('bg-[#090D16]');
    expect(html).toContain('bg-emerald-500/15');
    expect(html).toContain('bg-violet-600/15');
    expect(html).toContain('backdrop-blur-2xl');
    expect(html).toContain('Sign in to QuantChat');
  });

  it('promotes Continue with Quant Account as the primary login method', () => {
    const html = renderToString(<Page />);

    // Primary SSO hero button
    expect(html).toContain('data-testid="quant-sso-primary-btn"');
    expect(html).toContain('Continue with Quant Account');
    expect(html).not.toContain('QuantMail SSO');

    // Secondary email/password form still available
    expect(html).toContain('id="identifier"');
    expect(html).toContain('id="password"');
    expect(html).toContain('data-testid="identifier-input"');
    expect(html).toContain('data-testid="password-input"');
    expect(html).toContain('data-testid="submit-password-btn"');
    expect(html).toContain('or sign in with email &amp; password');
  });

  it('has no phone OTP UI anywhere', () => {
    const html = renderToString(<Page />);

    // Phone OTP tab, inputs and buttons must be gone
    expect(html).not.toContain('data-testid="tab-phone-otp"');
    expect(html).not.toContain('data-testid="tab-quant-sso"');
    expect(html).not.toContain('data-testid="phone-view-sso-btn"');
    expect(html).not.toContain('data-testid="country-code-select"');
    expect(html).not.toContain('data-testid="phone-input"');
    expect(html).not.toContain('id="phone"');
    expect(html).not.toContain('Send Verification Code');
    expect(html).not.toContain('Phone OTP');

    // OTP verification UI must be gone
    expect(html).not.toContain('data-testid="otp-boxes-container"');
    expect(html).not.toContain('data-testid="otp-input"');
    expect(html).not.toContain('data-testid="verify-otp-btn"');
    expect(html).not.toContain('data-testid="resend-code-btn"');
    expect(html).not.toContain('data-testid="change-number-btn"');
    expect(html).not.toContain('verification code');

    // No dev shortcuts leak
    expect(html).not.toContain('data-testid="quick-test-chip"');
    expect(html).not.toContain('data-testid="demo-otp-banner"');
    expect(html).not.toContain('Auto-Fill Demo OTP');
  });

  it('renders the same SSO-primary UI for the bare LoginPage component', () => {
    const html = renderToString(<LoginPage />);

    expect(html).toContain('data-testid="quant-sso-primary-btn"');
    expect(html).toContain('Use your QuantMail account to continue.');
    expect(html).toContain('id="identifier"');
    expect(html).toContain('id="password"');
  });
});
