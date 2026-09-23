// @vitest-environment jsdom
// ============================================================================
// Shared UI - AuthPending tests
//
// The point of this component is that it is never empty and never a dead end,
// so that is what these assert: real text in both states, and a working link
// even when the guard's client-side redirect does not run.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AuthPending } from '../guards/AuthPending';

/** Mirrors the smoke workflow's check: does a monitor see actual text here? */
function renderedTextLength(container: HTMLElement): number {
  return (container.textContent ?? '').replace(/\s+/g, ' ').trim().length;
}

describe('AuthPending', () => {
  it('renders substantive text while the session check is in flight', () => {
    const { container } = render(<AuthPending state="verifying" />);
    expect(screen.getByText('Checking your session')).toBeDefined();
    expect(renderedTextLength(container)).toBeGreaterThan(40);
  });

  it('renders substantive text while redirecting a signed-out visitor', () => {
    const { container } = render(<AuthPending state="redirecting" />);
    expect(screen.getByText('Sign in to continue')).toBeDefined();
    expect(renderedTextLength(container)).toBeGreaterThan(40);
  });

  it('names the product when redirecting, so the page reads like the app', () => {
    render(<AuthPending state="redirecting" appName="Quantube" />);
    expect(screen.getByText('Sign in to Quantube')).toBeDefined();
  });

  it('does not rename the heading while merely verifying', () => {
    render(<AuthPending state="verifying" appName="Quantube" />);
    expect(screen.getByText('Checking your session')).toBeDefined();
    expect(screen.queryByText('Sign in to Quantube')).toBeNull();
  });

  it('always offers a real anchor to the login path, not a JS-only redirect', () => {
    render(<AuthPending state="redirecting" loginPath="/auth/login" />);
    const link = screen.getByRole('link', { name: 'Go to sign in' });
    expect(link.getAttribute('href')).toBe('/auth/login');
  });

  it('defaults the login path to /login', () => {
    render(<AuthPending state="verifying" />);
    expect(screen.getByRole('link', { name: 'Go to sign in' }).getAttribute('href')).toBe('/login');
  });

  it('is a polite live region, and only busy while verifying', () => {
    const { rerender } = render(<AuthPending state="verifying" />);
    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.getAttribute('aria-busy')).toBe('true');

    rerender(<AuthPending state="redirecting" />);
    expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('false');
  });
});
