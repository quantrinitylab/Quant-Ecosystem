import { describe, it, expect } from 'vitest';
import { mapGitNotification, mapGitNotifications, formatGitTimeAgo } from '../lib/mapGitNotification';

// The page's mapper must pass backend rows through untouched in spirit and
// drop anything malformed — a dropped row is an honest omission, a rendered
// invented row would be fabrication.

describe('mapGitNotification', () => {
  it('maps a real backend row, deriving timeAgo from createdAt', () => {
    const createdAt = new Date(Date.now() - 90 * 60_000).toISOString();
    const item = mapGitNotification({
      id: 'review:rev-1',
      repo: 'acme / Widgets',
      repoId: 'repo-1',
      number: 42,
      type: 'pr',
      status: 'open',
      title: 'fix: correct widget alignment',
      author: 'teammate',
      commentSnippet: 'Aligns the widget.',
      createdAt,
      unread: true,
      category: 'review_requested',
    });
    expect(item).toMatchObject({
      id: 'review:rev-1',
      repo: 'acme / Widgets',
      number: 42,
      type: 'pr',
      status: 'open',
      title: 'fix: correct widget alignment',
      timeAgo: '1h',
      unread: true,
      category: 'review_requested',
    });
  });

  it('drops malformed rows instead of rendering invented content', () => {
    expect(mapGitNotification(null)).toBeNull();
    expect(mapGitNotification({ id: 'x' })).toBeNull();
    expect(
      mapGitNotification({ id: 'x', title: 't', category: 'bogus' }),
    ).toBeNull();
    expect(
      mapGitNotification({ id: 'x', title: 't', category: 'assigned', type: 'bogus' }),
    ).not.toBeNull(); // unknown type degrades to 'issue', never a crash
    expect(mapGitNotifications([{ id: 'x', title: 't', category: 'assigned' }, null])).toHaveLength(1);
  });

  it('formats relative times honestly', () => {
    expect(formatGitTimeAgo(undefined)).toBe('');
    expect(formatGitTimeAgo('not-a-date')).toBe('');
    expect(formatGitTimeAgo(new Date().toISOString())).toBe('just now');
  });
});
