import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import LoginPage from '../pages/login';
import { AuroraMeshCanvas } from '../components/auth/AuroraMeshCanvas';

// Mock next/router
vi.mock('next/router', () => ({
  useRouter: () => ({
    query: { returnTo: '/reels' },
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

// Mock next/head
vi.mock('next/head', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock auth provider
vi.mock('../providers/auth-provider', () => ({
  useAuth: () => ({
    login: vi.fn(),
    isLoading: false,
    isAuthenticated: false,
    user: null,
  }),
}));

describe('QuantGram Creator Login UI/UX Parity (Instagram / TikTok Class)', () => {
  describe('1. AuroraMeshCanvas Component', () => {
    it('renders with canvas element and obsidian slate background style', () => {
      const html = renderToStaticMarkup(<AuroraMeshCanvas />);
      expect(html).toContain('<canvas');
      expect(html).toContain('bg-[#090A10]');
      expect(html).toContain('radial-gradient');
      expect(html).toContain('rgba(255, 94, 98'); // Sunset coral
      expect(html).toContain('rgba(217, 70, 239'); // Electric magenta
      expect(html).toContain('rgba(124, 58, 237'); // Deep violet
    });
  });

  describe('2. High-Fashion Creator-First Login Page Structure', () => {
    const markup = renderToStaticMarkup(<LoginPage />);

    it('renders the geometric aperture prism vector mark without cartoon logos', () => {
      expect(markup).toContain('<svg');
      expect(markup).toContain('viewBox="0 0 100 100"');
      expect(markup).toContain('qgApertureGrad');
      expect(markup).toContain('qgBladeGrad');
      expect(markup).toContain('qgPrismCore');
    });

    it('renders the exact required headline and subtitle', () => {
      expect(markup).toContain('QuantGram Creator Media');
      expect(markup).toContain('High-Octane Reels · Visual Stories · Sovereign Monetization');
    });

    it('renders the creator stats banner with 70% rev-share, zero censorship, 4k 120fps', () => {
      expect(markup).toContain('70% Direct Rev-Share · Zero Algorithm Censorship · 4K 120fps Streaming');
    });

    it('renders frosted glass card with high-fashion classes', () => {
      expect(markup).toContain('bg-[#11131A]/85');
      expect(markup).toContain('backdrop-blur-2xl');
      expect(markup).toContain('border-white/10');
      expect(markup).toContain('shadow-2xl');
    });

    it('renders hero SSO button with molten amber sheen and Quant Account link', () => {
      expect(markup).toContain('Continue with Quant Account');
      expect(markup).toContain('https://quantmail.in/sso');
      expect(markup).toContain('client_id=quantgram');
      expect(markup).toContain('from-[#FF5E62]');
      expect(markup).toContain('via-[#FF8C42]');
      expect(markup).toContain('to-[#D946EF]');
    });

    it('renders secondary clean email/password form with proper inputs', () => {
      expect(markup).toContain('id="login-email"');
      expect(markup).toContain('id="login-password"');
      expect(markup).toContain('type="email"');
      expect(markup).toContain('type="password"');
      expect(markup).toContain('Show password');
    });

    it('renders bottom links: Explore Grid, Watch Reels, Terms & Privacy', () => {
      expect(markup).toContain('Explore Grid');
      expect(markup).toContain('Watch Reels');
      expect(markup).toContain('Terms &amp; Privacy');
      expect(markup).toContain('href="/reels"');
      expect(markup).toContain('href="https://quantmail.in/terms"');
    });

    it('preserves registration link to create a QuantID', () => {
      expect(markup).toContain('Create a QuantID');
      expect(markup).toContain('href="https://quantmail.in/register"');
    });

    it('contains ZERO raw unicode emojis and uses pure SVG icons exclusively', () => {
      // Regex checking for common emoji blocks (including ⚡ \u26A1, emoticons, pictographs)
      const rawEmojiRegex = /[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
      const hasRawEmoji = rawEmojiRegex.test(markup);
      expect(hasRawEmoji).toBe(false);
    });
  });
});
