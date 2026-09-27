import { describe, it, expect } from 'vitest';
import {
  getThemePalette,
  generateCssVariables,
  parseHslString,
  calculateRelativeLuminance,
  calculateContrastRatio,
  checkWcagCompliance,
} from '../theme/theme-tokens';

describe('Nexsas Theme Tokens & Utilities', () => {
  describe('getThemePalette', () => {
    it('should return light palette by default or for light mode', () => {
      const palette = getThemePalette('light');
      expect(palette.background).toBe('0 0% 100%'); // white
      expect(palette.foreground).toBe('222.2 84% 4.9%');
    });

    it('should return dark palette for dark mode', () => {
      const palette = getThemePalette('dark');
      expect(palette.background).toBe('222.2 84% 4.9%'); // dark slate
      expect(palette.foreground).toBe('210 40% 98%');
    });

    it('should return oled palette with pure black for oled mode', () => {
      const palette = getThemePalette('oled');
      expect(palette.background).toBe('0 0% 0%'); // pure black
      expect(palette.card).toBe('0 0% 0%');
      expect(palette.foreground).toBe('210 40% 98%'); // same as dark foreground
    });

    it('should resolve system mode based on systemPrefersDark flag', () => {
      const lightSystem = getThemePalette('system', false);
      expect(lightSystem.background).toBe('0 0% 100%');

      const darkSystem = getThemePalette('system', true);
      expect(darkSystem.background).toBe('222.2 84% 4.9%');
    });
  });

  describe('generateCssVariables', () => {
    it('should produce a valid CSS rule block with all token variables for light mode', () => {
      const css = generateCssVariables('light');
      expect(css).toContain(':root {');
      expect(css).toContain('--background: 0 0% 100%;');
      expect(css).toContain('--primary-foreground: 210 40% 98%;');
      expect(css).toContain('}');
    });

    it('should support custom selectors', () => {
      const css = generateCssVariables('dark', '[data-theme="dark"]');
      expect(css).toContain('[data-theme="dark"] {');
      expect(css).toContain('--background: 222.2 84% 4.9%;');
    });
  });

  describe('parseHslString', () => {
    it('should parse HSL strings correctly', () => {
      expect(parseHslString('0 0% 100%')).toEqual({ h: 0, s: 0, l: 100 });
      expect(parseHslString('222.2 84% 4.9%')).toEqual({ h: 222.2, s: 84, l: 4.9 });
    });

    it('should return fallback for invalid string', () => {
      expect(parseHslString('invalid')).toEqual({ h: 0, s: 0, l: 0 });
    });
  });

  describe('calculateRelativeLuminance', () => {
    it('should calculate luminance for white and black', () => {
      expect(calculateRelativeLuminance({ h: 0, s: 0, l: 100 })).toBeCloseTo(1, 4);
      expect(calculateRelativeLuminance({ h: 0, s: 0, l: 0 })).toBeCloseTo(0, 4);
    });
  });

  describe('calculateContrastRatio', () => {
    it('should calculate ratio ~21 for black on white', () => {
      const ratio = calculateContrastRatio('0 0% 0%', '0 0% 100%');
      expect(ratio).toBeCloseTo(21, 1);
    });

    it('should calculate ratio ~1 for same color', () => {
      const ratio = calculateContrastRatio('0 0% 100%', '0 0% 100%');
      expect(ratio).toBe(1);
    });
  });

  describe('checkWcagCompliance', () => {
    it('should pass AA and AAA for black on white (ratio 21)', () => {
      const result = checkWcagCompliance('0 0% 0%', '0 0% 100%');
      expect(result.ratio).toBeCloseTo(21, 1);
      expect(result.aaCompliant).toBe(true);
      expect(result.aaaCompliant).toBe(true);
    });

    it('should fail both for low contrast text', () => {
      // Light gray on white
      const result = checkWcagCompliance('0 0% 90%', '0 0% 100%');
      expect(result.ratio).toBeLessThan(4.5);
      expect(result.aaCompliant).toBe(false);
      expect(result.aaaCompliant).toBe(false);
    });

    it('should evaluate light palette background and foreground correctly', () => {
      const palette = getThemePalette('light');
      const result = checkWcagCompliance(palette.foreground, palette.background);
      expect(result.aaCompliant).toBe(true);
    });

    it('should evaluate dark palette background and foreground correctly', () => {
      const palette = getThemePalette('dark');
      const result = checkWcagCompliance(palette.foreground, palette.background);
      expect(result.aaCompliant).toBe(true);
    });

    it('should evaluate oled palette background and foreground correctly', () => {
      const palette = getThemePalette('oled');
      const result = checkWcagCompliance(palette.foreground, palette.background);
      expect(result.aaCompliant).toBe(true);
      expect(result.aaaCompliant).toBe(true);
    });
  });
});
