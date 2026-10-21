// @vitest-environment node
// ============================================================================
// K10 / M15 — the notifications center is a screen now, so the sidebar links
// to /notifications.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/notifications',
  useSearchParams: () => ({ get: vi.fn().mockReturnValue(null) }),
}));

vi.mock('../hooks/useStorageQuota', () => ({
  useStorageQuota: () => ({
    quota: { usedBytes: 1024, totalBytes: 1024 * 1024 * 1024 },
    known: true,
    usedPct: 1,
  }),
}));

vi.mock('../components/QuantMailLogo', () => ({
  QuantMailLogo: () => null,
}));

vi.mock('../components/BrandWordmark', () => ({
  BrandWordmark: () => null,
}));

vi.mock('../components/AccountBadge', () => ({
  AccountBadge: () => null,
}));

vi.mock('../hooks/useMail', () => ({
  useInbox: () => ({ data: [] }),
}));

// K10/M15 (2026-10-20): the Notifications row badge reads unreadCount from
// useNotifications() — the same react-query key the /notifications page uses.
const mockUseNotifications = vi.fn();
vi.mock('../hooks/useNotifications', () => ({
  useNotifications: () => mockUseNotifications(),
}));

import { AppSidebar } from '../components/AppSidebar';

describe('AppSidebar notifications entry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseNotifications.mockReturnValue({ data: { notifications: [], unreadCount: 0 } });
  });

  it('links to the notifications center', () => {
    const html = renderToStaticMarkup(<AppSidebar />);
    // Nav items are buttons that router.push their path; the entry exists and
    // is the active one on /notifications.
    expect(html).toContain('>Notifications<');
    expect(html).toContain('aria-current="page"');
  });

  it('renders an unread badge wired to useNotifications().unreadCount', () => {
    mockUseNotifications.mockReturnValue({
      data: { notifications: [], unreadCount: 3 },
    });
    const html = renderToStaticMarkup(<AppSidebar />);
    expect(html).toContain('aria-label="3 unread"');
    expect(html).toContain('>3</span>');
  });

  it('hides the badge when there is nothing unread', () => {
    mockUseNotifications.mockReturnValue({
      data: { notifications: [], unreadCount: 0 },
    });
    const html = renderToStaticMarkup(<AppSidebar />);
    expect(html).not.toContain('aria-label="0 unread"');
  });

  it('hides the badge on query error instead of fabricating a count', () => {
    mockUseNotifications.mockReturnValue({ data: undefined, isError: true });
    const html = renderToStaticMarkup(<AppSidebar />);
    // No unread badge anywhere on the notifications row: honest, not "0".
    expect(html).not.toMatch(/aria-label="\d+ unread"/);
  });
});
