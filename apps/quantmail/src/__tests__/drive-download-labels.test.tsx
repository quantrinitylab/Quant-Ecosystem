// ============================================================================
// BB-P1-6 — Drive Download buttons must be honestly labeled.
// Document ids (`doc:<id>`) route to the document editor via the same
// onDownloadFile callback that downloads real files, so their control must
// read "Open", never "Download". Files keep "Download".
// ============================================================================

import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { isDocumentDriveId } from '../lib/drive-ids';
import { DriveRecentSubView, type RecentItem } from '../app/drive/components/DriveRecentSubView';

function item(partial: Partial<RecentItem> & { id: string }): RecentItem {
  return {
    name: 'note.doc',
    type: 'file',
    mimeType: 'application/octet-stream',
    size: 1024,
    modifiedAt: new Date().toISOString(),
    lastOpenedAt: null,
    isStarred: false,
    ...partial,
  };
}

describe('BB-P1-6 honest download labels', () => {
  it('classifies doc: ids as documents and everything else as files', () => {
    expect(isDocumentDriveId('doc:abc123')).toBe(true);
    expect(isDocumentDriveId('doc:')).toBe(true);
    expect(isDocumentDriveId('file:xyz')).toBe(false);
    expect(isDocumentDriveId('abc')).toBe(false);
  });

  it('labels a document row "Open" with an honest tooltip', () => {
    const html = renderToStaticMarkup(
      <DriveRecentSubView items={[item({ id: 'doc:abc123', name: 'Meeting notes' })]} />,
    );
    expect(html).toContain('>Open<');
    expect(html).toContain('title="Open in editor"');
    expect(html).not.toContain('>Download<');
  });

  it('keeps "Download" for real file rows', () => {
    const html = renderToStaticMarkup(
      <DriveRecentSubView items={[item({ id: 'file:xyz', name: 'report.pdf' })]} />,
    );
    expect(html).toContain('>Download<');
    expect(html).not.toContain('>Open<');
  });
});
