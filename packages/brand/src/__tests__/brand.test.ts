import { describe, it, expect } from 'vitest';
import {
  generateBrandCSS,
  generateAppCSS,
  generateThemeCSS,
  apps,
  primary,
  accent,
  neutral,
  semantic,
  quantWordmarkLight,
  quantWordmarkDark,
  quantSymbolLight,
  quantSymbolDark,
  quantmailIcon,
  quantchatIcon,
  quantaiIcon,
  quantcalendarIcon,
  quantdocsIcon,
  quantdriveIcon,
  quantmeetIcon,
  quantneonIcon,
  quantsyncIcon,
  quantubeIcon,
  quantmaxIcon,
  quanteditsIcon,
  quantadsIcon,
  marketingIcon,
  quantmapsIcon,
  quantphotosIcon,
  themes,
  dark,
  light,
  neon,
  bharat,
  highContrast,
  colorblindSafe,
  hexToRgb,
  contrastRatio,
  meetsAA,
  meetsAAA,
  coreIcons,
  generateAppIconSet,
  appLogos,
} from '../index';
import type { Theme } from '../index';

describe('generateBrandCSS', () => {
  it('returns a string containing :root and brand variables', () => {
    const css = generateBrandCSS();
    expect(typeof css).toBe('string');
    expect(css).toContain(':root');
    expect(css).toContain('--brand-primary-');
    expect(css).toContain('--brand-accent-');
    expect(css).toContain('--brand-neutral-');
    expect(css).toContain('--brand-font-display');
    expect(css).toContain('--brand-duration-');
  });
});

describe('generateAppCSS', () => {
  it('returns CSS with the correct app color for quantmail', () => {
    const css = generateAppCSS('quantmail');
    expect(css).toContain(':root');
    expect(css).toContain('--app-color: #3B82F6');
    expect(css).toContain('--app-name: "QuantMail"');
  });

  it('returns a comment about unknown app for nonexistent id', () => {
    const css = generateAppCSS('nonexistent');
    expect(css).toContain('Unknown app: nonexistent');
    expect(css).not.toContain(':root');
  });
});

