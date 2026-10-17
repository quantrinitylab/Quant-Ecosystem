import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { QuantGitRowSkeleton } from '../app/(app)/quantgit/components/QuantGitSkeletons';

// QM-FIX-LOOP — QuantGit no-divider-lines design lock.
// The user-locked QuantMail rule: NO divider lines; separation comes from
// spacing/gap, never border-t/b or divide-x/divide-y. This suite fails loudly
// if any QuantGit surface file reintroduces a divider utility class, an <hr>,
// or a border-t-transparent CSS spinner.

const QUANTGIT_DIR = path.resolve(__dirname, '../app/quantgit');

function quantgitSourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (/\.(tsx?|jsx?)$/.test(entry.name)) out.push(p);
    }
  };
  walk(QUANTGIT_DIR);
  return out;
}

// Matches real Tailwind divider utilities (border-t / border-b / divide-x /
// divide-y, incl. the border-t-transparent spinner idiom) while ignoring
// substring false positives like `border-transparent` (contains "border-t…")
// or `border-black` (contains "border-b…"). `border-t-0` / `last:border-b-0`
// resets are also excluded.
const DIVIDER_CLASS_RE =
  /(^|["'`\s])((border-t-transparent|border-[tb](?![a-z-])|divide-[xy](?![a-z-])))/;

describe('QuantGit design lock: no divider lines', () => {
  const files = quantgitSourceFiles();

  it('covers the whole QuantGit surface (sanity: files were found)', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('no divider utility classes (border-t / border-b / divide-x / divide-y) in any QuantGit source file', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      const hits = src
        .split('\n')
        .filter((line) => DIVIDER_CLASS_RE.test(line));
      if (hits.length > 0)
        offenders.push(`${path.relative(QUANTGIT_DIR, f)}: ${hits[0].trim()}`);
    }
    expect(offenders, 'divider classes violate the no-divider-lines lock').toEqual([]);
  });

  it('no <hr> elements in any QuantGit source file', () => {
    const offenders = files.filter((f) =>
      /<hr[\s>]/.test(fs.readFileSync(f, 'utf8')),
    );
    expect(offenders.map((f) => path.relative(QUANTGIT_DIR, f))).toEqual([]);
  });

  it('rendered QuantGitRowSkeleton carries no divider classes', () => {
    const html = renderToStaticMarkup(<QuantGitRowSkeleton rows={3} />);
    expect(html).toContain('quantgit-row-skeleton');
    expect(DIVIDER_CLASS_RE.test(html)).toBe(false);
  });
});
