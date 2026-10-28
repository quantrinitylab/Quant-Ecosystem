import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  DriveHomeSubView,
  type DriveItem,
} from '../components/DriveSubViews';
import { DriveFilesSubView } from '../app/drive/components/DriveFilesSubView';
import {
  DriveMoveDialog,
  moveDestinations,
} from '../app/drive/components/DriveMoveDialog';

// QM-DRIVE-MOVE: the finding was "no user-facing Move action exists
// anywhere". These tests pin the affordances: a Move control on files and
// folders in both Drive surfaces, a destination picker that never offers
// the item itself, and an honest disabled My Drive option at root.

const sampleFolders: DriveItem[] = [
  {
    id: 'folder-1',
    name: 'Project Docs',
    type: 'folder',
    mimeType: '',
    size: 0,
    modifiedAt: '2026-10-06T10:00:00Z',
  },
  {
    id: 'folder-2',
    name: 'Photos',
    type: 'folder',
    mimeType: '',
    size: 0,
    modifiedAt: '2026-10-06T10:00:00Z',
  },
];

const sampleFiles: DriveItem[] = [
  {
    id: 'file-1',
    name: 'report.pdf',
    type: 'file',
    mimeType: 'application/pdf',
    size: 1234,
    modifiedAt: '2026-10-06T10:00:00Z',
  },
];

describe('moveDestinations (pure destination list)', () => {
  it('lists My Drive plus every folder except the moved item itself', () => {
    const destinations = moveDestinations(sampleFolders, 'folder-1', 'folder-9');
    expect(destinations.map((d) => d.id)).toEqual([null, 'folder-2']);
    expect(destinations[0]?.name).toBe('My Drive');
    expect(destinations[0]?.disabled).toBeFalsy();
  });

  it('disables My Drive when the item already lives at root', () => {
    const destinations = moveDestinations(sampleFolders, 'file-1', null);
    expect(destinations[0]).toMatchObject({
      id: null,
      disabled: true,
      disabledReason: 'Already in My Drive',
    });
    expect(destinations.map((d) => d.id)).toEqual([null, 'folder-1', 'folder-2']);
  });

  it('returns only a disabled My Drive when no other folder exists', () => {
    const destinations = moveDestinations(
      [{ id: 'folder-1', name: 'Project Docs' }],
      'folder-1',
      null,
    );
    expect(destinations).toHaveLength(1);
    expect(destinations[0]?.disabled).toBe(true);
  });
});

describe('DriveMoveDialog', () => {
  it('renders nothing when closed', () => {
    const html = renderToStaticMarkup(
      <DriveMoveDialog
        open={false}
        itemName="report.pdf"
        itemType="file"
        destinations={moveDestinations(sampleFolders, 'file-1', null)}
        onSelect={() => {}}
        onClose={() => {}}
      />,
    );
    expect(html).toBe('');
  });

  it('lists destinations and marks the disabled root option honestly', () => {
    const html = renderToStaticMarkup(
      <DriveMoveDialog
        open
        itemName="report.pdf"
        itemType="file"
        destinations={moveDestinations(sampleFolders, 'file-1', null)}
        onSelect={() => {}}
        onClose={() => {}}
      />,
    );
    expect(html).toContain('Move “report.pdf”');
    expect(html).toContain('My Drive');
    expect(html).toContain('Already in My Drive');
    expect(html).toContain('Project Docs');
    expect(html).toContain('Photos');
    expect(html).toContain('Move here');
  });

  it('says so honestly when there is nowhere to move to', () => {
    const html = renderToStaticMarkup(
      <DriveMoveDialog
        open
        itemName="Project Docs"
        itemType="folder"
        destinations={moveDestinations(
          [{ id: 'folder-1', name: 'Project Docs' }],
          'folder-1',
          null,
        )}
        onSelect={() => {}}
        onClose={() => {}}
      />,
    );
    expect(html).toContain('No other folders yet');
    expect(html).not.toContain('Move here');
  });
});

describe('DriveHomeSubView Move affordances', () => {
  it('exposes Move for folders and files when the handler is provided', () => {
    const html = renderToStaticMarkup(
      <DriveHomeSubView
        files={sampleFiles}
        folders={sampleFolders}
        onNavigateToFolder={() => {}}
        onOpenMove={() => {}}
        onMoveItem={() => {}}
      />,
    );
    expect(html).toContain('aria-label="Move folder Project Docs"');
    expect(html).toContain('aria-label="Move file report.pdf"');
    // Draggable cards: the drag-onto-folder half of the finding.
    expect(html).toContain('draggable="true"');
  });

  it('hides Move controls when no handler is provided', () => {
    const html = renderToStaticMarkup(
      <DriveHomeSubView
        files={sampleFiles}
        folders={sampleFolders}
        onNavigateToFolder={() => {}}
      />,
    );
    expect(html).not.toContain('Move folder');
    expect(html).not.toContain('Move file');
    expect(html).not.toContain('draggable="true"');
  });

  it('never offers Move for document projections', () => {
    const docFiles: DriveItem[] = [
      {
        id: 'doc:abc',
        name: 'Meeting notes',
        type: 'document',
        mimeType: '',
        size: 0,
        modifiedAt: '2026-10-06T10:00:00Z',
      },
    ];
    const html = renderToStaticMarkup(
      <DriveHomeSubView
        files={docFiles}
        folders={[]}
        onNavigateToFolder={() => {}}
        onOpenMove={() => {}}
        onMoveItem={() => {}}
      />,
    );
    expect(html).not.toContain('Move file Meeting notes');
  });
});

describe('DriveFilesSubView Move affordances', () => {
  it('exposes a Move button per file when the handler is provided', () => {
    const html = renderToStaticMarkup(
      <DriveFilesSubView
        files={sampleFiles.map((f) => ({ ...f, type: 'file' as const }))}
        folders={[]}
        onOpenMove={() => {}}
      />,
    );
    expect(html).toContain('aria-label="Move file report.pdf"');
  });

  it('hides Move when no handler is provided', () => {
    const html = renderToStaticMarkup(
      <DriveFilesSubView
        files={sampleFiles.map((f) => ({ ...f, type: 'file' as const }))}
        folders={[]}
      />,
    );
    expect(html).not.toContain('Move file report.pdf');
  });
});
