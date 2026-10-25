/**
 * QM templates motion contract pin (integrated head for #1566 + #1567).
 *
 * EmailTemplates has two anchors plus a reduced-motion mode — one
 * consistent motion contract, not two conflicting motions:
 * - 'drawer' docks at the right edge (slide from right, opacity + x),
 * - 'popover' sits above the composer toolbar like the send-options dropup
 *   (rise, opacity + y),
 * - prefers-reduced-motion (framer-motion's useReducedMotion): opacity
 *   only, zero duration — no x/y travel on either variant.
 *
 * Source-pinned (no @testing-library/react in this package): the motion
 * props must branch on `variant` behind the reduced-motion gate, the
 * popover branch must use y and never x, the drawer branch must keep x
 * and never y, and the reduced-motion branch must use neither.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(here, '..', '..'); // apps/quantmail/src
const source = readFileSync(join(srcRoot, 'components', 'EmailTemplates.tsx'), 'utf8');

describe('EmailTemplates motion follows its variant', () => {
  it('has no single unconditional x-slide for both variants', () => {
    expect(source).not.toContain('initial={{ opacity: 0, x: 20 }}');
  });

  it('gates motion on useReducedMotion (CSS alone cannot stop framer-motion inline transforms)', () => {
    expect(source).toContain('useReducedMotion');
    expect(source).toContain('const reduceMotion = useReducedMotion()');
    expect(source).toContain('const panelMotion = reduceMotion');
  });

  it('popover branch rises (opacity + y) on initial, animate and exit', () => {
    expect(source).toContain('initial: { opacity: 0, y: 12 }');
    expect(source).toContain('animate: { opacity: 1, y: 0 }');
    expect(source).toContain('exit: { opacity: 0, y: 12 }');
  });

  it('popover branch never slides on x', () => {
    // The only y:12 object in the file is the popover branch; the drawer
    // branch is the only x:20 object. If either leaked into the other,
    // the branch literals below would have to change shape.
    const popoverInitial = source.match(/initial: \{[^}]*y: 12[^}]*\}/);
    expect(popoverInitial, 'popover initial branch exists').not.toBeNull();
    expect(popoverInitial![0]).not.toContain('x:');
  });

  it('drawer branch keeps the slide-from-right (opacity + x)', () => {
    expect(source).toContain('initial: { opacity: 0, x: 20 }');
    expect(source).toContain('animate: { opacity: 1, x: 0 }');
    expect(source).toContain('exit: { opacity: 0, x: 20 }');
  });

  it('reduced-motion branch is opacity-only with zero duration (no x, no y)', () => {
    expect(source).toContain('initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0 }');
    // The reduced-motion branch is the first branch of panelMotion, before
    // the variant branches. Slice exactly that span (declaration through
    // the variant ternary) and assert no x/y MOTION KEY appears — a naive
    // 'y:' substring check would false-positive on "opacity:".
    const start = source.indexOf('const panelMotion = reduceMotion');
    expect(start, 'panelMotion declaration exists').toBeGreaterThan(-1);
    const variantAt = source.indexOf(": variant === 'popover'", start);
    expect(variantAt, 'variant branch follows the reduced-motion branch').toBeGreaterThan(-1);
    const reducedBranch = source.slice(start, variantAt);
    expect(reducedBranch).not.toMatch(/[{,]\s*[xy]:/);
  });
});
