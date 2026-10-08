import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QuantAIPageErrorBoundary } from '../components/QuantAIPageErrorBoundary';

// P0: QuantAI mobile blank white page — the error boundary must guarantee
// anonymous users always see an actionable sign-in UI, never a blank surface.

describe('QuantAIPageErrorBoundary', () => {
  const props = {
    brandName: 'QuantAI',
    onSignIn: vi.fn(),
    onQuantSSO: vi.fn(),
    // Props.children is required — the boundary always wraps real page content.
    children: React.createElement('div', { id: 'child-content' }, 'Chat UI here'),
  };

  it('renders children normally when there is no error', () => {
    const html = renderToStaticMarkup(React.createElement(QuantAIPageErrorBoundary, props));
    expect(html).toContain('Chat UI here');
    expect(html).toContain('id="child-content"');
  });

  it('getDerivedStateFromError produces error state with message', () => {
    const state = QuantAIPageErrorBoundary.getDerivedStateFromError(
      new Error('Cannot read properties of undefined'),
    );
    expect(state.hasError).toBe(true);
    expect(state.errorMessage).toBe('Cannot read properties of undefined');
  });

  it('renders branded sign-in fallback (never blank) when in error state', () => {
    // Simulate the boundary after catching an error by pre-setting state
    // via a subclass instance render.
    const boundary = new QuantAIPageErrorBoundary(props);
    // Directly set the error state as getDerivedStateFromError would
    (boundary as any).state = { hasError: true, errorMessage: 'boom' };
    const html = renderToStaticMarkup(boundary.render() as React.ReactElement);

    // Must show actionable UI — never blank
    expect(html.length).toBeGreaterThan(100);
    // Brand + sign-in actions present
    expect(html).toContain('QuantAI');
    expect(html).toContain('Continue with Quant SSO');
    expect(html).toContain('Sign In');
    expect(html).toContain('Try again');
    // Honest messaging, no fake claims
    expect(html).toContain('needs a quick refresh');
  });

  it('fallback includes retry affordance', () => {
    const boundary = new QuantAIPageErrorBoundary(props);
    (boundary as any).state = { hasError: true, errorMessage: null };
    const html = renderToStaticMarkup(boundary.render() as React.ReactElement);
    expect(html).toContain('Try again');
  });

  it('componentDidCatch forwards the error to the onError hook (no console logging)', () => {
    const onError = vi.fn();
    const boundary = new QuantAIPageErrorBoundary({ ...props, onError });
    const err = new Error('boom');
    const info = { componentStack: 'stack' } as React.ErrorInfo;
    boundary.componentDidCatch(err, info);
    expect(onError).toHaveBeenCalledWith(err, info);
  });

  it('componentDidCatch is a no-op without onError', () => {
    const boundary = new QuantAIPageErrorBoundary(props);
    expect(() =>
      boundary.componentDidCatch(new Error('boom'), { componentStack: 'stack' } as React.ErrorInfo),
    ).not.toThrow();
  });
});
