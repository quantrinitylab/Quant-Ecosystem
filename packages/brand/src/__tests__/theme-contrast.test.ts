import { describe, it, expect } from 'vitest';
import { themes, meetsAA, meetsAAA, type Theme } from '../index';

/**
 * Accessibility guard for the 6 curated themes (spec §10). Every theme must
 * keep its core text and interactive pairs at WCAG AA (4.5:1); body text
 * (foreground-on-background) is held to the stricter AAA (7:1). Contrast is
 * computed from the theme hex via contrast.ts. The passing ratios were verified
 * by hand when these thresholds were chosen (tightest: colorblindSafe primary
 * 4.82:1, dark destructive 4.83:1) — this test locks them so a future palette
 * edit that regresses contrast fails loudly instead of shipping.
 */
const themeList = Object.values(themes);

describe('theme accessibility contrast', () => {
  it('covers all 6 curated themes', () => {
    expect(themeList).toHaveLength(6);
  });

  describe.each(themeList)('$name', (theme: Theme) => {
    it('body text (foreground on background) meets AAA', () => {
      expect(meetsAAA(theme.foreground, theme.background)).toBe(true);
    });

    it('foreground on surface and elevated surface meets AA', () => {
      expect(meetsAA(theme.foreground, theme.surface)).toBe(true);
      expect(meetsAA(theme.foreground, theme.surfaceElevated)).toBe(true);
    });

    it('primary button label meets AA', () => {
      expect(meetsAA(theme.primaryForeground, theme.primary)).toBe(true);
    });

    it('accent label meets AA', () => {
      expect(meetsAA(theme.accentForeground, theme.accent)).toBe(true);
    });

    it('destructive label meets AA', () => {
      expect(meetsAA(theme.destructiveForeground, theme.destructive)).toBe(true);
    });
  });
});
