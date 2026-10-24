/**
 * QM templates popover motion pin.
 *
 * EmailTemplates has two anchors: 'drawer' docks at the right edge (slide
 * from right, opacity + x), 'popover' sits above the composer toolbar like
 * the send-options dropup (rise, opacity + y). A single x:20 for both made
 * the popover slide in sideways instead of rising.
 *
 * Source-pinned (no @testing-library/react in this package): the motion
 * props must branch on `variant`, the popover branch must use y and never
 * x, and the drawer branch must keep x and never y.
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

  it('popover branch rises (opacity + y) on initial, animate and exit', () => {
    for (const prop of ['initial', 'animate', 'exit'] as const) {
      expect(
        source,
        `${prop} popover branch must rise with y`,
      ).toMatch(
        new RegExp(`${prop}=\\{variant === 'popover' \\? \\{[^}]*y: `),
      );
    }
    expect(source).toContain("initial={variant === 'popover' ? { opacity: 0, y: 12 }");
    expect(source).toContain("animate={variant === 'popover' ? { opacity: 1, y: 0 }");
    expect(source).toContain("exit={variant === 'popover' ? { opacity: 0, y: 12 }");
  });

  it('popover branches never slide on x', () => {
    for (const prop of ['initial', 'animate', 'exit'] as const) {
      const match = source.match(new RegExp(`${prop}=\\{variant === 'popover' \\? \\{[^}]*\\}`));
      expect(match, `${prop} popover branch exists`).not.toBeNull();
      expect(match![0]).not.toContain('x:');
    }
  });

  it('drawer branch keeps the slide-from-right (opacity + x)', () => {
    expect(source).toContain("initial={variant === 'popover' ? { opacity: 0, y: 12 } : { opacity: 0, x: 20 }");
    expect(source).toContain("animate={variant === 'popover' ? { opacity: 1, y: 0 } : { opacity: 1, x: 0 }");
    expect(source).toContain("exit={variant === 'popover' ? { opacity: 0, y: 12 } : { opacity: 0, x: 20 }");
  });
});
