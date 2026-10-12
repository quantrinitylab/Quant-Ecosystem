// @vitest-environment jsdom
// ============================================================================
// QuantChat — /discover page honesty (QC-F-077)
//
// The page's data layer was a phantom (backend + proxy never existed), and
// handleSubscribe ignored the subscribe result and always incremented the
// subscriber counter locally — a fabricated success. These tests pin the
// honest behaviour: rendered counts come from the server payload, and a
// failed subscribe changes nothing on screen.
//
// Api mocks are module-level hoisted objects with stable identities.
// ============================================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const apiMocks = vi.hoisted(() => ({
  getDiscoverFeed: vi.fn(),
  getTrendingContent: vi.fn(),
  getPublishers: vi.fn(),
  subscribe: vi.fn(),
}));

vi.mock('../services/api-client', () => ({
  apiClient: {
    getDiscoverFeed: apiMocks.getDiscoverFeed,
    getTrendingContent: apiMocks.getTrendingContent,
    getPublishers: apiMocks.getPublishers,
    subscribe: apiMocks.subscribe,
  },
}));

vi.mock('next/head', () => ({
  default: () => null,
}));

import { DiscoverPage } from '../pages/discover';

const PUBLISHER = {
  id: 'pub-1',
  name: 'Quant News',
  description: 'Daily quant news',
  avatarUrl: '',
  coverUrl: '',
  subscriberCount: 40,
  contentCount: 3,
  isVerified: false,
  isSubscribed: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

let container: HTMLDivElement;
let root: Root;

async function renderPage() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<DiscoverPage />);
  });
}

function subscribeButton(): HTMLButtonElement {
  const btn = [...container.querySelectorAll('button')].find(
    (b) => b.textContent === 'Subscribe' || b.textContent === 'Subscribed',
  );
  if (!btn) throw new Error('subscribe button not rendered');
  return btn as HTMLButtonElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  apiMocks.getDiscoverFeed.mockResolvedValue({ success: true, data: [] });
  apiMocks.getTrendingContent.mockResolvedValue({ success: true, data: [] });
  apiMocks.getPublishers.mockResolvedValue({ success: true, data: [PUBLISHER] });
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
});

describe('Discover page (QC-F-077)', () => {
  it('renders publishers from the API payload with their real count', async () => {
    await renderPage();
    expect(container.textContent).toContain('Quant News');
    expect(container.textContent).toContain('40 subscribers');
    expect(subscribeButton().textContent).toBe('Subscribe');
    expect(subscribeButton().disabled).toBe(false);
  });

  it('on subscribe success shows the SERVER-reported count, never a local +1', async () => {
    // The server says the real count is 45 (other people subscribed too).
    // A local-increment implementation would show 41 — that is the fake
    // this test exists to kill.
    apiMocks.subscribe.mockResolvedValue({
      success: true,
      data: { subscribed: true, alreadySubscribed: false, subscriberCount: 45 },
    });
    await renderPage();
    await act(async () => {
      subscribeButton().click();
    });
    expect(apiMocks.subscribe).toHaveBeenCalledWith('pub-1');
    expect(container.textContent).toContain('45 subscribers');
    expect(container.textContent).not.toContain('41 subscribers');
    expect(subscribeButton().textContent).toBe('Subscribed');
    expect(subscribeButton().disabled).toBe(true);
  });

  it('on subscribe failure changes nothing — no fabricated increment, no Subscribed state', async () => {
    apiMocks.subscribe.mockResolvedValue({ success: false, error: 'boom' });
    await renderPage();
    await act(async () => {
      subscribeButton().click();
    });
    expect(container.textContent).toContain('40 subscribers');
    expect(subscribeButton().textContent).toBe('Subscribe');
    expect(subscribeButton().disabled).toBe(false);
  });

  it('when every load fails the page shows its error state instead of silent emptiness', async () => {
    apiMocks.getDiscoverFeed.mockResolvedValue({ success: false });
    apiMocks.getTrendingContent.mockResolvedValue({ success: false });
    apiMocks.getPublishers.mockResolvedValue({ success: false });
    await renderPage();
    expect(container.textContent).toContain("Couldn't load Discover");
  });
});
