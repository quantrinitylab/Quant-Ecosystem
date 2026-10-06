import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MobilePillarBottomNav } from '../components/MobilePillarBottomNav';

// Mock Next.js navigation hooks
const mockPush = vi.fn();
let mockCurrentPathname = '/';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => mockCurrentPathname,
}));

// Mock the logo components (canvas-based, not needed for markup assertions)
vi.mock('../components/QuantPillarTopBar', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../components/QuantPillarTopBar')>();
  const FakeIcon = () => <span data-testid="fake-icon" />;
  return {
    ...actual,
    PILLAR_TILES: actual.PILLAR_TILES.map((t) => ({ ...t, icon: FakeIcon })),
  };
});

describe('MobilePillarBottomNav', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCurrentPathname = '/';
  });

  it('renders all 5 pillars with labels', () => {
    const html = renderToStaticMarkup(<MobilePillarBottomNav />);
    expect(html).toContain('Mail');
    expect(html).toContain('Calendar');
    expect(html).toContain('Drive');
    expect(html).toContain('Contacts');
    expect(html).toContain('QuantGit');
  });

  it('marks the current pillar with aria-current="page"', () => {
    mockCurrentPathname = '/calendar';
    const html = renderToStaticMarkup(<MobilePillarBottomNav />);
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('aria-label="Calendar"');
  });

  it('shows unread badge on Mail when mailUnreadCount > 0', () => {
    const html = renderToStaticMarkup(<MobilePillarBottomNav mailUnreadCount={5} />);
    expect(html).toContain('aria-label="Mail (5 unread)"');
    expect(html).toContain('>5<');
  });

  it('hides badge when mailUnreadCount is 0', () => {
    const html = renderToStaticMarkup(<MobilePillarBottomNav mailUnreadCount={0} />);
    expect(html).not.toContain('unread)');
  });

  it('is mobile-only (md:hidden) and fixed at bottom', () => {
    const html = renderToStaticMarkup(<MobilePillarBottomNav />);
    expect(html).toContain('md:hidden');
    expect(html).toContain('fixed bottom-0');
  });

  it('uses 44px touch floors on buttons', () => {
    const html = renderToStaticMarkup(<MobilePillarBottomNav />);
    expect(html).toContain('min-h-touch');
    expect(html).toContain('min-w-touch');
  });

  it('hides on /thread routes', () => {
    mockCurrentPathname = '/thread/abc123';
    const html = renderToStaticMarkup(<MobilePillarBottomNav />);
    expect(html).toBe('');
  });

  it('hides on /compose routes', () => {
    mockCurrentPathname = '/compose';
    const html = renderToStaticMarkup(<MobilePillarBottomNav />);
    expect(html).toBe('');
  });

  it('resolves quantgit aliases (/codehub, /repos, /pipelines)', () => {
    for (const path of ['/quantgit', '/codehub', '/repos', '/pipelines']) {
      mockCurrentPathname = path;
      const html = renderToStaticMarkup(<MobilePillarBottomNav />);
      expect(html).toContain('aria-label="QuantGit"');
      // Exactly one aria-current in the whole nav
      expect((html.match(/aria-current="page"/g) || []).length).toBe(1);
    }
  });

  it('contains zero raw Unicode emojis', () => {
    const html = renderToStaticMarkup(<MobilePillarBottomNav mailUnreadCount={3} />);
    // eslint-disable-next-line no-control-regex
    const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u;
    expect(emojiRegex.test(html)).toBe(false);
  });
});
