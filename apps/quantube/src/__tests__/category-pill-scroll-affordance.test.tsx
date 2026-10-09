// ============================================================================
// QM-UIUX-018 — QuanTube home category pill row scroll affordance.
//
// Regression: on mobile the category pill row overflowed horizontally and
// the last visible pill was cut off at the right edge with NO hint that the
// row scrolls. The fix derives edge fades from the row's real scroll
// metrics: right fade shows while more pills are hidden to the right, left
// fade after scrolling, both hide when nothing more can be revealed.
//
// These tests render the real HomePage in jsdom (mirroring the mocks of
// quantube-public-feed.test.tsx) and drive the nav's scroll metrics
// directly — jsdom has no layout engine, so scrollWidth/clientWidth are
// defined per-test, which is exactly the input the component reads.
// ============================================================================

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import HomePage from '../pages/index';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

// Mock dependencies for HomePage (mirrors quantube-public-feed.test.tsx)
vi.mock('../hooks/useVideos', () => ({
  useVideos: (category?: string) => ({
    data: {
      pages: [
        {
          isGuestFallback: true,
          videos: [
            {
              id: 'test-vid-1080',
              title: 'Sovereign Computing Keynote 2026',
              channelName: 'Quant Labs',
              resolution: '1080p Full HD',
              duration: 1800,
              views: 450000,
            },
          ],
        },
      ],
    },
    isLoading: false,
    error: null,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
  }),
}));

vi.mock('../providers/auth-provider', () => ({
  useAuth: () => ({
    isAuthenticated: false,
    user: null,
  }),
}));

let container: HTMLDivElement;
let root: Root;

function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<HomePage />);
  });
}

function getNav(): HTMLElement {
  const nav = container.querySelector('nav[aria-label="Content categories"]');
  if (!nav) throw new Error('category nav not rendered');
  return nav as HTMLElement;
}

function setNavMetrics(
  nav: HTMLElement,
  metrics: { scrollWidth: number; clientWidth: number; scrollLeft: number },
) {
  for (const [key, value] of Object.entries(metrics)) {
    Object.defineProperty(nav, key, { value, configurable: true, writable: true });
  }
}

function fade(testId: string) {
  return container.querySelector(`[data-testid="${testId}"]`);
}

describe('QM-UIUX-018 category pill row scroll affordance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('shows the right edge fade (and no left fade) when the row overflows at scroll start', () => {
    mount();
    const nav = getNav();
    // 900px of pills inside a 360px viewport, not yet scrolled.
    setNavMetrics(nav, { scrollWidth: 900, clientWidth: 360, scrollLeft: 0 });
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });

    expect(fade('category-fade-right')).not.toBeNull();
    expect(fade('category-fade-left')).toBeNull();
  });

  it('hides the right fade and shows the left fade once scrolled to the end', () => {
    mount();
    const nav = getNav();
    setNavMetrics(nav, { scrollWidth: 900, clientWidth: 360, scrollLeft: 0 });
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(fade('category-fade-right')).not.toBeNull();

    // Scroll to the very end: scrollLeft == scrollWidth - clientWidth.
    setNavMetrics(nav, { scrollWidth: 900, clientWidth: 360, scrollLeft: 540 });
    act(() => {
      nav.dispatchEvent(new Event('scroll'));
    });

    expect(fade('category-fade-right')).toBeNull();
    expect(fade('category-fade-left')).not.toBeNull();
  });

  it('shows no fades when the row fits without overflow', () => {
    mount();
    const nav = getNav();
    setNavMetrics(nav, { scrollWidth: 360, clientWidth: 360, scrollLeft: 0 });
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });

    expect(fade('category-fade-right')).toBeNull();
    expect(fade('category-fade-left')).toBeNull();
  });

  it('preserves pill selection: clicking a category marks it pressed and unmarks the previous', () => {
    mount();
    const sports = Array.from(container.querySelectorAll('nav button')).find(
      (b) => b.textContent === 'Sports',
    );
    const all = Array.from(container.querySelectorAll('nav button')).find(
      (b) => b.textContent === 'All',
    );
    if (!sports || !all) throw new Error('category pills not rendered');

    expect(all.getAttribute('aria-pressed')).toBe('true');
    act(() => {
      (sports as HTMLButtonElement).click();
    });

    expect(sports.getAttribute('aria-pressed')).toBe('true');
    expect(all.getAttribute('aria-pressed')).toBe('false');
  });
});
