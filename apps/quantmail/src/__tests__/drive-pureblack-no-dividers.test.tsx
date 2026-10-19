import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { DriveStarredSubView } from '../app/drive/components/DriveStarredSubView';
import { DriveRecentSubView } from '../app/drive/components/DriveRecentSubView';
import { FormattingToolbar } from '../app/drive/doc/[docId]/FormattingToolbar';

// QM-FIX-LOOP — Drive pure-black / no-divider-lines design lock.
// The user-locked QuantMail rule: pure-black surfaces, NO divider lines;
// separation comes from spacing/gap, never border-t/b or divide-y — and
// NEVER vertical hairlines (w-px) either; group separation is gap-only.
// This suite fails loudly if any Drive surface file reintroduces a divider
// class, a vertical hairline, an <hr>, or a GitHub-dark #0D1117 surface.

// Vertical hairline: Tailwind `w-px` is only ever used in this codebase for
// 1px divider lines (verified 2026-10-19: every occurrence was a hairline),
// so the lock scans for the utility itself — not a substring, but the real
// `w-px` class token.
const VERTICAL_DIVIDER_CLASS_RE = /(^|["'`\s])w-px(?![a-z0-9-])/;

const DRIVE_DIR = path.resolve(__dirname, '../app/drive');

function driveSourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (/\.(tsx?|jsx?)$/.test(entry.name)) out.push(p);
    }
  };
  walk(DRIVE_DIR);
  return out;
}

