import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DESKTOP_PILLAR_TILES } from '../components/pillarTiles';
import { AppShell } from '../components/AppShell';

// Desktop redesign (2026-10-10): AppShell's pinned rail renders the real
// DesktopSidebar — hermetic marker here, the component itself is covered in
// desktop-sidebar.test.tsx.
vi.mock('../components/DesktopSidebar', () => ({
  DesktopSidebar: () => <div data-testid="desktop-sidebar-mock" />,
}));


// Mock Next.js navigation hooks
const mockPush = vi.fn();
let mockCurrentPathname = '/';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => mockCurrentPathname,
  useSearchParams: () => new URLSearchParams(),
}));

// Mock useInbox to avoid react-query requirements
vi.mock('../hooks/useInbox', () => ({
  useInbox: () => ({
    data: [
      { id: '1', isRead: false },
      { id: '2', isRead: true },
    ],
    refetch: vi.fn(),
  }),
}));

// Mock shared UI components
vi.mock('@quant/shared-ui', () => ({
  PageTransition: ({ children }: { children: React.ReactNode }) => (
    <div className="page-transition">{children}</div>
  ),
  useFocusTrap: () => ({ current: null }),
  BubbleAvatar: () => <div className="bubble-avatar" />,
}));

// Mock auth-provider to test with and without user
vi.mock('../providers/auth-provider', () => ({
  useOptionalAuth: () => ({
    user: {
      id: 'test-user',
      email: 'alex@quantmail.in',
      displayName: 'Alex Quant',
      username: 'alex',
      role: 'admin',
    },
    isAuthenticated: true,
  }),
  useAuth: () => ({
    user: {
      id: 'test-user',
      email: 'alex@quantmail.in',
      displayName: 'Alex Quant',
      username: 'alex',
      role: 'admin',
    },
    isAuthenticated: true,
  }),
}));

describe('DesktopAppRail (slim 5-app switcher)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCurrentPathname = '/';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('defines all 5 pillar tiles with correct shortcuts and labels', () => {
    expect(DESKTOP_PILLAR_TILES).toHaveLength(5);
    for (const tile of DESKTOP_PILLAR_TILES) {
      expect(tile.id).toBeTruthy();
      expect(tile.label).toBeTruthy();
      expect(tile.path).toBeTruthy();
      expect(tile.shortcutNumber).toBeGreaterThan(0);
    }

    // Official 5 app labels
    expect(DESKTOP_PILLAR_TILES.map((t) => t.label)).toEqual([
      'Mail',
      'Calendar',
      'Drive',
      'Contacts',
      'QuantGit',
    ]);
  });

  it('integrates seamlessly into AppShell on main suite routes on desktop', () => {
    mockCurrentPathname = '/drive';
    const html = renderToStaticMarkup(
      <AppShell sidebar={<div id="sidebar-test">Sidebar</div>}>
        <div>Drive Content</div>
      </AppShell>,
    );

    // DesktopContextSidebar is mounted on the left with the Drive contextual tabs
    expect(html).toContain('data-testid="desktop-context-sidebar"');
    expect(html).toContain('data-testid="desktop-context-tab-home"');
    expect(html).toContain('data-testid="desktop-context-tab-feed"');

    // DesktopAppRail (slim 5-app switcher) is mounted on the right
    expect(html).toContain('data-testid="desktop-app-rail"');
    expect(html).toContain('data-testid="desktop-app-rail-tile-drive"');
    // Active app = clean logo only: aria-selected on the tile, no glow/edge/tint markup
    expect(html).toContain('aria-selected="true"');
    expect(html).not.toContain('desktop-app-rail-active-drive');

    // Folder sidebar is rendered
    expect(html).toContain('id="sidebar-test"');

    // QuantPillarTopBar is wrapped with md:hidden so desktop uses the side rails instead
    expect(html).toContain('class="md:hidden"');
  });
});
