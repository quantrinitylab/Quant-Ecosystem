// ============================================================================
// QuantMailLogoStatic — per-instance ember-plate gradient ids.
//
// Finding R12-NEW-1 (lane1-audit-008r12, P1 brand): the brand logo rendered
// WITHOUT its orange ember plate on desktop viewports — white M + eyes
// floating on black — while mobile showed the full sanctioned brand.
//
// Original root cause: AuthShell.tsx rendered this mark TWICE (mobile +
// desktop copies) and the component's <radialGradient> carried the STATIC id
// "qm-static-plate", so the served HTML had duplicate gradient ids. Chrome
// resolves `url(#qm-static-plate)` to the FIRST id in document order — the
// `display:none` mobile copy on desktop — and never resolves a paint server
// inside a display:none subtree, so the visible desktop copy's plate fill
// silently failed. Fixed in #1233 by deriving the id from React `useId()`
// (same pattern as AppMark / GraphiteMark), sanitized for `url(#…)` — but
// the #1233 regression test below was FLAWED: it rendered two DISTINCT
// elements (different tree paths → different ids) while the real AuthShell
// scenario renders THE SAME element object twice, which React's RSC Flight
// renderer renders ONCE (duplicate ids anyway — R12-NEW-1 round 2, fixed by
// cloning the brand per slot in AuthShell). The real scenario is pinned by
// src/components/auth/__tests__/auth-shell-brand-slots.test.tsx.
//
// These tests pin the useId fix for the distinct-instances case
// (renderToStaticMarkup — apps/quantmail has no @testing-library/react):
//   1. Two DISTINCT instances in one document get DISTINCT gradient ids.
//   2. Every `url(#…)` reference resolves to a gradient actually defined in
//      the markup (no dangling paint-server refs).
//   3. The locked geometry is byte-preserved: ember radial gradient stops,
//      the M silhouette, and the eyes all still render.
// ============================================================================
// These tests pin the fix (renderToStaticMarkup — apps/quantmail has no
// @testing-library/react):
//   1. Two instances in one document get DISTINCT gradient ids (the
//      AuthShell mobile+desktop scenario).
//   2. Every `url(#…)` reference resolves to a gradient actually defined in
//      the markup (no dangling paint-server refs).
//   3. The locked geometry is byte-preserved: ember radial gradient stops,
//      the M silhouette, and the eyes all still render.
// ============================================================================

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QuantMailLogoStatic } from '../QuantMailLogoStatic';

/** Two DISTINCT instances (distinct tree paths → distinct useId values). */
function renderTwice(): string {
  return renderToStaticMarkup(
    <>
      <QuantMailLogoStatic />
      <QuantMailLogoStatic />
    </>,
  );
}

/** All gradient ids defined by <radialGradient>/<linearGradient> in the markup. */
function definedGradientIds(html: string): string[] {
  const ids: string[] = [];
  const re = /<(?:radialGradient|linearGradient) id="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) ids.push(m[1]);
  return ids;
}

/** All `url(#…)` paint-server references in the markup. */
function referencedIds(html: string): string[] {
  const refs: string[] = [];
  const re = /url\(#([^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) refs.push(m[1]);
  return refs;
}

describe('QuantMailLogoStatic gradient ids (R12-NEW-1)', () => {
  it('gives each instance a unique ember-plate gradient id', () => {
    const html = renderTwice();
    const ids = definedGradientIds(html);
    expect(ids).toHaveLength(2);
    expect(ids[0]).toContain('qm-static-plate');
    expect(ids[1]).toContain('qm-static-plate');
    expect(ids[0]).not.toBe(ids[1]);
  });

  it('every url(#…) reference resolves to a defined gradient', () => {
    const html = renderTwice();
    const defined = new Set(definedGradientIds(html));
    const refs = referencedIds(html);
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) {
      expect(defined).toContain(ref);
    }
  });

  it('keeps the locked geometry: ember stops, M silhouette, eyes', () => {
    const html = renderToStaticMarkup(<QuantMailLogoStatic title="QuantMail" />);
    // Ember plate: the radial gradient with the plate's own stops.
    expect(html).toContain('<radialGradient');
    expect(html).toContain('stop-color="#FFC189"');
    expect(html).toContain('stop-color="#FF9450"');
    expect(html).toContain('stop-color="#6E2606"');
    // M_PATH bezier silhouette (start of the path data).
    expect(html).toContain('M 30 74 A 7 7');
    // Eyes: pupil circles with the locked geometry.
    expect(html).toContain('<circle cx="40.5" cy="60" r="3.5"');
    expect(html).toContain('<circle cx="59.5" cy="60" r="3.5"');
    // Accessible name via <title> (role="img").
    expect(html).toContain('role="img"');
    expect(html).toContain('<title>QuantMail</title>');
  });
});
