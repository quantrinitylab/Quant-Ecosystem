import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import Page from '../page';
import LoginPage from '../../../components/auth/LoginPage';
import CryptographicMeshCanvas from '../../../components/auth/CryptographicMeshCanvas';

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

    // Edge-to-edge dark luxury design tokens (single background token on main)
    expect(html).toContain('bg-[#080B12]');
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

  it('renders the WebGL/Canvas Cryptographic Constellation Mesh with dark obsidian canvas', () => {
    const html = renderToString(<LoginPage />);

    expect(html).toContain('data-testid="cryptographic-mesh-canvas"');
    expect(html).toContain('pointer-events-none');

    // Test standalone CryptographicMeshCanvas render
    const canvasHtml = renderToString(<CryptographicMeshCanvas className="custom-canvas" nodeCount={30} />);
    expect(canvasHtml).toContain('data-testid="cryptographic-mesh-canvas"');
    expect(canvasHtml).toContain('custom-canvas');
  });

  it('renders honest sign-in copy: no unprovable crypto claims', () => {
    const html = renderToString(<LoginPage />);

    // Headline kept; subtitle is a plain instruction
    expect(html).toContain('QuantChat Sovereign Communications');
    expect(html).toContain('Sign in to QuantChat. Use your QuantMail account to continue.');

    // Unprovable crypto claims must be gone
    expect(html).not.toContain('End-to-End Encrypted · Zero-Knowledge Relay');
    expect(html).not.toContain('data-testid="status-pill-e2ee"');
    expect(html).not.toContain('E2EE · X25519-ECIES');
    expect(html).not.toContain('256-Bit Quantum Resistant');
    expect(html).not.toContain('Zero password transmission');
    expect(html).not.toContain('data-testid="security-metrics-banner"');

    // E2EE shield/beacon vector marks present (no tacky raw letter Q box)
    expect(html).toContain('<svg');
    expect(html).not.toContain('>Q</span>');
  });

  it('consolidates sign-in to one primary Quant Account path with a subtle password fallback', () => {
    const html = renderToString(<LoginPage />);

    // Duplicate tab navigation must be gone
    expect(html).not.toContain('data-testid="tab-sso-view"');
    expect(html).not.toContain('data-testid="tab-password-view"');
    expect(html).not.toContain('Instant Quant SSO');
    expect(html).not.toContain('Direct Password / Email');

    // One primary path only
    expect(html).toContain('data-testid="quant-sso-primary-btn"');
    expect(html).toContain('Continue with Quant Account');

    // Password login remains as a subtle inline fallback (still in DOM, toggled)
    expect(html).toContain('data-testid="identifier-input"');
    expect(html).toContain('data-testid="password-input"');
    expect(html).toContain('data-testid="submit-password-btn"');
    expect(html).toContain('or sign in with email &amp; password');
    expect(html).toContain('Back to Quant Account');
  });

  it('does not render the removed security-metrics banner', () => {
    const html = renderToString(<LoginPage />);

    expect(html).not.toContain('data-testid="security-metrics-banner"');
    expect(html).not.toContain('Multi-Device Sync');
    expect(html).not.toContain('No Data Brokerage');
  });

  it('enforces ZERO raw Unicode emojis across the entire login UI', () => {
    const html = renderToString(<LoginPage />);

    // Strict zero-emoji check: no raw lightning bolt unicode character
    expect(html).not.toContain('⚡');
    // Common emoji unicodes
    expect(html).not.toMatch(/[\u{1F300}-\u{1F9FF}]/u);
  });
});
