import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ContactsSlowLoadNotice } from '../app/contacts/components/ContactsSlowLoadNotice';

// QM-FIX-LOOP — Contacts pure-black / no-divider-lines design lock.
// The user-locked QuantMail rule: pure-black surfaces, NO divider lines;
// separation comes from spacing/gap, never border-t/b/r or divide-x/y.
// This suite fails loudly if any Contacts surface file reintroduces a
// divider class, an <hr>, or a neutral off-black surface.
// Intentionally NOT flagged (same as the drive/quantgit lock suites):
//   - card outer borders (rounded-2xl border border-[#232938] etc.) are
//     container edges, not divider lines;
//   - accent-tinted surfaces (#3F1E0E amber tint, #0D0B06 suggestion card,
//     accent color-mix gradients) are the per-app Contacts-amber design,
//     not "off-black surfaces";
//   - semantic colors (warning #78350F, favorite star #FFB020).

const CONTACTS_DIR = path.resolve(__dirname, '../app/contacts');

function contactsSourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__') walk(p);
      } else if (/\.(tsx?|jsx?)$/.test(entry.name)) out.push(p);
    }
  };
  walk(CONTACTS_DIR);
  return out;
}

// Matches real Tailwind divider utilities (border-t / border-b / border-r /
// divide-x / divide-y) while ignoring substring false positives like
// `border-transparent` (contains "border-t…") or `border-black`.
const DIVIDER_CLASS_RE = /(^|["'`\s])((border-[tbr](?![a-z-])|divide-[xy](?![a-z-])))/;

// Neutral off-black SURFACE hexes (bg-/from-/to- + gradient utilities), the
// ones removed by the pure-black pass. Card outer *border* hexes are allowed
// (container edges), so the regex is anchored to surface utilities.
const OFFBLACK_SURFACE_RE =
  /(bg|from|to)-\[#(?:0B0E14|0E1118|1E2433|10131B|161A24|1E2536|181E2B|141A24|141824|0D0E11|1F2228|1F293D|111827|0D131F|101826|0A121D|262C3A|232938)\]/i;

describe('Contacts design lock: no divider lines, pure-black surfaces', () => {
  const files = contactsSourceFiles();

  it('covers the whole Contacts surface (sanity: files were found)', () => {
    expect(files.length).toBeGreaterThan(4);
  });

  it('no divider utility classes (border-t / border-b / border-r / divide-x / divide-y) in any Contacts source file', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      const hits = src.split('\n').filter((line) => DIVIDER_CLASS_RE.test(line));
      if (hits.length > 0) offenders.push(`${path.relative(CONTACTS_DIR, f)}: ${hits[0].trim()}`);
    }
    expect(offenders, 'divider classes violate the no-divider-lines lock').toEqual([]);
  });

  it('no <hr> elements or h-px hairline dividers in any Contacts source file', () => {
    const offenders = files.filter((f) => /<hr[\s>]|h-px bg-\[/.test(fs.readFileSync(f, 'utf8')));
    expect(offenders.map((f) => path.relative(CONTACTS_DIR, f))).toEqual([]);
  });

  it('no neutral off-black surfaces in any Contacts source file (pure black only)', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      const hits = src.split('\n').filter((line) => OFFBLACK_SURFACE_RE.test(line));
      if (hits.length > 0) offenders.push(`${path.relative(CONTACTS_DIR, f)}: ${hits[0].trim()}`);
    }
    expect(offenders, 'off-black surfaces violate the pure-black lock').toEqual([]);
  });

  it('no border-t-transparent CSS spinners remain (SVG spinners only)', () => {
    const offenders = files.filter((f) => /border-t-transparent/.test(fs.readFileSync(f, 'utf8')));
    expect(offenders.map((f) => path.relative(CONTACTS_DIR, f))).toEqual([]);
  });

  it('rendered ContactsSlowLoadNotice carries no divider classes or off-black surfaces', () => {
    const html = renderToStaticMarkup(<ContactsSlowLoadNotice onRetry={() => {}} />);
    expect(html).toContain('Taking longer than usual');
    expect(DIVIDER_CLASS_RE.test(html)).toBe(false);
    expect(OFFBLACK_SURFACE_RE.test(html)).toBe(false);
  });
});
