import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  DriveHomeSubView,
  type DriveItem,
} from '../components/DriveSubViews';
import {
  DriveFilesSubView,
  type DriveItem as FilesDriveItem,
} from '../app/drive/components/DriveFilesSubView';

/**
 * Regression tests for the drive folder-actions finding
 * (deep-audit-2026-10-23-C12): folder rename/delete must be reachable
 * without hover — touchscreens have no hover, so hover-gated actions are
 * unreachable actions. These tests pin the fix in static markup:
 *  - home-view folder actions are never `opacity-0 group-hover:*`-gated
 *  - DriveFilesSubView folder cards expose rename/delete at all
 *    (they previously rendered zero action affordances)
 *  - both surfaces hide the actions when the parent wires no handler
 */
describe('Drive folder actions reachable without hover', () => {
  const homeFolders: DriveItem[] = [
    {
      id: 'folder-1',
      name: 'Project Docs',
      type: 'folder',
      mimeType: '',
      size: 0,
      modifiedAt: '2026-10-06T10:00:00Z',
    },
  ];

  const filesFolders: FilesDriveItem[] = [
    {
      id: 'folder-1',
      name: 'Project Docs',
      type: 'folder',
      mimeType: '',
      size: 0,
      modifiedAt: '2026-10-06T10:00:00Z',
    },
  ];

  it('home-view folder actions are not hover-gated', () => {
    const html = renderToStaticMarkup(
      <DriveHomeSubView
        folders={homeFolders}
        onNavigateToFolder={() => {}}
        onOpenRename={() => {}}
        onDeleteItem={() => {}}
      />,
    );
    // The old hover-reveal class chain must be gone from the folder cards.
    expect(html).not.toContain(
      'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100',
    );
    // Actions themselves still rendered.
    expect(html).toContain('aria-label="Rename folder Project Docs"');
    expect(html).toContain('aria-label="Delete folder Project Docs"');
  });

  it('DriveFilesSubView folder cards expose rename and delete actions', () => {
    const html = renderToStaticMarkup(
      <DriveFilesSubView
        files={[]}
        folders={filesFolders}
        onNavigateToFolder={() => {}}
        onOpenRename={() => {}}
        onDeleteItem={() => {}}
      />,
    );
    expect(html).toContain('Project Docs');
    expect(html).toContain('aria-label="Rename folder Project Docs"');
    expect(html).toContain('aria-label="Delete folder Project Docs"');
  });

  it('DriveFilesSubView hides folder actions when handlers are not provided', () => {
    const html = renderToStaticMarkup(
      <DriveFilesSubView
        files={[]}
        folders={filesFolders}
        onNavigateToFolder={() => {}}
      />,
    );
    expect(html).toContain('Project Docs');
    expect(html).not.toContain('Rename folder');
    expect(html).not.toContain('Delete folder');
  });

  it('DriveFilesSubView folder actions are not hover-gated either', () => {
    const html = renderToStaticMarkup(
      <DriveFilesSubView
        files={[]}
        folders={filesFolders}
        onNavigateToFolder={() => {}}
        onOpenRename={() => {}}
        onDeleteItem={() => {}}
      />,
    );
    expect(html).not.toContain('opacity-0 group-hover:opacity-100');
  });
});
