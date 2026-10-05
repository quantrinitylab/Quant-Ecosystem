import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import Page from '../page';
import LoginPage, { COUNTRIES } from '../../../components/auth/LoginPage';

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

describe('QuantChat Luxury Phone Login UI — LoginPage & Page', () => {
  it('renders dark luxury container with emerald/violet ambient glows via Page', () => {
    const html = renderToString(<Page />);

    // Edge-to-edge dark luxury design tokens
    expect(html).toContain('bg-[#090D16]');
    expect(html).toContain('bg-emerald-500/15');
    expect(html).toContain('bg-violet-600/15');
    expect(html).toContain('backdrop-blur-2xl');
    expect(html).toContain('Sign in to QuantChat');
  });

  it('renders country code options (+91, +1, etc.) and phone input (no dev shortcuts)', () => {
    const html = renderToString(<Page />);

    // Country code selector & options
    expect(html).toContain('data-testid="country-code-select"');
    expect(html).toContain('+91');
    expect(html).toContain('🇮🇳');
    expect(html).toContain('+1');
    expect(html).toContain('🇺🇸');
    expect(html).toContain('+44');
    expect(html).toContain('🇬🇧');
    expect(html).toContain('+971');
    expect(html).toContain('🇦🇪');
    expect(html).toContain('+65');
    expect(html).toContain('🇸🇬');
    expect(html).toContain('+49');
    expect(html).toContain('🇩🇪');
    expect(html).toContain('+33');
    expect(html).toContain('🇫🇷');

    // Dev-only Quick Test chip must NOT ship to production
    expect(html).not.toContain('data-testid="quick-test-chip"');
    expect(html).not.toContain('Quick Test: +91 9876543210');

    // Phone input
    expect(html).toContain('id="phone"');
    expect(html).toContain('placeholder="Phone number"');
    expect(html).toContain('data-testid="phone-input"');
    expect(html).toContain('Send Verification Code →');

    // Continue with Quant Account option (ecosystem-consistent wording)
    expect(html).toContain('Continue with Quant Account');
    expect(html).not.toContain('QuantMail SSO');
    expect(html).toContain('data-testid="tab-quant-sso"');
    expect(html).toContain('data-testid="phone-view-sso-btn"');
  });

  it('renders OTP state with 6-digit input boxes (demo banner hidden in non-dev)', () => {
    const html = renderToString(<LoginPage initialStep="otp" initialPhoneNumber="9876543210" />);

    // Demo banner should NOT appear in test/production (dev-only)
    expect(html).not.toContain('data-testid="demo-otp-banner"');
    expect(html).not.toContain('✨ Auto-Fill Demo OTP:');

    // 6-digit input boxes
    expect(html).toContain('data-testid="otp-boxes-container"');
    expect(html).toContain('data-testid="otp-box-0"');
    expect(html).toContain('data-testid="otp-box-1"');
    expect(html).toContain('data-testid="otp-box-2"');
    expect(html).toContain('data-testid="otp-box-3"');
    expect(html).toContain('data-testid="otp-box-4"');
    expect(html).toContain('data-testid="otp-box-5"');

    // Underlying numeric input and buttons
    expect(html).toContain('id="otp"');
    expect(html).toContain('data-testid="otp-input"');
    expect(html).toContain('Verify &amp; Enter QuantChat');
    expect(html).toContain('data-testid="change-number-btn"');
    expect(html).toContain('data-testid="resend-code-btn"');
  });

  it('hides demo OTP banner in non-development environments', () => {
    const html = renderToString(
      <LoginPage initialStep="otp" initialPhoneNumber="9876543210" initialDemoCode="654321" />,
    );

    // Demo banner is dev-only, should not leak to test/prod
    expect(html).not.toContain('✨ Auto-Fill Demo OTP:');
    expect(html).not.toContain('data-testid="demo-otp-banner"');
  });

  it('renders Continue with Quant Account tab and credentials view', () => {
    const html = renderToString(<LoginPage initialAuthMode="password" />);

    expect(html).toContain('id="identifier"');
    expect(html).toContain('id="password"');
    expect(html).toContain('data-testid="quantmail-sso-btn"');
    expect(html).toContain('Continue with Quant Account');
  });

  it('verifies COUNTRIES list integrity with all 7 supported international locales', () => {
    expect(COUNTRIES).toHaveLength(7);
    const codes = COUNTRIES.map((c) => c.code);
    expect(codes).toEqual(['+91', '+1', '+44', '+971', '+65', '+49', '+33']);

    const india = COUNTRIES.find((c) => c.code === '+91');
    expect(india?.flag).toBe('🇮🇳');
    expect(india?.label).toBe('India');

    const usa = COUNTRIES.find((c) => c.code === '+1');
    expect(usa?.flag).toBe('🇺🇸');

    const uae = COUNTRIES.find((c) => c.code === '+971');
    expect(uae?.flag).toBe('🇦🇪');
  });
});
