import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as fs from 'node:fs';
import * as path from 'node:path';

// The modal talks to the same-origin Next proxy via @quant/api-client.
// Stub it so these tests run without the backend.
vi.mock('@quant/api-client', () => ({
  apiFetchRaw: vi.fn(),
}));

import { CalendarContextSubTabs } from '../app/calendar/components/CalendarContextSubTabs';
import { CalendarMobileTabStrip } from '../app/calendar/components/CalendarMobileTabStrip';
import { BookingLinksModal } from '../app/calendar/components/BookingLinksModal';

// QM-FIX-LOOP — Calendar pure-black / no-divider-lines design lock
// (fix/qm-calendar-divider-cleanup).
// The user-locked QuantMail rule: pure-black surfaces, NO divider lines;
// separation comes from spacing/typography, never border-t/b/r or divide-x/y.
// This suite fails loudly if any covered calendar file reintroduces a section
// divider class, an <hr>, or an off-black surface hex.
// Intentionally NOT flagged (same as the drive/contacts/search/quantgit lock suites):
//   - the event-form sheet's rounded outer container edge (`border-t md:border`
//     on mobile, full `border` on desktop) is chrome, not a section divider;
//   - the period sub-tab active indicator is `border-b-2` (excluded from the
//     regex by its negative lookahead);
//   - CSS loading spinners, chip/card/pill full `border`s, and progress-bar
//     segment `border-r`s are functional indicators, not divider lines;
//   - form-control surfaces (inputs on bg-[var(--quant-surface)]) keep their
//     own styling.

const CAL_DIR = path.resolve(__dirname, '../app/calendar');

// Files whose dividers + off-black surfaces this fix removed.
const COVERED = [
  'components/CalendarEventForm.tsx',
  'components/CalendarContextSubTabs.tsx',
  'components/CalendarMobileTabStrip.tsx',
  'components/BookingLinksModal.tsx',
  'booking/[slug]/page.tsx',
];

// Matches real Tailwind divider utilities (border-t / border-b / border-r /
// divide-x / divide-y) while ignoring substring false positives like
// `border-transparent` (contains "border-t…"), `border-b-2` (tab indicator),
// `border-t-[var(--app-accent)]` (spinner), or `border-black`.
const DIVIDER_CLASS_RE = /(^|["'`\s])((border-[tbr](?![a-z-])|divide-[xy](?![a-z-])))/;

// Off-black surface hexes this fix replaced with pure black (#000000).
const OFFBLACK_HEX_RE = /#(?:121216|0e1014|0c0c10|0c0c0f|1e1e24)\b/i;

// Sheet container edge — chrome, not a section divider (see header comment).
const SHEET_EDGE_FRAGMENT = 'bg-black border-t md:border border-[#3A404D]/60';

function readCovered(relative: string): string {
  return fs.readFileSync(path.join(CAL_DIR, relative), 'utf8');
}

function dividerHits(src: string): string[] {
  // The sheet container edge is an intentional keeper — strip it before the scan.
  const stripped = src.split(SHEET_EDGE_FRAGMENT).join('');
  return stripped
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => DIVIDER_CLASS_RE.test(line));
}

describe('Calendar design lock: no divider lines, pure-black surfaces', () => {
  it('covers the calendar surface (sanity: all fixed files exist)', () => {
    for (const f of COVERED) {
      expect(fs.existsSync(path.join(CAL_DIR, f)), `${f} must exist`).toBe(true);
    }
  });

  it('no divider utility classes (border-t / border-b / border-r / divide-x / divide-y) in covered calendar files', () => {
    const offenders: string[] = [];
    for (const f of COVERED) {
      const hits = dividerHits(readCovered(f));
      if (hits.length > 0) offenders.push(`${f}: ${hits[0].slice(0, 100)}`);
    }
    expect(offenders, 'divider classes violate the no-divider-lines lock').toEqual([]);
  });

  it('no off-black surface hexes (#121216, #0e1014, #0c0c10, #0c0c0f, #1e1e24) in covered calendar files', () => {
    const offenders: string[] = [];
    for (const f of COVERED) {
      const hits = readCovered(f)
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => OFFBLACK_HEX_RE.test(line));
      if (hits.length > 0) offenders.push(`${f}: ${hits[0].slice(0, 100)}`);
    }
    expect(offenders, 'off-black surfaces violate the pure-black lock').toEqual([]);
  });

  it('no <hr> elements or h-px hairline dividers in covered calendar files', () => {
    const offenders = COVERED.filter((f) =>
      /<hr[\s>]|h-px bg-\[/.test(readCovered(f)),
    );
    expect(offenders).toEqual([]);
  });

  it('rendered CalendarContextSubTabs tab bar is pure black with no divider lines', () => {
    const html = renderToStaticMarkup(
      <CalendarContextSubTabs activeTab="feed" onSelectTab={() => {}} />,
    );
    expect(html).toContain('bg-black');
    expect(DIVIDER_CLASS_RE.test(html), 'no divider classes in rendered tab bar').toBe(
      false,
    );
    expect(OFFBLACK_HEX_RE.test(html), 'no off-black hexes in rendered tab bar').toBe(
      false,
    );
  });

  it('rendered CalendarMobileTabStrip is pure black with no divider lines', () => {
    const html = renderToStaticMarkup(
      <CalendarMobileTabStrip activeTab="month" onSelectTab={() => {}} />,
    );
    expect(html).toContain('bg-black');
    expect(DIVIDER_CLASS_RE.test(html), 'no divider classes in rendered strip').toBe(
      false,
    );
    expect(OFFBLACK_HEX_RE.test(html), 'no off-black hexes in rendered strip').toBe(
      false,
    );
  });

  it('rendered BookingLinksModal header/footer are pure black with no divider lines', () => {
    const html = renderToStaticMarkup(
      <BookingLinksModal isOpen={true} onClose={() => {}} userEmail="qa@quantmail.in" />,
    );
    expect(html).toContain('Booking Links');
    expect(html).toContain('bg-black');
    expect(DIVIDER_CLASS_RE.test(html), 'no divider classes in rendered modal').toBe(
      false,
    );
    expect(OFFBLACK_HEX_RE.test(html), 'no off-black hexes in rendered modal').toBe(
      false,
    );
  });
});
