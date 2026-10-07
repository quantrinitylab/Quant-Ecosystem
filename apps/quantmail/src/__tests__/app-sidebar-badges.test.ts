// @vitest-environment node
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocks for next/navigation and UI dependencies
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/',
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

// Mock useInbox from ../hooks/useMail
const mockUseInbox = vi.fn();
vi.mock('../hooks/useMail', () => ({
  useInbox: (options?: { folderType?: string }) => mockUseInbox(options),
}));

import { AppSidebar } from '../components/AppSidebar';

describe('AppSidebar Badge Semantics (Task W13-5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders unread count for received mail and total item count for drafts', () => {
    const inboxEmails = [
      { id: '1', subject: 'Read email', isRead: true },
      { id: '2', subject: 'Unread email 1', isRead: false },
      { id: '3', subject: 'Unread email 2', isRead: false },
    ];
    const draftEmails = [
      { id: 'd1', subject: 'Draft 1', isRead: true },
      { id: 'd2', subject: 'Draft 2', isRead: false },
      { id: 'd3', subject: 'Draft 3', isRead: false },
      { id: 'd4', subject: 'Draft 4', isRead: true },
    ];

    mockUseInbox.mockImplementation((options?: { folderType?: string }) => {
      if (options?.folderType === 'DRAFTS') {
        return { data: draftEmails };
      }
      return { data: inboxEmails };
    });

    const markup = renderToStaticMarkup(createElement(AppSidebar));

    // Received mail folder badge renders unread count: inboxEmails.filter(e => !e.isRead).length === 2
    expect(markup).toContain('aria-label="2 unread"');
    expect(markup).toContain('<span class="sidebar-count" aria-label="2 unread">2</span>');
    // It should NOT render total count of inbox emails (3)
    expect(markup).not.toContain('aria-label="3 unread"');

    // Drafts folder badge renders total count: draftEmails.length === 4
    expect(markup).toContain('aria-label="4 drafts"');
    expect(markup).toContain(
      '<span class="sidebar-count sidebar-count-muted" aria-label="4 drafts">4</span>',
    );
    // It should NOT render unread count of drafts (2)
    expect(markup).not.toContain('aria-label="2 drafts"');
  });

  it('omits unread badge when all inbox emails are read but keeps drafts badge', () => {
    const inboxEmails = [
      { id: '1', subject: 'Read 1', isRead: true },
      { id: '2', subject: 'Read 2', isRead: true },
    ];
    const draftEmails = [
      { id: 'd1', subject: 'Draft 1', isRead: true },
      { id: 'd2', subject: 'Draft 2', isRead: true },
    ];

    mockUseInbox.mockImplementation((options?: { folderType?: string }) => {
      if (options?.folderType === 'DRAFTS') {
        return { data: draftEmails };
      }
      return { data: inboxEmails };
    });

    const markup = renderToStaticMarkup(createElement(AppSidebar));

    // Unread count is 0 -> unread badge should not render
    expect(markup).not.toContain('unread');

    // Draft count is 2 -> drafts badge should render with total count (2)
    expect(markup).toContain('aria-label="2 drafts"');
    expect(markup).toContain(
      '<span class="sidebar-count sidebar-count-muted" aria-label="2 drafts">2</span>',
    );
  });

  it('omits drafts badge when draft folder is empty but renders unread badge', () => {
    const inboxEmails = [{ id: '1', subject: 'Unread 1', isRead: false }];
    const draftEmails: Array<{ id: string; subject: string; isRead: boolean }> = [];

    mockUseInbox.mockImplementation((options?: { folderType?: string }) => {
      if (options?.folderType === 'DRAFTS') {
        return { data: draftEmails };
      }
      return { data: inboxEmails };
    });

    const markup = renderToStaticMarkup(createElement(AppSidebar));

    // Unread count is 1 -> unread badge renders
    expect(markup).toContain('aria-label="1 unread"');
    expect(markup).toContain('<span class="sidebar-count" aria-label="1 unread">1</span>');

    // Drafts count is 0 -> drafts badge does not render
    expect(markup).not.toContain('drafts"');
  });
});
