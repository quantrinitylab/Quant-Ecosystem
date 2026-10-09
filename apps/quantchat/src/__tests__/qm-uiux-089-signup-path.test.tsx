/**
 * QM-UIUX-089 — QuantChat must have a signup path.
 *
 * Before this fix, a first-time customer could not create a Quant account
 * from QuantChat at all: the login page had no Create account / Register
 * affordance, and /register had no route (dead end that bounced to /login).
 * Quant accounts are created on QuantMail — the identity host behind
 * "Continue with Quant Account" — whose /register page posts to the real
 * POST /api/auth/register endpoint. These tests pin:
 *  (a) the login page renders a visible signup link to that real flow;
 *  (b) /register hands the visitor to the real registration, never /login.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';

const redirectCalls = vi.hoisted(() => [] as string[]);

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/login',
  // Mirror next/navigation semantics: redirect() never returns (it throws).
  redirect: (url: string) => {
    redirectCalls.push(url);
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

import LoginPage from '../components/auth/LoginPage';
import RegisterPage from '../app/register/page';

describe('QM-UIUX-089 signup path', () => {
  it('login page renders a visible Create account link to the real QuantMail registration', () => {
    const html = renderToString(<LoginPage />);

    expect(html).toContain('data-testid="quant-signup-link"');
    expect(html).toContain('Create account');
    expect(html).toContain('New to Quant?');
    // The link must land on the real registration flow on the identity host
    // (QuantMail /register → POST /api/auth/register) — not a local stub.
    expect(html).toContain('href="https://quantmail.in/register"');
    // …and never a dead local /register href that used to bounce to /login.
    expect(html).not.toContain('href="/register"');
  });

  it('/register route redirects to the real registration, not to /login', () => {
    redirectCalls.length = 0;

    expect(() => RegisterPage()).toThrow('NEXT_REDIRECT:https://quantmail.in/register');
    expect(redirectCalls).toEqual(['https://quantmail.in/register']);
    expect(redirectCalls).not.toContain('/login');
  });
});
