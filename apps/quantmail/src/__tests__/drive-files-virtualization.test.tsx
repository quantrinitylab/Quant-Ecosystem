// ============================================================================
// QM-M39-014 — Drive large-collection performance: virtualization math,
// restorable view state, and the DriveFilesSubView pagination contract.
// Uses renderToStaticMarkup (no DOM): asserts SSR markup + pure helpers.
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { computeVirtualRange } from '../hooks/useVirtualizedRows';
import {
  driveFilesViewStateKey,
  loadDriveFilesViewState,
  saveDriveFilesViewState,
  DEFAULT_DRIVE_FILES_VIEW_STATE,
} from '../app/drive/components/driveFilesViewState';
import {
  DriveFilesSubView,
  type DriveItem,
} from '../app/drive/components';

vi.mock('../hooks/useStorageQuota', () => ({
  useStorageQuota: () => ({
    quota: { used: 14.2 * 1024 ** 3, total: 100 * 1024 ** 3 },
    known: true,
    usedPct: 14,
    isLoading: false,
    error: null,
  }),
}));

const sampleFiles: DriveItem[] = [
  {
    id: 'file-1',
    name: 'Q3_Ecosystem_Architecture.pdf',
    type: 'file',
    mimeType: 'application/pdf',
    size: 14200000,
    modifiedAt: '2026-10-01T10:00:00Z',
    isStarred: true,
  },
  {
    id: 'file-2',
    name: 'Sovereign_Keystore_Spec.docx',
    type: 'file',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    size: 8600000,
    modifiedAt: '2026-09-28T14:30:00Z',
    isStarred: false,
  },
];

const sampleFolders: DriveItem[] = [
  {
    id: 'folder-1',
    name: 'Cryptographic_Keys',
    type: 'folder',
    mimeType: '',
    size: 0,
    modifiedAt: '2026-09-20T08:00:00Z',
  },
];

describe('computeVirtualRange (pure, no DOM)', () => {
  it('returns the full range when nothing is scrolled', () => {
    const r = computeVirtualRange({
      scrollTop: 0,
      viewportHeight: 600,
      rowHeight: 64,
      rowGap: 6,
      rowCount: 100,
      overscanRows: 3,
    });
    expect(r.startRow).toBe(0);
    // ceil(600/70) + 3 overscan
    expect(r.endRow).toBe(Math.ceil(600 / 70) + 3);
  });

  it('windows around the scroll position with overscan on both sides', () => {
    const r = computeVirtualRange({
      scrollTop: 700,
      viewportHeight: 600,
      rowHeight: 64,
      rowGap: 6,
      rowCount: 100,
      overscanRows: 3,
    });
    // floor(700/70) - 3 = 7 ; ceil(1300/70) + 3 = 22
    expect(r.startRow).toBe(7);
    expect(r.endRow).toBe(22);
  });

  it('clamps to the row count at the bottom', () => {
    const r = computeVirtualRange({
      scrollTop: 100000,
      viewportHeight: 600,
      rowHeight: 64,
      rowGap: 0,
      rowCount: 25,
      overscanRows: 3,
    });
    // Scrolled past the end: empty window pinned at the last row.
    expect(r).toEqual({ startRow: 25, endRow: 25 });
  });

  it('handles empty collections and zero viewports', () => {
    expect(
      computeVirtualRange({
        scrollTop: 0,
        viewportHeight: 600,
        rowHeight: 64,
        rowCount: 0,
      }),
    ).toEqual({ startRow: 0, endRow: 0 });
    expect(
      computeVirtualRange({
        scrollTop: 0,
        viewportHeight: 0,
        rowHeight: 64,
        rowCount: 50,
      }),
    ).toEqual({ startRow: 0, endRow: 0 });
  });
});

