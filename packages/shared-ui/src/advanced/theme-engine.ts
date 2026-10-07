// ============================================================================
// @quant/shared-ui - Advanced Theme Engine
// ============================================================================

import {
  ThemeConfig,
  ThemeToken,
  ColorPalette,
  ColorScale,
  ContrastMode,
  ThemeTransition,
} from './types';

interface HSL {
  h: number;
  s: number;
  l: number;
}

type ThemeListener = (theme: ThemeConfig) => void;

export class ThemeEngine {
  private themes: Map<string, ThemeConfig> = new Map();
  private activeTheme: ThemeConfig;
  private listeners: Set<ThemeListener> = new Set();
  private transitionConfig: ThemeTransition = {
    property: 'all',
    duration: 200,
    easing: 'ease-in-out',
  };

  constructor(defaultTheme?: Partial<ThemeConfig>) {
    this.activeTheme = this.createDefaultTheme(defaultTheme);
    this.themes.set(this.activeTheme.name, this.activeTheme);

    // Create built-in themes
    this.themes.set('light', this.createLightTheme());
    this.themes.set('dark', this.createDarkTheme());
    this.themes.set('high-contrast', this.createHighContrastTheme());
  }

  // Create default light theme
  private createDefaultTheme(overrides?: Partial<ThemeConfig>): ThemeConfig {
    return {
      name: overrides?.name || 'light',
      mode: overrides?.mode || 'light',
      tokens: overrides?.tokens || [],
      colorPalette: overrides?.colorPalette || this.generatePalette('#3b82f6'),
      spacing: overrides?.spacing || {
        base: 4,
        scale: [0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48, 64],
      },
      typography: overrides?.typography || {
        baseFontSize: 16,
        scaleRatio: 1.25,
        fontFamilies: {
          sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          mono: '"Fira Code", "JetBrains Mono", Consolas, monospace',
          serif: 'Georgia, "Times New Roman", serif',
        },
        weights: {
          thin: 100,
          light: 300,
          normal: 400,
          medium: 500,
          semibold: 600,
          bold: 700,
          extrabold: 800,
        },
        lineHeights: { tight: 1.25, normal: 1.5, relaxed: 1.75, loose: 2 },
      },
      components: overrides?.components,
    };
  }

  private createLightTheme(): ThemeConfig {
    return this.createDefaultTheme({ name: 'light', mode: 'light' });
  }

  private createDarkTheme(): ThemeConfig {
    const palette = this.generatePalette('#60a5fa');
    // Invert neutrals for dark mode
    const darkNeutral: ColorScale = {
      50: '#0a0a0a',
      100: '#171717',
      200: '#262626',
      300: '#404040',
      400: '#525252',
      500: '#737373',
      600: '#a3a3a3',
      700: '#d4d4d4',
      800: '#e5e5e5',
      900: '#f5f5f5',
      950: '#fafafa',
    };
    palette.neutral = darkNeutral;
    return { ...this.createDefaultTheme({ name: 'dark', mode: 'dark', colorPalette: palette }) };
  }

  private createHighContrastTheme(): ThemeConfig {
    const palette = this.generatePalette('#0000ff');
    palette.neutral = {
      50: '#000000',
      100: '#111111',
      200: '#222222',
      300: '#333333',
      400: '#444444',
      500: '#666666',
      600: '#999999',
      700: '#cccccc',
      800: '#eeeeee',
      900: '#ffffff',
      950: '#ffffff',
    };
    return this.createDefaultTheme({
      name: 'high-contrast',
      mode: 'high-contrast',
      colorPalette: palette,
    });
  }

  // Generate full color palette from a seed color
  generatePalette(seedColor: string): ColorPalette {
    const seedHSL = this.hexToHSL(seedColor);
    return {
      primary: this.generateColorScale(seedHSL),
      secondary: this.generateColorScale({
        h: (seedHSL.h + 30) % 360,
        s: seedHSL.s * 0.8,
        l: seedHSL.l,
      }),
      neutral: this.generateColorScale({ h: seedHSL.h, s: 5, l: 50 }),
      success: this.generateColorScale({ h: 142, s: 71, l: 45 }),
      warning: this.generateColorScale({ h: 38, s: 92, l: 50 }),
      error: this.generateColorScale({ h: 0, s: 84, l: 60 }),
      info: this.generateColorScale({ h: 199, s: 89, l: 48 }),
    };
  }

