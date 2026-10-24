// @vitest-environment node
/**
 * QM-MOBILE-NAV-NO-TOP-DIVIDER — the mobile bottom nav must carry no
 * top-edge divider line (pure-black / no-divider-lines lock).
 *
 * Findings-queue 2026-10-11 [P2] [mobile-nav]: the old h-16 bottom bar
 * rendered `border-t border-[var(--quant-surface-elevated)]` across the
 * mobile bottom bar, with separation expected from the shadow only.
 * The bar has since been redesigned (transparent nav + liquid-track
 * qw-bar, separation via the track/glow, no border at all) — the literal
 * defect is gone on origin/main. This test locks that state in so the
 * defect class cannot regress: the <nav> element itself and its outer
 * wrapper must contain no border-top token of any form.
 *
 * Deliberately scoped to the nav/wrapper opening tags only: borders on
 * inner elements (active-pill accents, unread badges, overflow menu)
 * are highlights, not dividers, and are out of scope here.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const SOURCE = fs.readFileSync(
  path.resolve(__dirname, '../components/ContextBottomNavBar.tsx'),
  'utf8',
);

function navOpeningTag(): string {
  const match = SOURCE.match(/<nav[\s\S]*?className="([^"]*)"/);
  expect(match, 'ContextBottomNavBar <nav> with a static className not found').not.toBeNull();
  return match![1];
}

function wrapperOpeningTag(): string {
  const match = SOURCE.match(
    /<div\s+className=\{`md:hidden flex-none[^`]*`\}/,
  );
  expect(match, 'ContextBottomNavBar outer wrapper div not found').not.toBeNull();
  return match![0];
}

describe('QM-MOBILE-NAV-NO-TOP-DIVIDER — bottom nav carries no top divider', () => {
  it('the <nav> element has no border-t / border-color token', () => {
    const className = navOpeningTag();
    expect(className, `nav still carries a divider: ${className}`).not.toMatch(
      /(^|\s)border-t(\s|$)/,
    );
    expect(className, `nav still carries a border color: ${className}`).not.toMatch(
      /border-\[/,
    );
    expect(className, `nav still carries a border width: ${className}`).not.toMatch(
      /(^|\s)border(\s|$)/,
    );
  });

  it('the outer wrapper div has no border-t token', () => {
    const tag = wrapperOpeningTag();
    expect(tag, `wrapper still carries a divider: ${tag}`).not.toContain('border-t');
  });

  it('the nav keeps its transparent, separation-by-design styling', () => {
    const className = navOpeningTag();
    expect(className).toContain('bg-transparent');
  });
});
