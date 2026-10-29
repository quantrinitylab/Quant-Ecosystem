import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => ({
    get: vi.fn().mockReturnValue(null),
  }),
}));

// Mock auth provider
vi.mock('../providers/auth-provider', () => ({
  useAuth: () => ({
    login: vi.fn(),
    isLoading: false,
    isAuthenticated: false,
  }),
}));

// Mock BrandProvider
vi.mock('../components/BrandProvider', () => ({
  useBrandName: () => 'QuantAI',
}));

// Mock UniversalSSOTokenBridge
vi.mock('@quant/shared-ui', () => ({
  UniversalSSOTokenBridge: {
    getInstance: () => ({
      consumeHandoffTicket: vi.fn().mockResolvedValue(null),
      decodeUnverifiedHandoffTicket: vi.fn().mockReturnValue(null),
    }),
    validateSafeReturnPath: vi.fn().mockReturnValue({ isSafe: true, sanitizedUrl: '/' }),
  },
}));

const LoginPageModule = await import('../app/login/page');
const LoginPage = LoginPageModule.default;

describe('QuantAI Login Card (SSO-primary hierarchy)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a "Forgot password?" link-out to QuantMail (the identity root)', () => {
    const html = renderToStaticMarkup(React.createElement(LoginPage));
    expect(html).toContain('Forgot password?');
    expect(html).toContain('href="https://quantmail.in/forgot-password"');
  });

  it('renders an honest "or" divider with no "credentials" label', () => {
    const html = renderToStaticMarkup(React.createElement(LoginPage));
    expect(html).toContain('>or<');
    expect(html).not.toContain('or credentials');
    expect(html).not.toContain('OR CREDENTIALS');
  });

  it('labels the registration link-out as QuantMail explicitly', () => {
    const html = renderToStaticMarkup(React.createElement(LoginPage));
    expect(html).toContain('Create a QuantID on QuantMail');
    expect(html).toContain('href="https://quantmail.in/register"');
  });

  it('keeps email sign-in as the secondary path', () => {
    const html = renderToStaticMarkup(React.createElement(LoginPage));
    expect(html).toContain('Sign in with Email');
  });

  it('keeps the SSO hero button as the primary path', () => {
    const html = renderToStaticMarkup(React.createElement(LoginPage));
    expect(html).toContain('Continue with Quant Account');
  });

  it('adds no footer links to /terms or /privacy', () => {
    const html = renderToStaticMarkup(React.createElement(LoginPage));
    expect(html).not.toContain('href="/terms"');
    expect(html).not.toContain('href="/privacy"');
  });

  it('guarantees ZERO raw Unicode emojis across the rendered markup', () => {
    const html = renderToStaticMarkup(React.createElement(LoginPage));
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    expect(emojiRegex.test(html)).toBe(false);
  });
});
