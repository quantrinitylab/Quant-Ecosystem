// ============================================================================
// Decorative logo marks — zero-JS on authenticated chrome surfaces.
//
// Finding (queue 2026-10-15, P1 [logo] [perf-load]): canvas
// <QuantMailLogo interactive={false}> was still mounted decoratively in five
// authenticated chrome surfaces — the decorative branch renders {art} = the
// canvas/LivingLogo, so the marks pipeline + rAF repaint loop ran for marks
// that can never animate (same bug class as the fixed SSO-chooser finding).
//
// Fix:
//   1. AppSidebar brand (AppSidebar.tsx) and QuantrinityMark now render
//      <QuantMailLogoStatic> — the zero-JS pure SVG twin, geometry
//      bezier-matched to the canvas mark — instead of the canvas
//      <QuantMailLogo interactive={false}>.
//   2. The three pillar-icon placements (QuantPillarTopBar MailLogoIcon,
//      pillarTiles mail tile, InboxZeroState hero) have since migrated to the
//      image-based <PillarMascotMark>; their residual JS was the blink timer
//      chain + hover/bounce state running even with interactive={false}.
//      PillarMascotMark now gates ALL living-physics on `interactive`, so
//      decorative instances mount a plain <img>: zero timers, zero
//      self-re-renders. (Swapping these to QuantMailLogoStatic would undo the
//      user-approved mascot finals — the gating preserves the locked
//      visuals while delivering the finding's zero-JS intent.)
//
// These tests pin the fix (renderToStaticMarkup — apps/quantmail has no
// @testing-library/react):
//   1. QuantrinityMark renders the static SVG mark: ember gradient present,
//      locked M silhouette + eyes, and NO <canvas> anywhere in its markup.
//   2. Source scans: AppSidebar.tsx and QuantrinityMark.tsx import
//      QuantMailLogoStatic and must NOT import the canvas QuantMailLogo —
//      a regression silently re-adds the canvas loop to the sidebar and the
//      public share/join/invite pages that render QuantrinityMark.
//   3. PillarMascotMark with interactive={false} renders a plain static
//      image: role="img", no cursor-pointer, no <canvas>.
//   4. Source scan: the blink useEffect in PillarMascotMark.tsx returns
//      early when !interactive — a regression re-adds a 4–7s timer chain
//      that re-renders every decorative pillar icon on screen.
//   5. The interactive contract is preserved: interactive={true} still gets
//      role="button" + the pointer cursor (living-physics stays available
//      for genuinely interactive callers).
// ============================================================================

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { QuantrinityMark } from '../QuantrinityMark';
import { PillarMascotMark } from '../mascots/PillarMascotMark';

/** Walk up from cwd to find a repo-relative source file. */
function findSource(relApp: string): string {
  const rels = [`src/${relApp}`, `apps/quantmail/src/${relApp}`];
  let dir = process.cwd();
  for (let depth = 0; depth < 8; depth++) {
    for (const rel of rels) {
      const candidate = join(dir, rel);
      if (existsSync(candidate)) return candidate;
    }
    const parent = join(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`could not locate ${relApp} from ${process.cwd()}`);
}

/** Source with block and line comments stripped (the fix is documented in prose). */
function readSourceStripped(relApp: string): string {
  return readFileSync(findSource(relApp), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1');
}

describe('decorative logo marks are zero-JS', () => {
  it('QuantrinityMark renders the static SVG mark, never the canvas logo', () => {
    const html = renderToStaticMarkup(<QuantrinityMark />);
    // QuantMailLogoStatic's ember plate gradient.
    expect(html).toContain('qm-static-plate');
    expect(html).toContain('<svg');
    // Locked geometry: the M silhouette + eyes.
    expect(html).toContain('M 30 74 A 7 7');
    expect(html).toContain('<circle cx="40.5" cy="60" r="3.5"');
    // The decorative canvas QuantMailLogo renders a <canvas> inside its art
    // branch — it must not survive here.
    expect(html).not.toContain('<canvas');
    // The outer span carries the accessible name (role="img"), so the mark
    // itself stays aria-hidden: no duplicate naming.
    expect(html).toContain('role="img"');
  });

  it('QuantrinityMark compact variant also renders the static mark', () => {
    const html = renderToStaticMarkup(<QuantrinityMark compact label="QuantMail" />);
    expect(html).toContain('qm-static-plate');
    expect(html).not.toContain('<canvas');
    expect(html).toContain('width="28"');
  });

  it('source scan: AppSidebar imports QuantMailLogoStatic, never the canvas QuantMailLogo', () => {
    const src = readSourceStripped('components/AppSidebar.tsx');
    expect(src).toContain('QuantMailLogoStatic');
    expect(src).not.toMatch(/from ['"]\.\/QuantMailLogo['"]/);
  });

  it('source scan: QuantrinityMark imports QuantMailLogoStatic, never the canvas QuantMailLogo', () => {
    const src = readSourceStripped('components/QuantrinityMark.tsx');
    expect(src).toContain('QuantMailLogoStatic');
    expect(src).not.toMatch(/from ['"]\.\/QuantMailLogo['"]/);
  });

  it('PillarMascotMark with interactive={false} renders a plain static image', () => {
    const html = renderToStaticMarkup(
      <PillarMascotMark pillar="mail" size="sm" interactive={false} />,
    );
    // Decorative contract: img semantics, no pointer affordance.
    expect(html).toContain('role="img"');
    expect(html).not.toContain('cursor-pointer');
    // Image-based mascot — never a canvas — with the webp source.
    expect(html).toContain('<img');
    expect(html).not.toContain('<canvas');
    expect(html).toContain('/mascots/mail-sm.webp');
  });

  it('source scan: PillarMascotMark blink effect is gated on interactive', () => {
    const src = readSourceStripped('components/mascots/PillarMascotMark.tsx');
    // The blink useEffect must bail before scheduling its timer chain when
    // the mark is decorative — otherwise every decorative pillar icon on
    // screen re-renders on its own every 4–7 seconds.
    const blinkEffect = src.slice(src.indexOf('scheduleNextBlink'));
    expect(blinkEffect).toContain('if (!interactive) return;');
  });

  it('interactive PillarMascotMark keeps its button contract (living-physics available)', () => {
    const html = renderToStaticMarkup(
      <PillarMascotMark pillar="mail" size="sm" interactive={true} />,
    );
    expect(html).toContain('role="button"');
    expect(html).toContain('cursor-pointer');
    expect(html).toContain('<img');
  });
});
