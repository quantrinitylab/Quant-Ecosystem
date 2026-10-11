// ============================================================================
// QuantChat - login page password-recovery link (P1, live audit 2026-10-11)
//
// QuantChat had NO recovery path: no Forgot Password link anywhere and
// /forgot-password bounced back to /login. Recovery is hosted on QuantMail
// (the identity host, same SSO base as the Create account link), so the
// password form now links there; src/app/forgot-password/page.tsx performs
// the same handoff for direct visits.
// ============================================================================
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import LoginPage from '../../../components/auth/LoginPage';

const stableRouter = { push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() };

vi.mock('next/navigation', () => ({
  useRouter: () => stableRouter,
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/login',
}));

describe('LoginPage forgot-password link', () => {
  it('links the password form to the QuantMail recovery flow', () => {
    const html = renderToString(<LoginPage />);
    expect(html).toContain('data-testid="forgot-password-link"');
    expect(html).toContain('href="https://quantmail.in/forgot-password"');
    expect(html).toContain('Forgot password?');
  });

  it('points Create account at the same identity host (consistency)', () => {
    const html = renderToString(<LoginPage />);
    expect(html).toContain('href="https://quantmail.in/register"');
  });
});
