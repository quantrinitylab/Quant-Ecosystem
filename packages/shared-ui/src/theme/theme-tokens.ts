export type ThemeMode = 'light' | 'dark' | 'oled' | 'system';

export interface HslColor {
  h: number; // 0 to 360
  s: number; // 0 to 100
  l: number; // 0 to 100
}

export interface ThemeColorPalette {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  popover: string;
  popoverForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  destructiveForeground: string;
  border: string;
  input: string;
  ring: string;
}

const LIGHT_PALETTE: ThemeColorPalette = {
  background: '0 0% 100%',
  foreground: '222.2 84% 4.9%',
  card: '0 0% 100%',
  cardForeground: '222.2 84% 4.9%',
  popover: '0 0% 100%',
  popoverForeground: '222.2 84% 4.9%',
  primary: '222.2 47.4% 11.2%',
  primaryForeground: '210 40% 98%',
  secondary: '210 40% 96.1%',
  secondaryForeground: '222.2 47.4% 11.2%',
  muted: '210 40% 96.1%',
  mutedForeground: '215.4 16.3% 46.9%',
  accent: '210 40% 96.1%',
  accentForeground: '222.2 47.4% 11.2%',
  destructive: '0 84.2% 60.2%',
  destructiveForeground: '210 40% 98%',
  border: '214.3 31.8% 91.4%',
  input: '214.3 31.8% 91.4%',
  ring: '222.2 84% 4.9%',
};

const DARK_PALETTE: ThemeColorPalette = {
  background: '222.2 84% 4.9%',
  foreground: '210 40% 98%',
  card: '222.2 84% 4.9%',
  cardForeground: '210 40% 98%',
  popover: '222.2 84% 4.9%',
  popoverForeground: '210 40% 98%',
  primary: '210 40% 98%',
  primaryForeground: '222.2 47.4% 11.2%',
  secondary: '217.2 32.6% 17.5%',
  secondaryForeground: '210 40% 98%',
  muted: '217.2 32.6% 17.5%',
  mutedForeground: '215 20.2% 65.1%',
  accent: '217.2 32.6% 17.5%',
  accentForeground: '210 40% 98%',
  destructive: '0 62.8% 30.6%',
  destructiveForeground: '210 40% 98%',
  border: '217.2 32.6% 17.5%',
  input: '217.2 32.6% 17.5%',
  ring: '212.7 26.8% 83.9%',
};

const OLED_PALETTE: ThemeColorPalette = {
  ...DARK_PALETTE,
  background: '0 0% 0%',
  card: '0 0% 0%',
  popover: '0 0% 0%',
};

export function getThemePalette(mode: ThemeMode, systemPrefersDark?: boolean): ThemeColorPalette {
  if (mode === 'system') {
    return systemPrefersDark ? DARK_PALETTE : LIGHT_PALETTE;
  }
  if (mode === 'oled') return OLED_PALETTE;
  if (mode === 'dark') return DARK_PALETTE;
  return LIGHT_PALETTE;
}

export function generateCssVariables(mode: ThemeMode, selector: string = ':root'): string {
  const palette = getThemePalette(mode);
  const vars = Object.entries(palette)
    .map(([key, value]) => {
      const cssVar = key.replace(/([A-Z])/g, '-$1').toLowerCase();
      return `  --${cssVar}: ${value};`;
    })
    .join('\n');

  return `${selector} {\n${vars}\n}`;
}

export function parseHslString(hslStr: string): HslColor {
  const parts = hslStr.trim().split(/\s+/);
  if (parts.length !== 3) {
    return { h: 0, s: 0, l: 0 };
  }
  const hStr = parts[0] as string;
  const sStr = parts[1] as string;
  const lStr = parts[2] as string;
  return {
    h: parseFloat(hStr),
    s: parseFloat(sStr.replace('%', '')),
    l: parseFloat(lStr.replace('%', '')),
  };
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

function getSrgbLuminance(c: number): number {
  const srgb = c / 255;
  return srgb <= 0.03928 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
}

export function calculateRelativeLuminance(hsl: HslColor): number {
  const [r, g, b] = hslToRgb(hsl.h, hsl.s, hsl.l);
  const lR = getSrgbLuminance(r);
  const lG = getSrgbLuminance(g);
  const lB = getSrgbLuminance(b);
  return 0.2126 * lR + 0.7152 * lG + 0.0722 * lB;
}

export function calculateContrastRatio(foregroundHsl: string, backgroundHsl: string): number {
  const fg = parseHslString(foregroundHsl);
  const bg = parseHslString(backgroundHsl);
  const lum1 = calculateRelativeLuminance(fg);
  const lum2 = calculateRelativeLuminance(bg);
  const lightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  return (lightest + 0.05) / (darkest + 0.05);
}

export function checkWcagCompliance(
  foregroundHsl: string,
  backgroundHsl: string,
): { ratio: number; aaCompliant: boolean; aaaCompliant: boolean } {
  const ratio = calculateContrastRatio(foregroundHsl, backgroundHsl);
  return {
    ratio,
    aaCompliant: ratio >= 4.5,
    aaaCompliant: ratio >= 7.0,
  };
}
