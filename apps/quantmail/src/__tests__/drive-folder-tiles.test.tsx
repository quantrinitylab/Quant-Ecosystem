import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  DriveHomeSubView,
  type DriveItem,
} from '../components/DriveSubViews';

describe('Drive folder tiles (P0 fixes)', () => {
  const sampleFolders: DriveItem[] = [
    {
      id: 'folder-1',
      name: 'Project Docs',
      type: 'folder',
      mimeType: '',
      size: 0,
      modifiedAt: '2026-10-06T10:00:00Z',
    },
  ];

  it('renders folder tiles as real <button> elements, not plain divs', () => {
    const html = renderToStaticMarkup(
      <DriveHomeSubView folders={sampleFolders} onNavigateToFolder={() => {}} />,
    );
    // The open-folder control must be a button with an accessible label
    expect(html).toContain('<button');
    expect(html).toContain('aria-label="Open folder Project Docs"');
  });

  it('exposes rename and delete actions for folders', () => {
    const html = renderToStaticMarkup(
      <DriveHomeSubView
        folders={sampleFolders}
        onNavigateToFolder={() => {}}
        onOpenRename={() => {}}
        onDeleteItem={() => {}}
      />,
    );
    expect(html).toContain('aria-label="Rename folder Project Docs"');
    expect(html).toContain('aria-label="Delete folder Project Docs"');
  });

  it('hides folder actions when handlers are not provided', () => {
    const html = renderToStaticMarkup(<DriveHomeSubView folders={sampleFolders} />);
    expect(html).not.toContain('Rename folder');
    expect(html).not.toContain('Delete folder');
    // Navigation still rendered
    expect(html).toContain('aria-label="Open folder Project Docs"');
  });
});
