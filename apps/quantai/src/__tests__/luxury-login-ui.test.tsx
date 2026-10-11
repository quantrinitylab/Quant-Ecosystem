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

const { NeuralFieldCanvas } = await import('../components/auth/NeuralFieldCanvas');
const LoginPageModule = await import('../app/login/page');
const LoginPage = LoginPageModule.default;

describe('QuantAI Professional Login UI/UX Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('NeuralFieldCanvas', () => {
    it('renders ambient canvas with accessible aria-hidden flag and pointer-events-none', () => {
      const html = renderToStaticMarkup(
        React.createElement(NeuralFieldCanvas, { className: 'opacity-40', interactive: false })
      );
      expect(html).toContain('<canvas');
      expect(html).toContain('aria-hidden="true"');
      expect(html).toContain('pointer-events-none');
    });
  });

  describe('LoginPage', () => {
    it('renders the official QuantAI brand lockup, not a placeholder mark', () => {
      const html = renderToStaticMarkup(React.createElement(LoginPage));
      expect(html).toContain('aria-label="QuantAI"');
      // The old placeholder diamond lattice must be gone
      expect(html).not.toContain('ai-core-grad-1');
      expect(html).not.toContain('ai-core-glow');
    });

    it('renders an honest headline and subtitle (no invented claims)', () => {
      const html = renderToStaticMarkup(React.createElement(LoginPage));
      expect(html).toContain('QuantAI');
      expect(html).toContain('Sign in to chat with AI');
      expect(html).not.toContain('Sovereign Intelligence');
      expect(html).not.toContain('Frontier Agent OS');
      expect(html).not.toContain('Neural Canvas');
    });

    it('does not render a fake telemetry status pill', () => {
      const html = renderToStaticMarkup(React.createElement(LoginPage));
      expect(html).not.toContain('Quanty 3.8 Flash Active');
      expect(html).not.toContain('Voice Latency');
    });

    it('renders the Continue with QuantMail SSO hero with first-visit helper copy', () => {
      const html = renderToStaticMarkup(React.createElement(LoginPage));
      expect(html).toContain('Continue with QuantMail');
      expect(html).toContain('One account for the ecosystem — no new password needed');
      expect(html).toContain('Already have a QuantMail account?');
      expect(html).toContain('your account stays safe');
      expect(html).not.toContain('Continue with Quant Account');
      expect(html).toContain('<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"');
    });

    it('routes Forgot password? to QuantMail password reset', () => {
      const html = renderToStaticMarkup(React.createElement(LoginPage));
      expect(html).toContain('Forgot password?');
      expect(html).toContain('https://quantmail.in/forgot-password');
    });

    it('renders accessible email and password credential inputs', () => {
      const html = renderToStaticMarkup(React.createElement(LoginPage));
      expect(html).toContain('id="login-email"');
      expect(html).toContain('id="login-password"');
      expect(html).toContain('placeholder="you@quantmail.in"');
      expect(html).toContain('Sign in with Email');
      expect(html).toContain('for="login-email"');
      expect(html).toContain('Show password');
    });

    it('renders an honest QuantID creation section without invented security claims', () => {
      const html = renderToStaticMarkup(React.createElement(LoginPage));
      expect(html).toContain('https://quantmail.in/register');
      expect(html).toContain('Create a QuantID');
      // Honest about the cross-domain hop
      expect(html).toContain('create it on QuantMail');
      expect(html).not.toContain('End-to-End Sovereign Encryption');
      expect(html).not.toContain('Zero Telemetry Leakage');
    });

    it('renders an honest footer', () => {
      const html = renderToStaticMarkup(React.createElement(LoginPage));
      expect(html).toContain('Your chats are tied to your Quant account');
    });

    it('guarantees ZERO raw Unicode emojis across the rendered markup', () => {
      const html = renderToStaticMarkup(React.createElement(LoginPage));
      const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
      expect(emojiRegex.test(html)).toBe(false);
    });
  });
});