describe('driveFilesViewState (restorable sort/filter)', () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('round-trips sort/filter per folder id', () => {
    saveDriveFilesViewState('folder-9', {
      sortBy: 'name',
      sortDir: 'asc',
      typeFilter: 'pdf',
    });
    expect(loadDriveFilesViewState('folder-9')).toEqual({
      sortBy: 'name',
      sortDir: 'asc',
      typeFilter: 'pdf',
    });
    // A different folder is unaffected.
    expect(loadDriveFilesViewState('other')).toEqual({});
  });

  it('uses the folder id (or root) in the storage key', () => {
    expect(driveFilesViewStateKey(null)).toBe('quantdrive:files-view:root');
    expect(driveFilesViewStateKey('abc')).toBe('quantdrive:files-view:abc');
  });

  it('ignores invalid stored values instead of applying them', () => {
    store.set(
      driveFilesViewStateKey('bad'),
      JSON.stringify({ sortBy: 'hacked', sortDir: 'sideways', typeFilter: 'exe' }),
    );
    expect(loadDriveFilesViewState('bad')).toEqual({});
  });

  it('survives corrupt JSON and missing storage', () => {
    store.set(driveFilesViewStateKey('corrupt'), 'not-json{{{');
    expect(loadDriveFilesViewState('corrupt')).toEqual({});
    vi.unstubAllGlobals();
    expect(loadDriveFilesViewState('any')).toEqual({});
    expect(() =>
      saveDriveFilesViewState('any', DEFAULT_DRIVE_FILES_VIEW_STATE),
    ).not.toThrow();
  });
});

describe('DriveFilesSubView pagination contract (QM-M39-014)', () => {
  it('renders a "Load more" button with exact loaded/total counts when paginated', () => {
    const html = renderToStaticMarkup(
      <DriveFilesSubView
        files={sampleFiles}
        folders={sampleFolders}
        hasMore
        totalCount={1240}
        onLoadMore={() => {}}
      />,
    );
    expect(html).toContain('Load more files');
    expect(html).toContain('2 of 1240 files loaded');
    // No fake "all loaded" claims.
    expect(html).not.toContain('All files loaded');
  });

  it('shows no load-more affordance when the server reports no more pages', () => {
    const html = renderToStaticMarkup(
      <DriveFilesSubView
        files={sampleFiles}
        folders={sampleFolders}
        hasMore={false}
        totalCount={2}
        onLoadMore={() => {}}
      />,
    );
    expect(html).not.toContain('Load more files');
  });

  it('renders an honest loading state (skeletons + status, no fake content)', () => {
    const html = renderToStaticMarkup(
      <DriveFilesSubView files={[]} folders={[]} loading />,
    );
    expect(html).toContain('role="status"');
    expect(html).toContain('Loading files');
    expect(html).not.toContain('Q3_Ecosystem_Architecture.pdf');
  });

  it('renders an error state with retry', () => {
    const html = renderToStaticMarkup(
      <DriveFilesSubView
        files={[]}
        folders={[]}
        error="Drive is temporarily unavailable. Retry in a moment."
        onRetry={() => {}}
      />,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain('Drive is temporarily unavailable. Retry in a moment.');
    expect(html).toContain('Retry');
  });

  it('renders the server-compatible sort control only when onSortChange is provided', () => {
    const withSort = renderToStaticMarkup(
      <DriveFilesSubView
        files={sampleFiles}
        folders={sampleFolders}
        onSortChange={() => {}}
      />,
    );
    expect(withSort).toContain('drive-files-sort');
    expect(withSort).toContain('Date modified');
    expect(withSort).toContain('Name');
    expect(withSort).toContain('Size');

    const withoutSort = renderToStaticMarkup(
      <DriveFilesSubView files={sampleFiles} folders={sampleFolders} />,
    );
    expect(withoutSort).not.toContain('drive-files-sort');
  });

  it('hides type-card counts while more pages are unloaded (never partial as total)', () => {
    const partial = renderToStaticMarkup(
      <DriveFilesSubView
        files={sampleFiles}
        folders={sampleFolders}
        hasMore
        totalCount={1240}
        onLoadMore={() => {}}
        onFilterChange={() => {}}
      />,
    );
    expect(partial).not.toContain('files ·');

    const complete = renderToStaticMarkup(
      <DriveFilesSubView
        files={sampleFiles}
        folders={sampleFolders}
        hasMore={false}
        totalCount={2}
        onFilterChange={() => {}}
      />,
    );
    // All pages loaded → the counts are exact and shown.
    expect(complete).toContain('files ·');
  });

  it('renders files and folders in both grid and list modes (SSR renders all rows)', () => {
    const grid = renderToStaticMarkup(
      <DriveFilesSubView files={sampleFiles} folders={sampleFolders} viewMode="grid" />,
    );
    expect(grid).toContain('Q3_Ecosystem_Architecture.pdf');
    expect(grid).toContain('Cryptographic_Keys');
    expect(grid).toContain('FastCDC Deduped');

    const list = renderToStaticMarkup(
      <DriveFilesSubView files={sampleFiles} folders={sampleFolders} viewMode="list" />,
    );
    expect(list).toContain('Sovereign_Keystore_Spec.docx');
    expect(list).toContain('Download');
  });
});