describe('apps registry', () => {
  it('has all 16 entries', () => {
    expect(Object.keys(apps)).toHaveLength(16);
  });

  it('has distinct colors (no duplicates)', () => {
    const colors = Object.values(apps).map((app) => app.color);
    const uniqueColors = new Set(colors);
    expect(uniqueColors.size).toBe(colors.length);
  });

  it('each app has required fields', () => {
    for (const app of Object.values(apps)) {
      expect(app.id).toBeTruthy();
      expect(app.name).toBeTruthy();
      expect(app.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(typeof app.hue).toBe('number');
      expect(app.description).toBeTruthy();
      expect(app.iconRef).toBeTruthy();
    }
  });

  it('contains quantmaps with correct color', () => {
    const app = apps['quantmaps'];
    expect(app).toBeDefined();
    expect(app!.color).toBe('#22C55E');
    expect(app!.hue).toBe(145);
  });

  it('contains quantphotos with correct color', () => {
    const app = apps['quantphotos'];
    expect(app).toBeDefined();
    expect(app!.color).toBe('#A855F7');
    expect(app!.hue).toBe(272);
  });
});

describe('icon exports', () => {
  const icons = {
    quantmailIcon,
    quantchatIcon,
    quantaiIcon,
    quantcalendarIcon,
    quantdocsIcon,
    quantdriveIcon,
    quantmeetIcon,
    quantneonIcon,
    quantsyncIcon,
    quantubeIcon,
    quantmaxIcon,
    quanteditsIcon,
    quantadsIcon,
    marketingIcon,
    quantmapsIcon,
    quantphotosIcon,
  };

  it('all icons are non-empty strings containing <svg', () => {
    for (const [name, icon] of Object.entries(icons)) {
      expect(icon, `${name} should be non-empty`).toBeTruthy();
      expect(typeof icon, `${name} should be a string`).toBe('string');
      expect(icon, `${name} should contain <svg`).toContain('<svg');
    }
  });
});

describe('logo exports', () => {
  const logos = {
    quantWordmarkLight,
    quantWordmarkDark,
    quantSymbolLight,
    quantSymbolDark,
  };

  it('all logos are non-empty strings containing <svg', () => {
    for (const [name, logo] of Object.entries(logos)) {
      expect(logo, `${name} should be non-empty`).toBeTruthy();
      expect(typeof logo, `${name} should be a string`).toBe('string');
      expect(logo, `${name} should contain <svg`).toContain('<svg');
    }
  });
});

describe('color scales', () => {
  const expectedShades = [
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
  ];

  it('primary has entries for 50 through 950', () => {
    const keys = Object.keys(primary);
    for (const shade of expectedShades) {
      expect(keys, `primary should have shade ${shade}`).toContain(shade);
    }
  });

  it('accent has entries for 50 through 950', () => {
    const keys = Object.keys(accent);
    for (const shade of expectedShades) {
      expect(keys, `accent should have shade ${shade}`).toContain(shade);
    }
  });

  it('neutral has entries for 50 through 950', () => {
    const keys = Object.keys(neutral);
    for (const shade of expectedShades) {
      expect(keys, `neutral should have shade ${shade}`).toContain(shade);
    }
  });

  it('semantic.error has entries for 50 through 950', () => {
    const keys = Object.keys(semantic.error);
    for (const shade of expectedShades) {
      expect(keys, `semantic.error should have shade ${shade}`).toContain(shade);
    }
  });
});

describe('themes', () => {
  const themeKeys: (keyof Theme)[] = [
    'name',
    'background',
    'foreground',
    'surface',
    'surfaceElevated',
    'primary',
    'primaryForeground',
    'accent',
    'accentForeground',
    'border',
    'muted',
    'mutedForeground',
    'destructive',
    'destructiveForeground',
    'ring',
  ];

  it('has all 6 themes', () => {
    expect(Object.keys(themes)).toHaveLength(6);
    expect(themes['dark']).toBeDefined();
    expect(themes['light']).toBeDefined();
    expect(themes['neon']).toBeDefined();
    expect(themes['bharat']).toBeDefined();
    expect(themes['highContrast']).toBeDefined();
    expect(themes['colorblindSafe']).toBeDefined();
  });

  it('each theme has all required keys', () => {
    const allThemes = [dark, light, neon, bharat, highContrast, colorblindSafe];
    for (const theme of allThemes) {
      for (const key of themeKeys) {
        expect(theme[key], `${theme.name} should have ${key}`).toBeDefined();
      }
    }
  });

  it('highContrast theme foreground vs background meets AAA', () => {
    expect(meetsAAA(highContrast.foreground, highContrast.background)).toBe(true);
  });

  it('all themes foreground vs background meets AA', () => {
    const allThemes = [dark, light, neon, bharat, highContrast, colorblindSafe];
    for (const theme of allThemes) {
      expect(
        meetsAA(theme.foreground, theme.background),
        `${theme.name} foreground/background should meet AA`,
      ).toBe(true);
    }
  });
});

describe('contrast utilities', () => {
  it('hexToRgb converts correctly', () => {
    expect(hexToRgb('#FF0000')).toEqual([255, 0, 0]);
    expect(hexToRgb('#00FF00')).toEqual([0, 255, 0]);
    expect(hexToRgb('#0000FF')).toEqual([0, 0, 255]);
    expect(hexToRgb('#FFFFFF')).toEqual([255, 255, 255]);
    expect(hexToRgb('#000000')).toEqual([0, 0, 0]);
  });

  it('contrastRatio for black/white is close to 21', () => {
    const ratio = contrastRatio('#000000', '#FFFFFF');
    expect(ratio).toBeCloseTo(21, 0);
  });

  it('meetsAA for black on white is true', () => {
    expect(meetsAA('#000000', '#FFFFFF')).toBe(true);
  });

  it('meetsAA for similar grays is false', () => {
    expect(meetsAA('#777777', '#888888')).toBe(false);
  });

  it('meetsAAA for black on white is true', () => {
    expect(meetsAAA('#000000', '#FFFFFF')).toBe(true);
  });
});

describe('coreIcons', () => {
  it('has at least 80 entries', () => {
    expect(Object.keys(coreIcons).length).toBeGreaterThanOrEqual(80);
  });

  it('all values contain <svg', () => {
    for (const [name, svg] of Object.entries(coreIcons)) {
      expect(svg, `${name} should contain <svg`).toContain('<svg');
    }
  });
});

describe('generateAppIconSet', () => {
  it('returns object with all 7 keys for quantmail', () => {
    const set = generateAppIconSet('quantmail');
    expect(set.favicon16).toContain('<svg');
    expect(set.favicon32).toContain('<svg');
    expect(set.pwa192).toContain('<svg');
    expect(set.pwa512).toContain('<svg');
    expect(set.ios180).toContain('<svg');
    expect(set.android192).toContain('<svg');
    expect(set.maskable512).toContain('<svg');
  });

  it('throws for unknown app', () => {
    expect(() => generateAppIconSet('nonexistent')).toThrow('Unknown app: nonexistent');
  });
});

describe('appLogos', () => {
  it('has entries for all 16 apps with light and dark keys', () => {
    const appIds = Object.keys(apps);
    expect(appIds).toHaveLength(16);
    for (const id of appIds) {
      const logo = appLogos[id];
      expect(logo, `${id} should have a logo entry`).toBeDefined();
      expect(logo!.light, `${id} light logo should contain <svg`).toContain('<svg');
      expect(logo!.dark, `${id} dark logo should contain <svg`).toContain('<svg');
    }
  });
});

describe('generateThemeCSS', () => {
  it('produces valid CSS for dark theme', () => {
    const css = generateThemeCSS('dark');
    expect(css).toContain(':root[data-theme="dark"]');
    expect(css).toContain('--background:');
    expect(css).toContain('--foreground:');
    expect(css).toContain('--primary:');
    expect(css).toContain('--accent:');
    expect(css).toContain('--ring:');
  });

  it('returns comment for unknown theme', () => {
    const css = generateThemeCSS('unknown');
    expect(css).toContain('Unknown theme: unknown');
  });
});
