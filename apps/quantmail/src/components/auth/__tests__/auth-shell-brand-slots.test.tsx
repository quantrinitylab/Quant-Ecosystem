// ============================================================================
// AuthShell brand slots — one shared `brand` element must not render twice.
//
// Finding R12-NEW-1 round 2 (P1 brand): the desktop auth-shell brand logo
// rendered WITHOUT its orange ember plate (white M + eyes on black tile)
// while mobile was fine — even though QuantMailLogoStatic derived its
// gradient id from useId() (#1233).
//
// Root cause (verified empirically against Next 15's react-server-dom-webpack
// Flight renderer): AuthShell rendered THE SAME `brand` element object in
// both the mobile and desktop slots. The RSC Flight renderer renders a shared
// element object ONCE and references it twice in the payload, so useId()
// inside the brand is evaluated a single time and both copies ship
// byte-identical markup with DUPLICATE SVG gradient ids. Chrome resolves
// `url(#…)` to the first id in document order — the `display:none` mobile
// copy on desktop — and never resolves a paint server inside a display:none
// subtree, so the visible desktop copy's plate fill silently failed. The #1233
// useId fix could not help: there was only one render producing one id set.
//
// The #1233 regression test was flawed: it rendered two DISTINCT
// <QuantMailLogoStatic/> elements (different tree paths → different ids) and
// passed while the real scenario still broke.
//
// The fix (AuthShell `placeBrand`): clone the brand element per slot, so each
// copy is a distinct element object that the Flight renderer renders
// independently, each with its own useId-derived gradient ids.
//
// These tests pin the fix (node environment + renderToStaticMarkup —
// apps/quantmail has no @testing-library/react):
//   1. The two brand slots receive DISTINCT element objects for one shared
//      `brand` prop — the exact invariant the Flight dedup needs. This is the
//      true regression guard: it fails on the old code (both slots held the
//      identical reference).
//   2. Full-markup scenario: renderToStaticMarkup(<AuthShell brand={el}>)
//      with ONE shared brand element — every gradient id is unique and every
//      url(#…) ref resolves. NOTE: this SSR path renders each placement
//      independently (no Flight dedup), so it passes even pre-fix; it pins
//      the AuthShell-level scenario for the non-RSC path. The Flight dedup
//      itself is covered by test 1.
//   3. Non-element brands (strings) still render in both slots.
// ============================================================================

import { describe, expect, it } from 'vitest';
import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AuthShell } from '../AuthShell';
import { AuthBrandPanel } from '../AuthBrandPanel';

/** The production brand shape — ONE shared element object, as the auth pages pass it. */
function sharedBrand(): ReactElement {
  return (
    <AuthBrandPanel
      eyebrow="Return to your workspace"
      title="Your work, back in focus."
      subtitle="Open your mail workspace."
    />
  );
}

/** The placed brand child of each brand slot div, in document order. */
function placedBrands(tree: ReactElement): ReactNode[] {
  const slots = Children.toArray(tree.props.children).filter(
    (kid): kid is ReactElement =>
      isValidElement(kid) &&
      (kid.props.className === 'auth-shell-mobile-brand' ||
        kid.props.className === 'auth-shell-brand'),
  );
  expect(slots).toHaveLength(2);
  return slots.map((slot) => slot.props.children);
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

describe('AuthShell brand slots (R12-NEW-1 round 2)', () => {
  it('places a DISTINCT brand element object in each slot for one shared brand prop', () => {
    const brand = sharedBrand();
    // AuthShell is hook-free, so call it as a plain function to inspect placement.
    const tree = AuthShell({ brand, children: null });
    const [mobile, desktop] = placedBrands(tree);
    expect(isValidElement(mobile)).toBe(true);
    expect(isValidElement(desktop)).toBe(true);
    // The regression: the old code placed the IDENTICAL element object twice.
    // React's RSC Flight renderer renders a shared element once and references
    // it twice, so both copies shipped duplicate useId gradient ids.
    expect(desktop).not.toBe(mobile);
    // Same component, keyed per slot.
    const mobileEl = mobile as ReactElement;
    const desktopEl = desktop as ReactElement;
    expect(mobileEl.type).toBe(desktopEl.type);
    expect(mobileEl.key).not.toBe(desktopEl.key);
  });

  it('every gradient id is unique and every url(#…) ref resolves with one shared brand', () => {
    const brand = sharedBrand(); // ONE element object, like the real pages pass
    const html = renderToStaticMarkup(<AuthShell brand={brand}>children</AuthShell>);
    const ids = definedGradientIds(html);
    // AuthBrandPanel carries two QuantMailLogoStatic marks × two shell slots.
    expect(ids).toHaveLength(4);
    expect(ids.every((id) => id.includes('qm-static-plate'))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    const defined = new Set(ids);
    const refs = referencedIds(html);
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) {
      expect(defined).toContain(ref);
    }
  });

  it('passes non-element brands through to both slots', () => {
    const html = renderToStaticMarkup(<AuthShell brand="Sign in">children</AuthShell>);
    expect(html).toContain('auth-shell-mobile-brand">Sign in<');
    expect(html).toContain('auth-shell-brand">Sign in<');
  });
});
