import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Mock fetch before importing the component
const mockFetch = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ success: true, data: [] }),
});
vi.stubGlobal('fetch', mockFetch);

// localStorage is not available in all test envs; lib/auth guards with try/catch,
// but stub it anyway so getAuthToken() resolves cleanly.
vi.stubGlobal('localStorage', {
  getItem: vi.fn().mockReturnValue(null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
});

// Dynamic import after mocking
const { default: IdeasPage } = await import('../page');

describe('IdeasPage', () => {
  beforeEach(() => {
    mockFetch.mockClear();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: [] }),
    });
  });

  it('renders without crashing and produces valid HTML', () => {
    const html = renderToStaticMarkup(React.createElement(IdeasPage));
    expect(html).toBeDefined();
    expect(html.length).toBeGreaterThan(0);
  });

  it('renders the Quanty header, title, and status tabs', () => {
    const html = renderToStaticMarkup(React.createElement(IdeasPage));
    expect(html).toContain('Ideas');
    expect(html).toContain('Quanty');
    expect(html).toContain('New');
    expect(html).toContain('Saved');
    expect(html).toContain('Dismissed');
  });

  it('renders the honest loading state with no fabricated cards (SSR has no effects)', () => {
    // renderToStaticMarkup never runs useEffect, so the page stays in its
    // initial loading state: it must show a loader and must NOT invent cards.
    const html = renderToStaticMarkup(React.createElement(IdeasPage));
    expect(html).toContain('Loading ideas');
    expect(html).not.toContain('October 5 Ship Ledger');
  });

  it('renders the propose-your-own composer toggle', () => {
    const html = renderToStaticMarkup(React.createElement(IdeasPage));
    expect(html).toContain('Propose your own idea');
  });

  it('exposes tab semantics for assistive tech', () => {
    const html = renderToStaticMarkup(React.createElement(IdeasPage));
    expect(html).toContain('role="tablist"');
    expect(html).toContain('role="tab"');
  });
});
