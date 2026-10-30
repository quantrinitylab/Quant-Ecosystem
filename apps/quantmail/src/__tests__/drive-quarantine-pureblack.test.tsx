import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

// QM-FIX-LOOP — Drive quarantine notice card must be pure black.
// Root cause: the QM-M39-009 quarantine block (apps/quantmail/src/app/drive/page.tsx)
// used an off-black dark-red tinted surface bg-[#1A0E10]; the QuantMail design
// lock requires pure-black surfaces, with destructive accent carried by
// border/text color only. This suite fails loudly if the tinted surface
// returns, or if the destructive border/text accent is ever dropped.

const PAGE = path.resolve(__dirname, '../app/drive/page.tsx');

describe('Drive quarantine notice card: pure-black surface, destructive accent via border/text', () => {
  const lines = fs.readFileSync(PAGE, 'utf8').split('\n');

  // Locate the QM-M39-009 quarantine card — NOT the first role="alert" in the
  // file. That first alert is the deep-link search error ("Could not open the
  // file from search"), an amber warning notice, not a quarantine card; a
  // first-alert locator therefore asserted against the wrong card. The
  // quarantine card is the alert whose body says "This file is quarantined".
  function quarantineAlertIndex(): number {
    const alertIdxs = lines
      .map((l, i) => ({ l, i }))
      .filter(({ l }) => l.includes('role="alert"'))
      .map(({ i }) => i);
    const quarantineIdx = alertIdxs.find((idx) =>
      lines.slice(idx, idx + 25).some((l) => l.includes('This file is quarantined')),
    );
    expect(
      quarantineIdx,
      'quarantine notice card (role="alert" + "This file is quarantined") must exist in drive page.tsx',
    ).toBeDefined();
    return quarantineIdx!;
  }

  // Locate the quarantine card: the className line immediately preceding its role="alert"
  function quarantineCardClassLine(): number {
    const alertIdx = quarantineAlertIndex();
    expect(alertIdx, 'quarantine notice card (role="alert") must exist in drive page.tsx').toBeGreaterThan(0);
    const classIdx = lines
      .slice(0, alertIdx)
      .map((l, i) => ({ l, i }))
      .reverse()
      .find(({ l }) => l.includes('className'));
    expect(classIdx, 'quarantine card div must carry a className').toBeDefined();
    return classIdx!.i;
  }

  it('no off-black tinted surfaces (bg-[#1A0E10]) anywhere in the Drive page', () => {
    const offenders = lines.filter((l) => /#1a0e10/i.test(l));
    expect(offenders, 'off-black tinted surface violates the pure-black lock').toEqual([]);
  });

  it('quarantine card surface is pure black', () => {
    const classLine = lines[quarantineCardClassLine()];
    expect(classLine).toContain('bg-black');
    expect(classLine).not.toMatch(/bg-\[#/);
  });

  it('destructive accent is still carried by border and icon color only', () => {
    const classLine = lines[quarantineCardClassLine()];
    expect(classLine).toContain('border-[var(--quant-destructive)]');
    // The warning icon directly under the card must stay destructive-colored
    const alertIdx = quarantineAlertIndex();
    const iconSpan = lines.slice(alertIdx, alertIdx + 6).find((l) => l.includes('className'));
    expect(iconSpan).toContain('text-[var(--quant-destructive)]');
  });
});
