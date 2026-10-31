import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  DriveCleanerSubView,
  duplicateGroupsToClusters,
} from '../app/drive/components/DriveCleanerSubView';
import type {
  DuplicateGroup,
  DuplicateFileItem,
} from '../components/drive/AIDuplicateCleanerModal';

function sampleGroups(): DuplicateGroup[] {
  const files: DuplicateFileItem[] = [
    {
      id: 'file-orig-1',
      name: 'Design_System.fig',
      size: 5242880, // 5 MiB
      modifiedAt: '2026-09-22T14:30:00Z',
      path: '/Projects/Design_System.fig',
      contentHash: 'hash-abc123456789',
      isOriginal: true,
      selectedForDeletion: false,
    },
    {
      id: 'file-copy-1',
      name: 'Design_System copy.fig',
      size: 5242880,
      modifiedAt: '2026-09-15T10:00:00Z',
      path: '/Projects/Backups/Design_System copy.fig',
      contentHash: 'hash-abc123456789',
      isOriginal: false,
      selectedForDeletion: true,
    },
  ];
  return [{ hash: 'hash-abc123456789', files, potentialSavings: 5242880 }];
}

describe('DriveCleanerSubView scan wiring (cleaner tab)', () => {
  it('maps DuplicateCleanerManager groups into honest cluster rows', () => {
    const clusters = duplicateGroupsToClusters(sampleGroups());
    expect(clusters).toHaveLength(1);
    expect(clusters[0].clusterId).toBe('hash-abc123456789');
    // Real byte counts formatted honestly — no invented "4.8 GB" style claims.
    expect(clusters[0].potentialSavings).toBe('5 MB');
    expect(clusters[0].similarity).toBe('Exact match — identical content hash');
    expect(clusters[0].files).toHaveLength(2);
    expect(clusters[0].files[0].isOriginal).toBe(true);
    expect(clusters[0].files[0].size).toBe('5 MB');
    expect(clusters[0].files[0].modified).toBe('2026-09-22');
  });

  it('maps an empty group list to zero clusters', () => {
    expect(duplicateGroupsToClusters([])).toEqual([]);
  });

  it('renders clusters passed in (tab no longer permanently empty)', () => {
    const clusters = duplicateGroupsToClusters(sampleGroups());
    const html = renderToStaticMarkup(
      <DriveCleanerSubView
        clusters={clusters}
        hasScanned
        onScan={() => {}}
        onOpenCleanup={() => {}}
      />,
    );
    expect(html).toContain('Duplicate Files (1)');
    expect(html).toContain('Design_System.fig');
    expect(html).toContain('Review &amp; clean up');
    expect(html).toContain('Reclaimable: 5 MB');
  });

  it('shows an honest "No scan yet" state with a scan trigger before any scan', () => {
    let clicked = false;
    const html = renderToStaticMarkup(
      <DriveCleanerSubView
        clusters={[]}
        hasScanned={false}
        onScan={() => {
          clicked = true;
        }}
      />,
    );
    expect(html).toContain('No scan yet');
    expect(html).toContain('Scan for duplicates');
    // Must NOT claim "Your Drive looks clean" when nothing was ever scanned.
    expect(html).not.toContain('Duplicate scans will appear here');
    void clicked;
  });

  it('shows the honest no-duplicates state only after a completed scan', () => {
    const html = renderToStaticMarkup(
      <DriveCleanerSubView clusters={[]} hasScanned onScan={() => {}} />,
    );
    expect(html).toContain('No duplicates found');
    expect(html).toContain('Rescan for duplicates');
  });

  it('renders the scanning progress state while a scan is running', () => {
    const html = renderToStaticMarkup(
      <DriveCleanerSubView clusters={[]} isScanning hasScanned onScan={() => {}} />,
    );
    expect(html).toContain('Scanning…');
    expect(html).not.toContain('No scan yet');
  });

  it('surfaces scan errors honestly instead of a silent empty panel', () => {
    const html = renderToStaticMarkup(
      <DriveCleanerSubView
        clusters={[]}
        hasScanned
        scanError="Scan failed with status 500"
        onScan={() => {}}
      />,
    );
    expect(html).toContain('Duplicate scan failed: Scan failed with status 500');
    expect(html).toContain('role="alert"');
  });
});
