// Honest loading/error states for the Drive "Shared with me" and "Starred"
// sub-views: while the backend query is in flight the view must render
// skeletons (never the "No … yet" empty state), and a rejected query must
// render an honest error banner instead of a false empty state.
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  DriveSharedSubView,
  DriveStarredSubView,
  type SharedItemRecord,
  type StarredItem,
} from '../app/drive/components';

const SHARE: SharedItemRecord = {
  id: 'share-1',
  name: 'Report.pdf',
  type: 'file',
  mimeType: 'application/pdf',
  size: 1000,
  sharedDate: '2026-10-01T09:15:00Z',
  permission: 'Viewer',
  owner: { name: 'Test User', email: 'test@example.com' },
  status: 'accepted',
};

const STARRED: StarredItem = {
  id: 'file-1',
  name: 'Roadmap.pdf',
  type: 'file',
  mimeType: 'application/pdf',
  size: 5000,
  modifiedAt: '2026-10-01T09:15:00Z',
  isStarred: true,
};

describe('DriveSharedSubView loading / error states', () => {
  it('renders loading skeletons — NOT the false empty state — while loading', () => {
    const html = renderToStaticMarkup(<DriveSharedSubView shares={[]} loading={true} />);

    expect(html).toContain('aria-label="Loading shared files"');
    expect(html).toContain('animate-pulse');
    expect(html).not.toContain('No shared files yet');
  });

  it('renders an honest error banner on load failure, not the empty state', () => {
    const html = renderToStaticMarkup(
      <DriveSharedSubView shares={[]} loading={false} error="Shared files could not be loaded. Try again in a moment." />,
    );

    expect(html).toContain('load shared files');
    expect(html).toContain('Shared files could not be loaded. Try again in a moment.');
    expect(html).not.toContain('No shared files yet');
    expect(html).not.toContain('animate-pulse');
  });

  it('still shows the honest empty state after loading finished with no error', () => {
    const html = renderToStaticMarkup(<DriveSharedSubView shares={[]} loading={false} error={null} />);

    expect(html).toContain('No shared files yet');
  });

  it('renders real shares once loaded', () => {
    const html = renderToStaticMarkup(<DriveSharedSubView shares={[SHARE]} loading={false} />);

    expect(html).toContain('Report.pdf');
    expect(html).not.toContain('No shared files yet');
    expect(html).not.toContain('animate-pulse');
  });
});

describe('DriveStarredSubView loading / error states', () => {
  it('renders loading skeletons — NOT the false empty state — while loading', () => {
    const html = renderToStaticMarkup(<DriveStarredSubView items={[]} loading={true} />);

    expect(html).toContain('aria-label="Loading starred files"');
    expect(html).toContain('animate-pulse');
    expect(html).not.toContain('No starred files yet');
  });

  it('renders an honest error banner on load failure, not the empty state', () => {
    const html = renderToStaticMarkup(
      <DriveStarredSubView items={[]} loading={false} error="Starred files could not be loaded. Try again in a moment." />,
    );

    expect(html).toContain('load starred files');
    expect(html).toContain('Starred files could not be loaded. Try again in a moment.');
    expect(html).not.toContain('No starred files yet');
    expect(html).not.toContain('animate-pulse');
  });

  it('still shows the honest empty state after loading finished with no error', () => {
    const html = renderToStaticMarkup(<DriveStarredSubView items={[]} loading={false} error={null} />);

    expect(html).toContain('No starred files yet');
  });

  it('renders real items once loaded', () => {
    const html = renderToStaticMarkup(<DriveStarredSubView items={[STARRED]} loading={false} />);

    expect(html).toContain('Roadmap.pdf');
    expect(html).not.toContain('No starred files yet');
    expect(html).not.toContain('animate-pulse');
  });
});
