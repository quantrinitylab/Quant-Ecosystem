import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DriveFilesSubView } from '../app/drive/components/DriveFilesSubView';
import { FileScanBadge } from '../app/drive/components/FileScanBadge';

// The quota meter reads the real GET /api/drive/quota through this hook; the
// suite pins it to a known value instead of letting the meter fetch.
vi.mock('../hooks/useStorageQuota', () => ({
  useStorageQuota: () => ({
    quota: { used: 14.2 * 1024 ** 3, total: 100 * 1024 ** 3 },
    known: true,
    usedPct: 14,
    isLoading: false,
    error: null,
  }),
}));

/**
 * qm-drive-filetype-palette — the drive file-type palette must be token-only.
 *
 * Regression pin for the 2026-10-11 [P2] finding: the CODE type card in
 * DriveFilesSubView and the clean state in FileScanBadge hardcoded #10B981
 * while every neighboring card/state used design tokens (--quant-info,
 * --quant-warning, --quant-destructive). The shared semantic-success token
 * is --quant-success (globals.css: #22C55E in every theme), so both green
 * surfaces now resolve through it. A future hardcoded green here regresses
 * the palette back to one raw hex among tokens.
 */

const COMPONENTS_DIR = join(
  new URL('../app/drive/components', import.meta.url).pathname,
);

const FILES_SUBVIEW_SRC = readFileSync(
  join(COMPONENTS_DIR, 'DriveFilesSubView.tsx'),
  'utf8',
);
const SCAN_BADGE_SRC = readFileSync(
  join(COMPONENTS_DIR, 'FileScanBadge.tsx'),
  'utf8',
);

describe('qm-drive-filetype-palette: no raw green hex in the file-type palette', () => {
  it('DriveFilesSubView source contains no #10B981', () => {
    expect(FILES_SUBVIEW_SRC).not.toContain('#10B981');
    expect(FILES_SUBVIEW_SRC).not.toContain('#10b981');
  });

  it('FileScanBadge source contains no #10B981', () => {
    expect(SCAN_BADGE_SRC).not.toContain('#10B981');
    expect(SCAN_BADGE_SRC).not.toContain('#10b981');
  });

  it('both green surfaces use the shared --quant-success token', () => {
    expect(FILES_SUBVIEW_SRC).toContain('var(--quant-success)');
    expect(SCAN_BADGE_SRC).toContain('var(--quant-success)');
  });

  it('neighboring type cards still use their tokens (no collateral change)', () => {
    expect(FILES_SUBVIEW_SRC).toContain('var(--quant-destructive)');
    expect(FILES_SUBVIEW_SRC).toContain('var(--quant-info)');
    expect(FILES_SUBVIEW_SRC).toContain('var(--quant-warning)');
    expect(SCAN_BADGE_SRC).toContain('var(--quant-destructive)');
    expect(SCAN_BADGE_SRC).toContain('var(--quant-warning)');
  });

  it('CODE card glow uses the token hue, not the old emerald rgba', () => {
    expect(FILES_SUBVIEW_SRC).not.toContain('rgba(16,185,129');
    expect(FILES_SUBVIEW_SRC).toContain('rgba(34,197,94,0.2)');
  });
});

describe('qm-drive-filetype-palette: rendered output is token-based', () => {
  it('clean scan badge renders the success token, never the raw hex', () => {
    const html = renderToStaticMarkup(<FileScanBadge status="clean" />);
    expect(html).toContain('Scanned · clean');
    expect(html).toContain('var(--quant-success)');
    expect(html).not.toContain('#10B981');
  });

  it('CODE type card renders the success token, never the raw hex', () => {
    const html = renderToStaticMarkup(
      <DriveFilesSubView
        files={[
          {
            id: 'file-1',
            name: 'chunker.rs',
            type: 'file',
            mimeType: 'text/x-rust',
            size: 5200000,
            modifiedAt: '2026-09-29T11:15:00Z',
            isStarred: false,
          },
        ]}
        folders={[]}
      />,
    );
    expect(html).toContain('Code &amp; Scripts');
    expect(html).toContain('var(--quant-success)');
    expect(html).not.toContain('#10B981');
  });
});
