/**
 * fix/qm-drive-disable-download-5 — public share page honest-copy tests.
 *
 * DriveFileCard is imported from drive-file-card.tsx, NOT page.tsx: Next.js
 * rejects named exports from page files, which red-lit `next build` on
 * PR #1527. The tests below are the -4 suite plus the bottom-note case.
 *
 * When the owner hides the download action for viewers on a link, the
 * landing page must never tell the viewer to "download it to view" (the
 * action is hidden) nor promise a preview "above" when no preview exists
 * for the file type. Both contradictions shipped in
 * fix/qm-drive-disable-download-3. The copy must also say plainly that
 * hiding the button is not copy protection.
 *
 * No real fixtures: payloads are synthetic and nothing hits the network.
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';

import { DriveFileCard } from '../app/drive/share/[token]/drive-file-card';
import type { DriveFileShareInfo } from '../app/drive/share/[token]/share-resolve';

function fileInfo(overrides: Partial<DriveFileShareInfo> = {}): DriveFileShareInfo {
  return {
    id: 'file-1',
    name: 'archive.zip',
    size: 1024,
    mimeType: 'application/zip',
    updatedAt: null,
    role: 'viewer',
    ownerName: 'Owner',
    requiresPassword: false,
    expiresAt: null,
    scope: 'anyone',
    requiresSignIn: false,
    disableDownload: true,
    ...overrides,
  };
}

function renderCard(file: DriveFileShareInfo): string {
  return renderToStaticMarkup(
    React.createElement(DriveFileCard, {
      share: { kind: 'drive-file', file },
      token: 'tok-1',
    }),
  );
}

describe('share page download-hidden honest copy', () => {
  it('unpreviewable file + hidden download never says "download it to view"', () => {
    const html = renderCard(fileInfo());
    expect(html).toContain('Download button hidden for viewers');
    expect(html).not.toContain('download it to view');
    expect(html).not.toContain('Download file</button>');
    expect(html).toContain('ask the owner for access');
    expect(html).toContain('not copy protection');
  });

  it('unpreviewable file + allowed download keeps the download affordance', () => {
    const html = renderCard(fileInfo({ disableDownload: false }));
    expect(html).toContain('download it to view');
    expect(html).toContain('Download file');
    expect(html).not.toContain('Download button hidden for viewers');
    expect(html).not.toContain('not copy protection');
  });

  it('hidden download on a previewable file hides the download button, keeps the preview', () => {
    const html = renderCard(
      fileInfo({ mimeType: 'image/png', name: 'photo.png', disableDownload: true }),
    );
    expect(html).toContain('Download button hidden for viewers');
    expect(html).toContain('preview the file above');
    expect(html).not.toContain('Download file</button>');
    expect(html).toContain('not copy protection');
    // The preview lane URL (inline), never the bare download endpoint.
    expect(html).toContain('preview=1');
  });

  it('unpreviewable file + hidden download never promises a preview above', () => {
    const html = renderCard(fileInfo());
    expect(html).not.toContain('preview the file above');
    expect(html).toContain('ask the owner for access');
  });

  it('editor-role link never shows the hidden badge', () => {
    const html = renderCard(fileInfo({ role: 'editor', disableDownload: true }));
    expect(html).not.toContain('Download button hidden for viewers');
    expect(html).toContain('Download file');
  });
});
