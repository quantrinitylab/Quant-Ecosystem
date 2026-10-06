import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DesktopPillarRail, DESKTOP_PILLAR_TILES } from '../components/DesktopPillarRail';
import { AppShell } from '../components/AppShell';

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

describe('DesktopPillarRail Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCurrentPathname = '/';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders all 5 pillar squircle tiles with correct shortcuts and labels', () => {
    const html = renderToStaticMarkup(<DesktopPillarRail />);

    expect(html).toContain('data-testid="desktop-pillar-rail"');
    expect(html).toContain('w-[68px]');
    expect(html).toContain('bg-[#090A0E]');
    expect(html).toContain('border-[#1E232F]');

    for (const tile of DESKTOP_PILLAR_TILES) {
      expect(html).toContain(`data-testid="desktop-pillar-tile-${tile.id}"`);
      expect(html).toContain(`${tile.label} (${tile.shortcutNumber})`);
    }

    // Official 5 app labels
    expect(html).toContain('Mail');
    expect(html).toContain('Calendar');
    expect(html).toContain('Drive');
    expect(html).toContain('Contacts');
    expect(html).toContain('QuantGit');
  });

  it('renders the top Quant Monogram mark with amber refraction styling', () => {
    const html = renderToStaticMarkup(<DesktopPillarRail />);

    expect(html).toContain('data-testid="desktop-pillar-home-logo"');
    expect(html).toContain('Quant Ecosystem — Home');
    expect(html).toContain('quantAmberRefract');
  });

  it('renders the vertical glowing active pill on the current active pillar', () => {
    const html = renderToStaticMarkup(<DesktopPillarRail currentPillar="calendar" />);

    // Calendar active indicator is rendered
    expect(html).toContain('data-testid="desktop-pillar-active-indicator-calendar"');
    expect(html).toContain('background-color:#3B82F6');
    expect(html).toContain('box-shadow:0 0 12px #3B82F6');

    // Mail active indicator is NOT rendered
    expect(html).not.toContain('data-testid="desktop-pillar-active-indicator-mail"');
  });

  it('renders unread counts badges when unread count is greater than 0', () => {
    const html = renderToStaticMarkup(
      <DesktopPillarRail
        unreadCounts={{
          mail: 5,
          calendar: 2,
        }}
      />,
    );

    expect(html).toContain('data-testid="desktop-pillar-badge-mail"');
    expect(html).toContain('5');
    expect(html).toContain('data-testid="desktop-pillar-badge-calendar"');
    expect(html).toContain('2');
  });

  it('renders bottom items: Quant AI trigger capsule and User avatar', () => {
    const html = renderToStaticMarkup(<DesktopPillarRail />);

    // Quant AI trigger capsule with pulsing beacon
    expect(html).toContain('data-testid="desktop-pillar-ai-trigger"');
    expect(html).toContain('Quant AI Assistant');
    expect(html).toContain('animate-ping');

    // Compact user identity avatar
    expect(html).toContain('data-testid="desktop-pillar-account-badge"');
    expect(html).toContain('AQ');
    expect(html).toContain('alex@quantmail.in');
  });

  it('integrates seamlessly into AppShell on main suite routes on desktop', () => {
    mockCurrentPathname = '/drive';
    const html = renderToStaticMarkup(
      <AppShell sidebar={<div id="sidebar-test">Sidebar</div>}>
        <div>Drive Content</div>
      </AppShell>,
    );

    // DesktopPillarRail is mounted at the far left
    expect(html).toContain('data-testid="desktop-pillar-rail"');
    expect(html).toContain('data-testid="desktop-pillar-tile-drive"');
    expect(html).toContain('data-testid="desktop-pillar-active-indicator-drive"');

    // Folder sidebar is rendered
    expect(html).toContain('id="sidebar-test"');

    // QuantPillarTopBar is wrapped with md:hidden so desktop uses DesktopPillarRail instead of top switcher
    expect(html).toContain('class="md:hidden"');
  });
});
