// @vitest-environment jsdom
// ============================================================================
// Shared UI - AuthPending tests
//
// The point of this component is that it is never empty and never a dead end,
// so that is what these assert: real text in both states, and a working link
// even when the guard's client-side redirect does not run.
// ============================================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { AuthPending } from '../guards/AuthPending';

/** Mirrors the smoke workflow's check: does a monitor see actual text here? */
function renderedTextLength(container: HTMLElement): number {
  return (container.textContent ?? '').replace(/\s+/g, ' ').trim().length;
}

describe('AuthPending', () => {
  afterEach(() => {
    vi.useRealTimers();
  });
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

  it('is a polite live region, and only busy while verifying', () => {    const { rerender } = render(<AuthPending state="verifying" />);
    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.getAttribute('aria-busy')).toBe('true');

    rerender(<AuthPending state="redirecting" />);
    expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('false');
  });

  it('never strands a visitor on "Checking your session": times out to an honest sign-in screen', () => {
    vi.useFakeTimers();
    const { container } = render(
      <AuthPending state="verifying" appName="QuantWave" timeoutMs={5000} />,
    );
    expect(screen.getByText('Checking your session')).toBeDefined();

    act(() => {
      vi.advanceTimersByTime(5001);
    });

    // R3-P1-6: no permanent black interstitial — honest copy + working link.
    expect(screen.getByText('Sign in to QuantWave')).toBeDefined();
    expect(screen.getByText(/session check is taking too long/)).toBeDefined();
    expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('false');
    const link = screen.getByRole('link', { name: 'Go to sign in' });
    expect(link.getAttribute('href')).toBe('/login');
    expect((container.textContent ?? '').replace(/\s+/g, ' ').trim().length).toBeGreaterThan(40);
  });

  it('keeps verifying while the timeout has not elapsed', () => {
    vi.useFakeTimers();
    render(<AuthPending state="verifying" timeoutMs={5000} />);
    act(() => {
      vi.advanceTimersByTime(4999);
    });
    expect(screen.getByText('Checking your session')).toBeDefined();
    expect(screen.queryByText(/session check is taking too long/)).toBeNull();
  });

  it('does not flip when timeoutMs is 0 (timeout disabled)', () => {
    vi.useFakeTimers();
    render(<AuthPending state="verifying" timeoutMs={0} />);
    act(() => {
      vi.advanceTimersByTime(60000);
    });
    expect(screen.getByText('Checking your session')).toBeDefined();
  });
});
