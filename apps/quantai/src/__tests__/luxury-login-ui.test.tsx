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

const { NeuralFieldCanvas } = await import('../components/auth/NeuralFieldCanvas');
const LoginPageModule = await import('../app/login/page');
const LoginPage = LoginPageModule.default;

describe('QuantAI Luxury Neural Login UI/UX Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('NeuralFieldCanvas', () => {
    it('renders ambient canvas with accessible aria-hidden flag and pointer-events-none', () => {
      const html = renderToStaticMarkup(
        React.createElement(NeuralFieldCanvas, { className: 'opacity-60' })
      );
      expect(html).toContain('<canvas');
      expect(html).toContain('aria-hidden="true"');
      expect(html).toContain('pointer-events-none');
      expect(html).toContain('opacity-60');
    });
  });

  describe('LoginPage', () => {
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

    it('renders hero SSO button with obsidian-titanium style and pure SVG vector mark', () => {
      const html = renderToStaticMarkup(React.createElement(LoginPage));
      expect(html).toContain('Continue with QuantMail');
      // Verify SVG polygon for the lightning bolt
      expect(html).toContain('<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"');
    });

    it('offers Forgot password next to the password field (no enumeration hints)', () => {
      const html = renderToStaticMarkup(React.createElement(LoginPage));
      expect(html).toContain('Forgot password?');
      expect(html).not.toContain('if an account exists');
    });

    it('renders geometric AI core lattice vector mark with gradient defs', () => {
      const html = renderToStaticMarkup(React.createElement(LoginPage));
      expect(html).toContain('id="ai-core-grad-1"');
      expect(html).toContain('id="ai-core-grad-2"');
      expect(html).toContain('id="ai-core-glow"');
    });

    it('renders high-density email and password credential inputs', () => {
      const html = renderToStaticMarkup(React.createElement(LoginPage));
      expect(html).toContain('id="login-email"');
      expect(html).toContain('id="login-password"');
      expect(html).toContain('placeholder="you@quantmail.in"');
      expect(html).toContain('Sign in with Email');
    });

    it('renders ecosystem registration link without invented security claims', () => {
      const html = renderToStaticMarkup(React.createElement(LoginPage));
      expect(html).toContain('https://quantmail.in/register');
      expect(html).toContain('Create a QuantID');
      expect(html).not.toContain('End-to-End Sovereign Encryption');
      expect(html).not.toContain('Zero Telemetry Leakage');
    });

    it('guarantees ZERO raw Unicode emojis across the rendered markup', () => {
      const html = renderToStaticMarkup(React.createElement(LoginPage));
      // Emoji Unicode ranges regex: ensures no emoji glyphs (like ⚡, 🔒, etc.) are raw text
      const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
      expect(emojiRegex.test(html)).toBe(false);
    });
  });
});
