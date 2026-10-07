// @vitest-environment node
// ============================================================================
// K10 / M15 — Notifications center: list, filters, mark-all-read, and honest
// empty/error states, all against the real notification shape.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('../components/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div data-testid="shell">{children}</div>,
}));

vi.mock('../components/AppSidebar', () => ({
  AppSidebar: () => <div data-testid="sidebar" />,
}));

const mockUseNotifications = vi.fn();
const mockMarkRead = vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false }));
const mockMarkAllRead = vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false }));
const mockDeleteOne = vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false }));

vi.mock('../hooks/useNotifications', () => ({
  useNotifications: () => mockUseNotifications(),
  useMarkNotificationRead: () => mockMarkRead(),
  useMarkAllNotificationsRead: () => mockMarkAllRead(),
  useDeleteNotification: () => mockDeleteOne(),
}));

import NotificationsPage from '../app/notifications/page';

const N1 = {
  id: 'n1',
  type: 'mail.new',
  title: 'New message from Ada',
  body: 'The invoice is attached.',
  actionUrl: '/thread/t1',
  sourceApp: 'quantmail',
  priority: 'NORMAL',
  isRead: false,
  createdAt: new Date().toISOString(),
};

const N2 = {
  id: 'n2',
  type: 'security.login',
  title: 'New sign-in detected',
  body: null,
  actionUrl: null,
  sourceApp: null,
  priority: 'HIGH',
  isRead: true,
  createdAt: new Date(Date.now() - 86400000).toISOString(),
};

function loaded(notifications: unknown[], unreadCount: number) {
  mockUseNotifications.mockReturnValue({
    data: { notifications, unreadCount },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  });
}

describe('Notifications center', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists notifications with read/unread distinction', () => {
    loaded([N1, N2], 1);
    const html = renderToStaticMarkup(<NotificationsPage />);
    expect(html).toContain('New message from Ada');
    expect(html).toContain('New sign-in detected');
    expect(html).toContain('1 unread');
  });

  it('shows the mark-all-read action only when something is unread', () => {
    loaded([N1, N2], 1);
    expect(renderToStaticMarkup(<NotificationsPage />)).toContain('Mark all read');

    loaded([N2], 0);
    const html = renderToStaticMarkup(<NotificationsPage />);
    expect(html).not.toContain('Mark all read');
    expect(html).toContain('all caught up');
  });

  it('renders the All / Unread / Read filters', () => {
    loaded([N1, N2], 1);
    const html = renderToStaticMarkup(<NotificationsPage />);
    expect(html).toContain('>All<');
    expect(html).toContain('>Unread<');
    expect(html).toContain('>Read<');
  });

  it('flags high-priority and security notifications', () => {
    loaded([N2], 0);
    const html = renderToStaticMarkup(<NotificationsPage />);
    expect(html).toContain('high');
  });

  it('renders an honest empty state when the backend has no notifications', () => {
    loaded([], 0);
    const html = renderToStaticMarkup(<NotificationsPage />);
    expect(html).toContain('No notifications');
    // No fabricated rows, no fake counts.
    expect(html).not.toContain('n1');
  });

  it('renders an error state with retry when the backend fails', () => {
    mockUseNotifications.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('backend down'),
      refetch: vi.fn(),
    });
    const html = renderToStaticMarkup(<NotificationsPage />);
    expect(html).toContain('backend down');
  });

  it('renders skeletons while loading', () => {
    mockUseNotifications.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: vi.fn(),
    });
    const html = renderToStaticMarkup(<NotificationsPage />);
    expect(html).toContain('Loading notifications');
  });
});
