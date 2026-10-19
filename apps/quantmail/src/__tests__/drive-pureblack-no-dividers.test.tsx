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
