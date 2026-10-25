import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync, readdirSync } from 'node:fs';
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
 *
 * DERIVATION (wave-plan contract, supersedes the PR's first pass): the
 * first pass only swapped the CODE glow's hue to rgba(34,197,94,0.2) — the
 * literal value of today's token. That still breaks on a theme change, so
 * the selected glow is now DERIVED from the token itself via
 * color-mix(in srgb, var(--quant-success) 20%, transparent) — the same
 * color-mix mechanism this file already uses for its --app-accent glows.
 * Any rgba green literal on the CODE card is a regression, even one that
 * happens to match today's token value.
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

  it('CODE card glow is DERIVED from the token, not a hue-matched rgba literal', () => {
    // No green literal may survive on the CODE card — neither the old
    // emerald rgba nor the new token-hue rgba that merely matches today's
    // --quant-success value. A hardcoded rgba that looks identical today
    // does NOT satisfy the derivation contract.
    expect(FILES_SUBVIEW_SRC).not.toContain('rgba(16,185,129');
    expect(FILES_SUBVIEW_SRC).not.toContain('rgba(34,197,94');
    expect(FILES_SUBVIEW_SRC).not.toContain('#22C55E');
    expect(FILES_SUBVIEW_SRC).not.toContain('#22c55e');
    expect(SCAN_BADGE_SRC).not.toContain('rgba(16,185,129');
    expect(SCAN_BADGE_SRC).not.toContain('rgba(34,197,94');
    expect(SCAN_BADGE_SRC).not.toContain('#22C55E');
    expect(SCAN_BADGE_SRC).not.toContain('#22c55e');
    // The selected glow's entire color is the token reference, mixed to
    // 20% over transparent — the 0.2-alpha glow of the old literal, now
    // expressed through the token (same color-mix mechanism this file
    // already uses for its --app-accent glows).
    expect(FILES_SUBVIEW_SRC).toContain(
      'shadow-[0_0_16px_color-mix(in_srgb,var(--quant-success)_20%,transparent)]',
    );
  });

  it('token change moves the glow: the glow carries no color of its own', () => {
    // Strongest proof available without a live browser / computed styles:
    // extract the CODE selected-glow class from source and substitute a
    // hypothetical new token value. If the glow followed the token, the
    // substituted value is the glow's ONLY color; if any literal green
    // survived, the substitution would leave a second color behind.
    const glowClasses = FILES_SUBVIEW_SRC.match(/shadow-\[0_0_16px_[^\]]+\]/g) ?? [];
    const codeGlow = glowClasses.find((c) => c.includes('var(--quant-success)'));
    expect(codeGlow).toBeDefined();
    const retokened = codeGlow!.replace('var(--quant-success)', '#ABCDEF');
    expect(retokened).toContain('#ABCDEF');
    expect(retokened).not.toMatch(/#(?:10B981|22C55E)|rgba\((?:16,185,129|34,197,94)/i);
    expect(retokened).not.toContain('var(--quant-success)');
  });

  it('--quant-success resolves to one value in every theme (globals.css audit)', () => {
    // The PR claimed #22C55E in every theme — verified here, not assumed:
    // every --quant-success definition in globals.css must agree, and no
    // other app stylesheet may redefine it to something else.
    const globalsCss = readFileSync(
      join(new URL('../app', import.meta.url).pathname, 'globals.css'),
      'utf8',
    );
    const definitions = [...globalsCss.matchAll(/--quant-success:\s*([^;]+);/g)].map(
      (m) => m[1].trim(),
    );
    expect(definitions.length).toBeGreaterThan(0);
    expect(new Set(definitions)).toEqual(new Set(['#22C55E']));
    const appDir = new URL('../app', import.meta.url).pathname;
    for (const entry of readdirSync(appDir)) {
      if (!entry.endsWith('.css') || entry === 'globals.css') continue;
      const css = readFileSync(join(appDir, entry), 'utf8');
      const other = [...css.matchAll(/--quant-success:\s*([^;]+);/g)].map((m) => m[1].trim());
      expect(other).toEqual([]);
    }
  });

  it('sibling cards unchanged: still their tokens + hue-matched glows', () => {
    // Contract scope: DOC/ZIP/PDF cards are NOT re-derived in this change.
    // Their selected glows remain hue-matched rgba literals (the pre-existing
    // sibling pattern) — pinned here so this change cannot silently alter
    // them, and flagged as known residual, not as derived.
    expect(FILES_SUBVIEW_SRC).toContain('shadow-[0_0_16px_rgba(239,68,68,0.2)]');
    expect(FILES_SUBVIEW_SRC).toContain('shadow-[0_0_16px_rgba(59,130,246,0.2)]');
    expect(FILES_SUBVIEW_SRC).toContain('shadow-[0_0_16px_rgba(245,158,11,0.2)]');
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
