import { describe, it, expect } from 'vitest';
import {
  generateBrandCSS,
  generateAppCSS,
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
} from '../index';

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
  it('has all 14 entries', () => {
    expect(Object.keys(apps)).toHaveLength(14);
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
