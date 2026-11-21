// @vitest-environment jsdom
// ============================================================================
// QC-F-026 — global error boundary renders raw error.message unsanitized
// ============================================================================
//
// The global error boundary (src/app/error.tsx) used to render
// `{error.message || '...'}` verbatim. error.message can carry stack traces,
// file paths, URLs, internal hosts, and credentials — leaking backend
// internals to the user. These tests FAIL on the original component and
// PASS on the fix: the boundary now renders sanitizeErrorMessage(error)
// and falls back to the honest generic only when nothing safe remains.
// A safe, ordinary message still passes through unchanged.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import ErrorBoundary from '../error';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const FALLBACK = 'An unexpected error occurred. Please try again.';

describe('global error boundary sanitization (QC-F-026)', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function renderBoundary(error: Error, reset: () => void = () => {}) {
    act(() => {
      root.render(<ErrorBoundary error={error} reset={reset} />);
    });
  }

  function paragraphText(): string {
    const p = container.querySelector('p');
    if (!p) throw new Error('error boundary paragraph not found');
    return p.textContent ?? '';
  }

  it('passes a safe message through unchanged', () => {
    renderBoundary(new Error('The model returned an empty response.'));
    expect(paragraphText()).toBe('The model returned an empty response.');
  });

  it('drops the stack trace — only the first line is used', () => {
    renderBoundary(new Error('Boom while loading\n    at handler (/srv/app/src/x.ts:10:5)'));
    const text = paragraphText();
    expect(text).toContain('Boom while loading');
    expect(text).not.toContain('at handler');
    expect(text).not.toContain('/srv/app');
  });

  it('strips URLs, credentials and internal hosts instead of rendering them raw', () => {
    renderBoundary(
      new Error(
        'Upstream failed: Bearer abcdef12345678 at https://quantchat-backend.internal:4000/chat\n    at push (/srv/app/routes.ts:3)',
      ),
    );
    const text = paragraphText();
    expect(text).not.toContain('abcdef12345678');
    expect(text).not.toContain('quantchat-backend.internal');
    expect(text).not.toContain('/srv/app');
    expect(text).not.toContain('http://');
    expect(text).not.toContain('https://');
  });

  it('falls back to the honest generic when the message was nothing but internals', () => {
    renderBoundary(new Error('https://quantchat-backend.internal:4000/chat'));
    expect(paragraphText()).toBe(FALLBACK);
  });

  it('falls back to the honest generic on an empty message', () => {
    renderBoundary(new Error(''));
    expect(paragraphText()).toBe(FALLBACK);
  });

  it('Try Again button still calls reset', () => {
    const reset = vi.fn();
    renderBoundary(new Error('kaput'), reset);
    const btn = Array.from(container.querySelectorAll('button')).find((b) =>
      (b.textContent ?? '').includes('Try Again'),
    );
    if (!btn) throw new Error('Try Again button not found');
    act(() => {
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