  // Generate a color scale (50-950) from HSL base
  private generateColorScale(base: HSL): ColorScale {
    const lightnesses = [97, 93, 86, 76, 64, 50, 40, 32, 24, 14, 9];
    const saturations = [
      base.s * 0.3,
      base.s * 0.5,
      base.s * 0.7,
      base.s * 0.8,
      base.s * 0.9,
      base.s,
      base.s * 0.95,
      base.s * 0.9,
      base.s * 0.85,
      base.s * 0.8,
      base.s * 0.75,
    ];

    const scale: Record<string, string> = {};
    const keys = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'];

    keys.forEach((key, i) => {
      const h = base.h;
      const s = Math.min(100, Math.max(0, saturations[i] ?? 0));
      const l = lightnesses[i] ?? 50;
      scale[key] = this.hslToHex({ h, s, l });
    });

    return scale as unknown as ColorScale;
  }

  // Generate CSS variables from theme config
  generateCSSVariables(): Record<string, string> {
    const vars: Record<string, string> = {};
    const theme = this.activeTheme;

    // Color palette variables
    const paletteKeys: (keyof ColorPalette)[] = [
      'primary',
      'secondary',
      'neutral',
      'success',
      'warning',
      'error',
      'info',
    ];
    const shadeKeys = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'];

    for (const colorName of paletteKeys) {
      const scale = theme.colorPalette[colorName];
      for (const shade of shadeKeys) {
        vars[`--color-${colorName}-${shade}`] = (scale as any)[shade];
      }
    }

    // Spacing variables
    theme.spacing.scale.forEach((multiplier, index) => {
      vars[`--spacing-${index}`] = `${multiplier * theme.spacing.base}px`;
    });

    // Typography variables
    const { typography } = theme;
    vars['--font-size-base'] = `${typography.baseFontSize}px`;
    for (let i = -2; i <= 6; i++) {
      const size = typography.baseFontSize * Math.pow(typography.scaleRatio, i);
      vars[`--font-size-${i + 2}`] = `${Math.round(size * 100) / 100}px`;
    }
    for (const [name, family] of Object.entries(typography.fontFamilies)) {
      vars[`--font-family-${name}`] = family;
    }
    for (const [name, weight] of Object.entries(typography.weights)) {
      vars[`--font-weight-${name}`] = String(weight);
    }
    for (const [name, height] of Object.entries(typography.lineHeights)) {
      vars[`--line-height-${name}`] = String(height);
    }

    // Custom tokens
    for (const token of theme.tokens) {
      vars[`--${token.name}`] = token.value;
    }

    // Component tokens
    if (theme.components) {
      for (const [component, tokens] of Object.entries(theme.components)) {
        for (const [tokenName, value] of Object.entries(tokens)) {
          vars[`--${component}-${tokenName}`] = value;
        }
      }
    }

    return vars;
  }

  // Generate CSS string from variables
  generateCSS(selector: string = ':root'): string {
    const vars = this.generateCSSVariables();
    const entries = Object.entries(vars).map(([key, value]) => `  ${key}: ${value};`);
    return `${selector} {\n${entries.join('\n')}\n}`;
  }

  // Switch theme
  setTheme(name: string): void {
    const theme = this.themes.get(name);
    if (!theme) return;
    this.activeTheme = theme;
    this.notifyListeners();
  }

  // Create custom theme from user colors
  createCustomTheme(
    name: string,
    primaryColor: string,
    options?: { mode?: 'light' | 'dark' },
  ): ThemeConfig {
    const mode = options?.mode || 'light';
    const palette = this.generatePalette(primaryColor);

    if (mode === 'dark') {
      const darkNeutral: ColorScale = {
        50: '#0a0a0a',
        100: '#171717',
        200: '#262626',
        300: '#404040',
        400: '#525252',
        500: '#737373',
        600: '#a3a3a3',
        700: '#d4d4d4',
        800: '#e5e5e5',
        900: '#f5f5f5',
        950: '#fafafa',
      };
      palette.neutral = darkNeutral;
    }

    const theme = this.createDefaultTheme({ name, mode, colorPalette: palette });
    this.themes.set(name, theme);
    return theme;
  }

  // WCAG contrast checking
  checkContrast(
    foreground: string,
    background: string,
  ): { ratio: number; passesAA: boolean; passesAAA: boolean } {
    const fgLum = this.relativeLuminance(foreground);
    const bgLum = this.relativeLuminance(background);
    const lighter = Math.max(fgLum, bgLum);
    const darker = Math.min(fgLum, bgLum);
    const ratio = (lighter + 0.05) / (darker + 0.05);

    return {
      ratio: Math.round(ratio * 100) / 100,
      passesAA: ratio >= 4.5,
      passesAAA: ratio >= 7,
    };
  }

