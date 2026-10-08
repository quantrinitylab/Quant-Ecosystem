import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NotificationsInbox, type GitNotificationItem } from '../components/NotificationsInbox';

// QM-UIUX-065 — QuantGit's NotificationsInbox must never fabricate
// notifications. Regression: the component used to seed its state from a
// hardcoded SAMPLE_NOTIFICATIONS array (invented merged PRs, an invented
// security fix, an invented tracking issue, a fake unread count of 2) and
// made zero API calls. The backend never creates git notifications, so with
// no real data supplied the honest state is an empty inbox.

const FABRICATED_STRINGS = [
  'smart inbox categorization with durable per-user learning',
  'patch @ai-sdk/provider-utils DoS',
  'Phase 2: CodeHub (QuantGit) — Architecture Decision Records & Remediation',
  'cubic-dev-ai[bot]',
  'Verified all 207 test suites and 2,409 tests green.',
  'Applied security hotfix to package dependency tree.',
  'notif-1',
  'notif-2',
  'notif-3',
];

describe('QM-UIUX-065: NotificationsInbox honesty (no fabricated notifications)', () => {
  it('with no notifications supplied, renders the honest empty state and invents nothing', () => {
    const html = renderToStaticMarkup(<NotificationsInbox />);

    expect(html).toContain('No notifications');
    expect(html).toContain('There are no notifications to show right now.');
    for (const fabricated of FABRICATED_STRINGS) {
      expect(html).not.toContain(fabricated);
    }
    // The sidebar unread pill reflects real data: 0 unread, not the old fake 2.
    expect(html).toContain('bg-[#30363D] text-[#E6EDF3]">0</span>');
  });

  it('renders real notifications supplied via props, with a real unread count', () => {
    const realNotifications: GitNotificationItem[] = [
      {
        id: 'n-real-1',
        repo: 'acme / Widgets',
        number: 42,
        type: 'pr',
        status: 'open',
        title: 'fix: correct widget alignment',
        author: 'teammate',
        timeAgo: '1h',
        unread: true,
        category: 'review_requested',
      },
      {
        id: 'n-real-2',
        repo: 'acme / Widgets',
        number: 7,
        type: 'issue',
        status: 'open',
        title: 'Widget leaks on unmount',
        author: 'reporter',
        timeAgo: '3h',
        unread: false,
        category: 'assigned',
      },
    ];

    const html = renderToStaticMarkup(<NotificationsInbox notifications={realNotifications} />);

    expect(html).toContain('fix: correct widget alignment');
    expect(html).toContain('Widget leaks on unmount');
    expect(html).toContain('acme / Widgets');
    expect(html).not.toContain('No notifications');
    // Exactly one of the two real notifications is unread.
    expect(html).toContain('bg-[#30363D] text-[#E6EDF3]">1</span>');
    for (const fabricated of FABRICATED_STRINGS) {
      expect(html).not.toContain(fabricated);
    }
  });
});
