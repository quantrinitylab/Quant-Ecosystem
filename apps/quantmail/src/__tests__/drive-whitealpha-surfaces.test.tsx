// QM-FIX-LOOP (fix/qm-drive-pure-black-surfaces-2) — Drive white-alpha overlay lock.
// The user-locked QuantMail rule: pure-black surfaces on Drive UI — no
// white-alpha overlay bases (bg-white/[0.02..0.06]); rest surfaces use the
// #000 tokens (bg-[var(--quant-surface)]), hover feedback uses the approved
// hover token (hover:bg-[var(--quant-surface-hover)] = rgba(255,255,255,0.06)).
// This suite fails loudly if any of the fixed surfaces regresses to a
// white-alpha base. Prefixed variants (hover:/focus:) are the tokenized
// hover token and are allowed.
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { DriveSharedByMeSubView } from '../app/drive/components/DriveSharedByMeSubView';
import { DriveMobileTabStrip } from '../app/drive/components/DriveMobileTabStrip';
import type { SentShareItem } from '../hooks/useDrive';

const DRIVE_APP_DIR = path.resolve(__dirname, '../app/drive');
const QUANTY_WS = path.resolve(
  __dirname,
  '../components/drive/QuantyFileWorkspace.tsx',
);

// Unprefixed `bg-white/[...]` base utility only — variant-prefixed forms
// (hover:/focus:/focus-visible:/active:) are ignored so the tokenized hover
// token does not trip this guard.
const WHITE_ALPHA_BASE_RE = /(^|["'`\s])(bg-white\/\[[^\]]+\])/;

function baseWhiteAlphaHits(source: string): string[] {
  return source
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => WHITE_ALPHA_BASE_RE.test(l));
}

describe('Drive design lock: no white-alpha base surfaces (pure-black tokens only)', () => {
  // QM-FIX-LOOP audit note (queued, not fixed in this PR): QuantyFileWorkspace
  // command/text INPUTS (bg-white/[0.04]) are tracked as a separate queue
  // finding — this suite asserts only the fixed CARD pattern is gone there.
  const fixedFiles: Record<string, { file: string; forbidden: RegExp }> = {
    'DriveSharedByMeSubView.tsx (type chip)': {
      file: path.join(DRIVE_APP_DIR, 'components/DriveSharedByMeSubView.tsx'),
      forbidden: WHITE_ALPHA_BASE_RE,
    },
    'DriveMobileTabStrip.tsx (inactive pills)': {
      file: path.join(DRIVE_APP_DIR, 'components/DriveMobileTabStrip.tsx'),
      forbidden: WHITE_ALPHA_BASE_RE,
    },
    'page.tsx (unselected filter pills)': {
      file: path.join(DRIVE_APP_DIR, 'page.tsx'),
      forbidden: WHITE_ALPHA_BASE_RE,
    },
    'QuantyFileWorkspace.tsx (cards)': {
      file: QUANTY_WS,
      forbidden: /(^|["'`\s])(bg-white\/\[0\.02\])/,
    },
  };

  it('fixed surfaces carry no unprefixed bg-white/ base utility', () => {
    const offenders: string[] = [];
    for (const [label, { file, forbidden }] of Object.entries(fixedFiles)) {
      const src = fs.readFileSync(file, 'utf8');
      const hits = src
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => forbidden.test(l));
      if (hits.length > 0) offenders.push(`${label}: ${hits[0]}`);
    }
    expect(offenders, 'white-alpha base surfaces violate the pure-black lock').toEqual([]);
  });

  it('type chip renders on the pure-black surface token', () => {
    const items: SentShareItem[] = [
      {
        id: 'share-1',
        name: 'deck.pdf',
        type: 'file',
        mimeType: 'application/pdf',
        size: 1024,
        updatedAt: '2026-10-11T10:00:00Z',
        sharedCount: 2,
        sharedWith: [],
      },
    ];
    const html = renderToStaticMarkup(<DriveSharedByMeSubView items={items} />);
    expect(html).toContain('deck.pdf');
    // The type chip (PDF) sits on the token surface, not a white overlay.
    expect(html).toContain('bg-[var(--quant-surface)]');
    expect(baseWhiteAlphaHits(html)).toEqual([]);
  });

  it('inactive mobile tab pills render on the pure-black surface token with tokenized hover', () => {
    const html = renderToStaticMarkup(
      <DriveMobileTabStrip activeTab="home" onTabChange={() => {}} />,
    );
    // At least one inactive pill exists when "home" is active.
    expect(html).toContain('role="tab"');
    expect(html).toContain('bg-[var(--quant-surface)]');
    expect(html).toContain('hover:bg-[var(--quant-surface-hover)]');
    expect(baseWhiteAlphaHits(html)).toEqual([]);
  });

  it('page.tsx unselected filter pill uses the surface token + tokenized hover', () => {
    const src = fs.readFileSync(path.join(DRIVE_APP_DIR, 'page.tsx'), 'utf8');
    const pillLines = src
      .split('\n')
      .filter((l) => l.includes('hover:border-white/[0.14]'));
    expect(pillLines.length, 'unselected filter-pill ternary still exists').toBeGreaterThan(0);
    for (const pillLine of pillLines) {
      expect(pillLine).toContain('bg-[var(--quant-surface)]');
      expect(pillLine).toContain('hover:bg-[var(--quant-surface-hover)]');
      expect(pillLine).not.toMatch(WHITE_ALPHA_BASE_RE);
    }
  });

  it('QuantyFileWorkspace cards use the pure-black surface token', () => {
    const src = fs.readFileSync(QUANTY_WS, 'utf8');
    // Four card surfaces were tokenized (two aria-live cards + ternary + result card).
    const tokenHits = src.split('bg-[var(--quant-surface)]').length - 1;
    expect(tokenHits).toBeGreaterThanOrEqual(4);
  });
});
