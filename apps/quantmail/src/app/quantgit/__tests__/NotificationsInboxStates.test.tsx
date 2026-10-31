import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NotificationsInbox, type GitNotificationItem } from '../components/NotificationsInbox';

// Regression coverage for the inbox states the P2 fix wires up: loading,
// fetch failure, and — critically — the Saved/Done tabs. Before the fix
// those tabs switched their highlight but rendered the same unfiltered
// inbox list, so a "Saved" tab showing unsaved items was a dead tab.

const REAL: GitNotificationItem = {
  id: 'review:rev-1',
  repo: 'acme / Widgets',
  number: 42,
  type: 'pr',
  status: 'open',
  title: 'fix: correct widget alignment',
  author: 'teammate',
  timeAgo: '1h',
  unread: true,
  category: 'review_requested',
};

describe('NotificationsInbox states', () => {
  it('shows a loading state instead of a fake empty inbox while fetching', () => {
    const html = renderToStaticMarkup(<NotificationsInbox loading />);
    expect(html).toContain('Loading notifications');
    expect(html).not.toContain('No notifications');
  });

  it('shows a fetch failure honestly, with a retry affordance', () => {
    const html = renderToStaticMarkup(
      <NotificationsInbox error="Notifications request failed (500)" onRetry={() => {}} />,
    );
    expect(html).toContain('Notifications request failed (500)');
    expect(html).toContain('Try again');
  });

  it('Saved tab does not leak unsaved inbox items (dead-tab regression)', () => {
    const html = renderToStaticMarkup(
      <NotificationsInbox notifications={[REAL]} initialTab="saved" />,
    );
    expect(html).toContain('No saved notifications');
    expect(html).not.toContain('fix: correct widget alignment');
  });

  it('Done tab does not leak untriaged inbox items (dead-tab regression)', () => {
    const html = renderToStaticMarkup(
      <NotificationsInbox notifications={[REAL]} initialTab="done" />,
    );
    expect(html).toContain('No done notifications');
    expect(html).not.toContain('fix: correct widget alignment');
  });

  it('Inbox tab still shows the real item', () => {
    const html = renderToStaticMarkup(
      <NotificationsInbox notifications={[REAL]} initialTab="inbox" />,
    );
    expect(html).toContain('fix: correct widget alignment');
  });
});
