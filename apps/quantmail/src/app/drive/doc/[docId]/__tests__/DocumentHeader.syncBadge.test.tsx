// The doc-editor header badge must be honest about save state: a document
// that was never written to the backend (404 on initial load) shows
// "Not saved yet", never the false "✓ Saved".
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DocumentHeader } from '../DocumentHeader';
import type { SyncStatus } from '../types';

function renderBadge(syncStatus: SyncStatus): string {
  return renderToStaticMarkup(
    <DocumentHeader
      docId="doc-1"
      title="Untitled Document"
      onTitleChange={() => {}}
      syncStatus={syncStatus}
      lastSaved={null}
      collaborators={[]}
      isPublic={false}
      onTogglePublic={() => {}}
      onExportMarkdown={() => {}}
      onImportMarkdown={() => {}}
    />,
  );
}

describe('DocumentHeader sync badge honesty', () => {
  it('renders "Not saved yet" — never "✓ Saved" — for a never-written doc', () => {
    const html = renderBadge('unsaved');

    expect(html).toContain('Not saved yet');
    expect(html).not.toContain('✓ Saved');
  });

  it('still renders "✓ Saved" after a real write was accepted', () => {
    const html = renderBadge('saved');

    expect(html).toContain('✓ Saved');
  });

  it('renders the failure badge on a rejected write', () => {
    const html = renderBadge('error');

    expect(html).toContain('Save failed');
  });
});