// Matches real Tailwind divider utilities (border-t / border-b / divide-y)
// while ignoring substring false positives like `border-transparent`
// (contains "border-t…") or `border-black` (contains "border-b…").
const DIVIDER_CLASS_RE = /(^|["'`\s])((border-[tb](?![a-z-])|divide-y(?![a-z-])))/;

// GitHub-dark code-block surfaces (the old code/text preview block):
// #0B0C0E container, #0E1014 gutter, #22262E gutter edge.
const OFF_BLACK_CODE_BLOCK_RES = [/#0b0c0e/i, /#0e1014/i, /#22262e/i];
// Real `border-r` utility only — must not match border-red-*/border-rose-*.
const GUTTER_DIVIDER_RE = /(^|["'`\s])border-r(?![a-z0-9-])/;

// WCAG relative luminance / contrast — used by the gutter-legibility guard.
function relativeLuminance(hex: string): number {
  const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = rgb.map((c) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4),
  );
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function contrastRatio(hexA: string, hexB: string): number {
  const [lighter, darker] = [relativeLuminance(hexA), relativeLuminance(hexB)].sort(
    (a, b) => b - a,
  );
  return (lighter + 0.05) / (darker + 0.05);
}

describe('Drive design lock: no divider lines, pure-black surfaces', () => {
  const files = driveSourceFiles();

  it('covers the whole Drive surface (sanity: files were found)', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('no divider utility classes (border-t / border-b / divide-y) in any Drive source file', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      const hits = src.split('\n').filter((line) => DIVIDER_CLASS_RE.test(line));
      if (hits.length > 0) offenders.push(`${path.relative(DRIVE_DIR, f)}: ${hits[0].trim()}`);
    }
    expect(offenders, 'divider classes violate the no-divider-lines lock').toEqual([]);
  });

  it('no <hr> elements in any Drive source file', () => {
    const offenders = files.filter((f) => /<hr[\s>]/.test(fs.readFileSync(f, 'utf8')));
    expect(offenders.map((f) => path.relative(DRIVE_DIR, f))).toEqual([]);
  });

  it('no GitHub-dark #0D1117 surfaces in any Drive source file (pure black only)', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      if (/#0d1117/i.test(src)) offenders.push(path.relative(DRIVE_DIR, f));
    }
    expect(offenders, '#0D1117 surfaces violate the pure-black lock').toEqual([]);
  });

  it('no vertical hairlines (w-px) in any Drive source file — group separation is gap-only', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      const hits = src.split('\n').filter((line) => VERTICAL_DIVIDER_CLASS_RE.test(line));
      if (hits.length > 0) offenders.push(`${path.relative(DRIVE_DIR, f)}: ${hits[0].trim()}`);
    }
    expect(offenders, 'vertical hairlines violate the no-divider-lines lock').toEqual([]);
  });

  it('rendered FormattingToolbar carries no vertical hairline (group spacing via gap-1 only)', () => {
    const html = renderToStaticMarkup(
      <FormattingToolbar
        currentType="paragraph"
        onConvertType={() => {}}
        onFormatText={() => {}}
      />,
    );
    expect(html).toContain('Bold (Ctrl+B)');
    expect(html).not.toMatch(VERTICAL_DIVIDER_CLASS_RE);
    // The toolbar container still provides gap-based group separation.
    expect(html).toMatch(/flex items-center gap-1/);
  });

  it('no off-black code-block surfaces (#0B0C0E / #0E1014 / #22262E) in any Drive source file', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      const hit = OFF_BLACK_CODE_BLOCK_RES.find((re) => re.test(src));
      if (hit) offenders.push(`${path.relative(DRIVE_DIR, f)}: ${hit.source}`);
    }
    expect(offenders, 'off-black surfaces violate the pure-black lock').toEqual([]);
  });

  it('no right-edge gutter dividers (border-r) in any Drive source file', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      const hits = src.split('\n').filter((line) => GUTTER_DIVIDER_RE.test(line));
      if (hits.length > 0) offenders.push(`${path.relative(DRIVE_DIR, f)}: ${hits[0].trim()}`);
    }
    expect(offenders, 'gutter dividers violate the no-divider-lines lock').toEqual([]);
  });

  it('code/text preview renders on pure black with a legible gutter (queue: code-preview pureblack)', () => {
    const src = fs.readFileSync(path.resolve(DRIVE_DIR, 'page.tsx'), 'utf8');
    // The preview container sits on the pure-black token, not an off-black hex.
    expect(src).toMatch(
      /flex bg-\[var\(--quant-background\)\] border border-\[var\(--quant-surface-elevated\)\] rounded-lg max-h-\[30rem\]/,
    );
    // Gutter: no divider, no off-black surface; gutter separation is gap-only
    // (gutter px-3 + code p-3). Line numbers keep the dimmed gutter look but
    // must meet 4.5:1 against pure black (--quant-background = #000000).
    const gutter = src
      .split('\n')
      .find((l) => l.includes('select-none') && l.includes('text-right'));
    expect(gutter, 'code-preview gutter line exists').toBeDefined();
    expect(gutter).not.toMatch(GUTTER_DIVIDER_RE);
    expect(gutter).not.toMatch(/#0e1014/i);
    const color = gutter!.match(/text-\[(#[0-9a-fA-F]{6})\]/)?.[1];
    expect(color, 'gutter line-number color is a fixed hex').toBeDefined();
    expect(contrastRatio(color!, '#000000')).toBeGreaterThanOrEqual(4.5);
  });

  it('rendered Drive subviews carry no divider classes (DriveStarredSubView)', () => {
    const html = renderToStaticMarkup(
      <DriveStarredSubView
        items={[
          {
            id: 's1',
            name: 'pinned-doc.pdf',
            type: 'file',
            mimeType: 'application/pdf',
            size: 1024,
            modifiedAt: '2026-10-11T10:00:00Z',
            isStarred: true,
            scanStatus: 'clean',
          },
        ]}
      />,
    );
    expect(html).toContain('pinned-doc.pdf');
    expect(DIVIDER_CLASS_RE.test(html)).toBe(false);
    expect(html).not.toMatch(/#0d1117/i);
  });

  it('rendered Drive subviews carry no divider classes (DriveRecentSubView)', () => {
    const html = renderToStaticMarkup(
      <DriveRecentSubView items={[]} loading={false} />,
    );
    expect(DIVIDER_CLASS_RE.test(html)).toBe(false);
    expect(html).not.toMatch(/#0d1117/i);
  });
});
