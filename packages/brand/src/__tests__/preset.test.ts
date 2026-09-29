import { describe, it, expect } from 'vitest';
import {
  buildQuantPreset,
  generateRootCss,
  generateThemeCss,
  hexToTriplet,
  resolveAppConfig,
  themes,
} from '../index';

describe('hexToTriplet', () => {
  it('converts #RRGGBB to a space-separated R G B channel triplet', () => {
    expect(hexToTriplet('#FF8C42')).toBe('255 140 66');
    expect(hexToTriplet('#000000')).toBe('0 0 0');
    expect(hexToTriplet('#FFFFFF')).toBe('255 255 255');
    expect(hexToTriplet('#EC4899')).toBe('236 72 153');
  });
});

describe('resolveAppConfig', () => {
  it('resolves a legacy registry id', () => {
    expect(resolveAppConfig('quantneon').color).toBe('#EC4899');
  });

  it('resolves each renamed id to its legacy config (Wave 0 alias)', () => {
    expect(resolveAppConfig('quantgram').color).toBe('#EC4899'); // quantneon
    expect(resolveAppConfig('quantwave').color).toBe('#06B6D4'); // quantsync
    expect(resolveAppConfig('quantcooks').color).toBe('#7C3AED'); // quantedits
  });

  it('throws on an unknown app', () => {
    expect(() => resolveAppConfig('nonexistent')).toThrow('Unknown app: nonexistent');
  });
});

describe('buildQuantPreset', () => {
  it('maps every semantic role to rgb(var(--quant-*) / <alpha-value>)', () => {
    const { colors } = buildQuantPreset('quantchat').theme.extend;
    expect(colors.background).toBe('rgb(var(--quant-background) / <alpha-value>)');
    expect(colors.foreground).toBe('rgb(var(--quant-foreground) / <alpha-value>)');
    expect(colors.primary.DEFAULT).toBe('rgb(var(--quant-primary) / <alpha-value>)');
    expect(colors.primary.foreground).toBe('rgb(var(--quant-primary-foreground) / <alpha-value>)');
    expect(colors.surface.DEFAULT).toBe('rgb(var(--quant-surface) / <alpha-value>)');
    expect(colors.surface.elevated).toBe('rgb(var(--quant-surface-elevated) / <alpha-value>)');
    expect(colors.destructive.DEFAULT).toBe('rgb(var(--quant-destructive) / <alpha-value>)');
    expect(colors.destructive.foreground).toBe(
      'rgb(var(--quant-destructive-foreground) / <alpha-value>)',
    );
    expect(colors.accent.DEFAULT).toBe('rgb(var(--quant-accent) / <alpha-value>)');
    expect(colors.accent.foreground).toBe('rgb(var(--quant-accent-foreground) / <alpha-value>)');
    expect(colors.muted.DEFAULT).toBe('rgb(var(--quant-muted) / <alpha-value>)');
    expect(colors.muted.foreground).toBe('rgb(var(--quant-muted-foreground) / <alpha-value>)');
    expect(colors.border).toBe('rgb(var(--quant-border) / <alpha-value>)');
    expect(colors.ring).toBe('rgb(var(--quant-ring) / <alpha-value>)');
    expect(colors.app).toBe('rgb(var(--quant-app-color) / <alpha-value>)');
  });

  it('exposes all six primitive scales × 11 shades as var refs', () => {
    const { colors } = buildQuantPreset().theme.extend;
    const scales = [
      ['brand', 'quant-primary'],
      ['neutral', 'quant-neutral'],
      ['success', 'quant-success'],
      ['warning', 'quant-warning'],
      ['error', 'quant-error'],
      ['info', 'quant-info'],
    ] as const;
    const shades = [
      '50',
      '100',
      '200',
      '300',
      '400',
      '500',
      '600',
      '700',
      '800',
      '900',
      '950',
    ] as const;
    for (const [scaleKey, varPrefix] of scales) {
      const scale = colors[scaleKey];
      expect(Object.keys(scale)).toHaveLength(11);
      for (const shade of shades) {
        expect(scale[shade]).toBe(`rgb(var(--${varPrefix}-${shade}) / <alpha-value>)`);
      }
    }
  });

  it('sets darkMode to class + [data-theme="dark"]', () => {
    expect(buildQuantPreset().darkMode).toEqual(['class', '[data-theme="dark"]']);
  });

  it('provides 44px touch min sizes', () => {
    const { minWidth, minHeight } = buildQuantPreset().theme.extend;
    expect(minWidth.touch).toBe('44px');
    expect(minHeight.touch).toBe('44px');
  });

  it('accepts renamed app ids', () => {
    expect(() => buildQuantPreset('quantgram')).not.toThrow();
    expect(() => buildQuantPreset('quantwave')).not.toThrow();
    expect(() => buildQuantPreset('quantcooks')).not.toThrow();
  });

  it('throws on an unknown app id', () => {
    expect(() => buildQuantPreset('nonexistent')).toThrow('Unknown app: nonexistent');
  });

  it('treats a blank app id as invalid, not omission', () => {
    expect(() => buildQuantPreset('')).toThrow('Unknown app: ');
  });

  it('builds with no app id (base preset)', () => {
    expect(() => buildQuantPreset()).not.toThrow();
  });
});

describe('generateThemeCss', () => {
  const css = generateThemeCss();

  it('emits one block for all 6 curated themes', () => {
    for (const name of Object.keys(themes)) {
      expect(css).toContain(`:root[data-theme="${name}"]`);
    }
    expect(css.match(/:root\[data-theme=/g) ?? []).toHaveLength(6);
  });

  it('emits dark theme slots as channel triplets', () => {
    expect(css).toContain('--quant-background: 9 10 12;'); // #090A0C
    expect(css).toContain('--quant-primary: 255 140 66;'); // #FF8C42
    expect(css).toContain('--quant-surface-elevated: 22 24 29;'); // #16181D
    expect(css).toContain('--quant-primary-foreground: 17 17 17;'); // #111111
  });

  it('emits exactly 14 semantic slots per theme (84 declarations)', () => {
    expect(css.match(/--quant-[a-z-]+:/g) ?? []).toHaveLength(6 * 14);
  });

  it('contains no raw hex (triplets only)', () => {
    expect(css).not.toMatch(/#[0-9A-Fa-f]{6}/);
  });
});

describe('generateRootCss', () => {
  it('emits primitive scales as triplets plus typography and radius', () => {
    const css = generateRootCss();
    expect(css).toContain('--quant-primary-500: 255 140 66;'); // #FF8C42
    expect(css).toContain('--quant-neutral-950: 9 10 12;'); // #090A0C
    expect(css).toContain('--quant-font-display:');
    expect(css).toContain('--quant-radius:');
  });

  it('emits the per-app accent as a triplet (hex converted)', () => {
    const css = generateRootCss('quantgram');
    expect(css).toContain('--quant-app-color: 236 72 153;'); // #EC4899
    expect(css).toContain('--quant-app-hue: 330;');
  });

  it('omits the app layer when no app id is given', () => {
    expect(generateRootCss()).not.toContain('--quant-app-color');
  });

  it('throws on an unknown app id', () => {
    expect(() => generateRootCss('nonexistent')).toThrow('Unknown app: nonexistent');
  });

  it('treats a blank app id as invalid, not omission', () => {
    expect(() => generateRootCss('')).toThrow('Unknown app: ');
  });

  it('contains no raw hex in its output', () => {
    expect(generateRootCss('quantchat')).not.toMatch(/#[0-9A-Fa-f]{6}/);
  });
});