  // Calculate relative luminance
  private relativeLuminance(hex: string): number {
    const rgb = this.hexToRGB(hex);
    const channels = [rgb.r, rgb.g, rgb.b].map((c) => {
      c = c / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
  }

  // Ensure text color has sufficient contrast
  getContrastColor(backgroundColor: string, mode: ContrastMode = 'AA'): string {
    const threshold = mode === 'AAA' ? 7 : 4.5;
    const whiteContrast = this.checkContrast('#ffffff', backgroundColor);
    const blackContrast = this.checkContrast('#000000', backgroundColor);

    if (whiteContrast.ratio >= threshold) return '#ffffff';
    if (blackContrast.ratio >= threshold) return '#000000';
    return blackContrast.ratio > whiteContrast.ratio ? '#000000' : '#ffffff';
  }

  // Add/update a token
  setToken(name: string, value: string, category: ThemeToken['category'] = 'color'): void {
    const existingIdx = this.activeTheme.tokens.findIndex((t) => t.name === name);
    const token: ThemeToken = { name, value, category };
    if (existingIdx >= 0) {
      this.activeTheme.tokens[existingIdx] = token;
    } else {
      this.activeTheme.tokens.push(token);
    }
    this.notifyListeners();
  }

  // Set component tokens
  setComponentTokens(component: string, tokens: Record<string, string>): void {
    if (!this.activeTheme.components) this.activeTheme.components = {};
    this.activeTheme.components[component] = {
      ...this.activeTheme.components[component],
      ...tokens,
    };
    this.notifyListeners();
  }

  // Theme persistence
  savePreference(): void {
    try {
      // In browser environment would use localStorage
      JSON.stringify({ theme: this.activeTheme.name, timestamp: Date.now() });
      // Here we just maintain internal state
    } catch (e) {
      // Silently fail
    }
  }

  loadPreference(): string | null {
    try {
      // Would read from localStorage in browser
      return null;
    } catch (e) {
      return null;
    }
  }

  // Get theme transition CSS
  getTransitionCSS(): string {
    return `transition: ${this.transitionConfig.property} ${this.transitionConfig.duration}ms ${this.transitionConfig.easing}`;
  }

  setTransition(config: Partial<ThemeTransition>): void {
    this.transitionConfig = { ...this.transitionConfig, ...config };
  }

  // Get active theme
  getActiveTheme(): ThemeConfig {
    return this.activeTheme;
  }
  getTheme(name: string): ThemeConfig | undefined {
    return this.themes.get(name);
  }
  getThemeNames(): string[] {
    return Array.from(this.themes.keys());
  }

  // Color conversion utilities
  private hexToHSL(hex: string): HSL {
    const rgb = this.hexToRGB(hex);
    const r = rgb.r / 255;
    const g = rgb.g / 255;
    const b = rgb.b / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    let h = 0,
      s = 0;

    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r:
          h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
          break;
        case g:
          h = ((b - r) / d + 2) / 6;
          break;
        case b:
          h = ((r - g) / d + 4) / 6;
          break;
      }
    }

    return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
  }

  private hslToHex(hsl: HSL): string {
    const { h, s, l } = hsl;
    const sNorm = s / 100;
    const lNorm = l / 100;

    const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = lNorm - c / 2;

    let r = 0,
      g = 0,
      b = 0;
    if (h < 60) {
      r = c;
      g = x;
    } else if (h < 120) {
      r = x;
      g = c;
    } else if (h < 180) {
      g = c;
      b = x;
    } else if (h < 240) {
      g = x;
      b = c;
    } else if (h < 300) {
      r = x;
      b = c;
    } else {
      r = c;
      b = x;
    }

    const toHex = (n: number) =>
      Math.round((n + m) * 255)
        .toString(16)
        .padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  private hexToRGB(hex: string): { r: number; g: number; b: number } {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return { r: 0, g: 0, b: 0 };
    return {
      r: parseInt(result[1]!, 16),
      g: parseInt(result[2]!, 16),
      b: parseInt(result[3]!, 16),
    };
  }

  // Subscribe to theme changes
  subscribe(listener: ThemeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    this.listeners.forEach((listener) => listener(this.activeTheme));
  }

  destroy(): void {
    this.listeners.clear();
    this.themes.clear();
  }
}

export default ThemeEngine;
