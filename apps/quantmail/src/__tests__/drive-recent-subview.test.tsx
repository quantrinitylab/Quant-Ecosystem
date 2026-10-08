// ============================================================================
// QM-M39-002 — Drive "Recent" view (M39 screen 6) component tests.
// The view renders the backend's recency order untouched, shows honest
// relative-time labels (Opened X ago / Modified X ago), and the empty state
// is exactly "No recent files" — entries are never fabricated.
// ============================================================================

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  DriveRecentSubView,
  type RecentItem,
} from '../app/drive/components/DriveRecentSubView';

vi.mock('../hooks/useStorageQuota', () => ({
  useStorageQuota: () => ({
    quota: { used: 0, total: 100 * 1024 ** 3 },
    known: true,
    usedPct: 0,
    isLoading: false,
    error: null,
  }),
}));

function item(partial: Partial<RecentItem> & { id: string }): RecentItem {
  return {
    name: 'file.pdf',
    type: 'file',
    mimeType: 'application/pdf',
    size: 1024,
    modifiedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    lastOpenedAt: null,
    isStarred: false,
    ...partial,
  };
}

describe('DriveRecentSubView (QM-M39-002)', () => {
  it('renders items in the exact order given — no client re-sorting', () => {
    const items = [
      item({ id: 'a', name: 'alpha.pdf' }),
      item({ id: 'b', name: 'beta.pdf' }),
      item({ id: 'c', name: 'gamma.pdf' }),
    ];
    const html = renderToStaticMarkup(<DriveRecentSubView items={items} />);
    const ia = html.indexOf('alpha.pdf');
    const ib = html.indexOf('beta.pdf');
    const ic = html.indexOf('gamma.pdf');
    expect(ia).toBeGreaterThan(-1);
    expect(ib).toBeGreaterThan(ia);
    expect(ic).toBeGreaterThan(ib);
  });

  it('labels an opened file with "Opened X ago"', () => {
    const openedAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const html = renderToStaticMarkup(
      <DriveRecentSubView items={[item({ id: 'a', name: 'seen.pdf', lastOpenedAt: openedAt })]} />,
    );
    expect(html).toContain('Opened 2 hr ago');
  });

  it('falls back to "Modified X ago" when the file was never opened', () => {
    const modifiedAt = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const html = renderToStaticMarkup(
      <DriveRecentSubView items={[item({ id: 'a', name: 'old.pdf', modifiedAt, lastOpenedAt: null })]} />,
    );
    expect(html).toContain('Modified 5 days ago');
    expect(html).not.toContain('Opened');
  });

  it('shows the honest empty state and fabricates nothing', () => {
    const html = renderToStaticMarkup(<DriveRecentSubView items={[]} />);
    expect(html).toContain('No recent files');
    // No file cards may render when there are no items.
    expect(html).not.toContain('Download');
  });

  it('shows loading skeletons — not the empty state — while fetching', () => {
    const html = renderToStaticMarkup(<DriveRecentSubView items={[]} loading />);
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain('No recent files');
  });

  it('shows an honest error state instead of a fabricated list', () => {
    const html = renderToStaticMarkup(
      <DriveRecentSubView items={[]} error="Drive is temporarily unavailable." />,
    );
    expect(html).toContain('Drive is temporarily unavailable.');
    expect(html).not.toContain('No recent files');
  });

  it('shows a real count badge and a Load more button only when there is more', () => {
    const items = [item({ id: 'a' }), item({ id: 'b' })];
    const withMore = renderToStaticMarkup(
      <DriveRecentSubView items={items} totalCount={120} hasMore onLoadMore={() => {}} />,
    );
    expect(withMore).toContain('120 files');
    expect(withMore).toContain('Load more');

    const withoutMore = renderToStaticMarkup(
      <DriveRecentSubView items={items} totalCount={2} hasMore={false} />,
    );
    expect(withoutMore).toContain('2 files');
    expect(withoutMore).not.toContain('Load more');
  });

  it('wires preview, download, delete and star actions', () => {
    const onPreviewItem = vi.fn();
    const onDownloadFile = vi.fn();
    const onDeleteItem = vi.fn();
    const onToggleStar = vi.fn();
    const el = (
      <DriveRecentSubView
        items={[item({ id: 'a', name: 'act.pdf' })]}
        onPreviewItem={onPreviewItem}
        onDownloadFile={onDownloadFile}
        onDeleteItem={onDeleteItem}
        onToggleStar={onToggleStar}
      />
    );
    const html = renderToStaticMarkup(el);
    expect(html).toContain('Download');
    expect(html).toContain('Delete');
    expect(html).toContain('aria-label="Star act.pdf"');
    expect(onPreviewItem).not.toHaveBeenCalled();
  });
});
