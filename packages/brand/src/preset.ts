/**
 * Shared Tailwind preset for the Quant ecosystem (design-system token
 * unification, Wave 0). Apps extend this via `presets: [buildQuantPreset(appId)]`
 * so their per-app tailwind.config.ts shrinks to content globs + genuine extras.
 *
 * Colors are `rgb(var(--quant-*) / <alpha-value>)` — never literals — so opacity
 * utilities (`bg-primary/50`, `text-foreground/70`) compose. This depends on the
 * CSS vars holding raw "R G B" channel triplets (see generateRootCss /
 * generateThemeCss in ./theme-css).
 *
 * We deliberately do NOT `import type { Config } from 'tailwindcss'`: @quant/brand
 * stays dependency-free so non-Tailwind targets (React Native, desktop shells)
 * consume the same tokens. The structural types below are the subset of a
 * Tailwind preset we actually populate.
 *
 * See docs/superpowers/specs/2026-09-28-design-system-token-unification.md §5.
 */

import { resolveAppConfig } from './theme-css';

/** An 11-step primitive color scale, each step a `rgb(var(...) / <alpha>)` ref. */
export interface QuantColorScale {
  '50': string;
  '100': string;
  '200': string;
  '300': string;
  '400': string;
  '500': string;
  '600': string;
  '700': string;
  '800': string;
  '900': string;
  '950': string;
}

/** The `theme.extend.colors` map the preset contributes. */
export interface QuantPresetColors {
  background: string;
  foreground: string;
  surface: { DEFAULT: string; elevated: string };
  primary: { DEFAULT: string; foreground: string };
  accent: { DEFAULT: string; foreground: string };
  muted: { DEFAULT: string; foreground: string };
  destructive: { DEFAULT: string; foreground: string };
  border: string;
  ring: string;
  app: string;
  brand: QuantColorScale;
  neutral: QuantColorScale;
  success: QuantColorScale;
  warning: QuantColorScale;
  error: QuantColorScale;
  info: QuantColorScale;
}

/** The `theme.extend` object the preset contributes. */
export interface QuantPresetExtend {
  colors: QuantPresetColors;
  fontFamily: { display: string[]; body: string[]; mono: string[] };
  borderRadius: { DEFAULT: string };
  transitionTimingFunction: { brand: string };
  transitionDuration: { brand: string };
  minWidth: { touch: string };
  minHeight: { touch: string };
}

/** Structural subset of a Tailwind preset that buildQuantPreset produces. */
export interface QuantTailwindPreset {
  darkMode: ['class', string];
  theme: { extend: QuantPresetExtend };
  content: string[];
}

const tok = (name: string): string => `rgb(var(--${name}) / <alpha-value>)`;

function scaleVars(varPrefix: string): QuantColorScale {
  return {
    '50': tok(`${varPrefix}-50`),
    '100': tok(`${varPrefix}-100`),
    '200': tok(`${varPrefix}-200`),
    '300': tok(`${varPrefix}-300`),
    '400': tok(`${varPrefix}-400`),
    '500': tok(`${varPrefix}-500`),
    '600': tok(`${varPrefix}-600`),
    '700': tok(`${varPrefix}-700`),
    '800': tok(`${varPrefix}-800`),
    '900': tok(`${varPrefix}-900`),
    '950': tok(`${varPrefix}-950`),
  };
}

const semanticColors = {
  background: tok('quant-background'),
  foreground: tok('quant-foreground'),
  surface: { DEFAULT: tok('quant-surface'), elevated: tok('quant-surface-elevated') },
  primary: { DEFAULT: tok('quant-primary'), foreground: tok('quant-primary-foreground') },
  accent: { DEFAULT: tok('quant-accent'), foreground: tok('quant-accent-foreground') },
  muted: { DEFAULT: tok('quant-muted'), foreground: tok('quant-muted-foreground') },
  destructive: {
    DEFAULT: tok('quant-destructive'),
    foreground: tok('quant-destructive-foreground'),
  },
  border: tok('quant-border'),
  ring: tok('quant-ring'),
  app: tok('quant-app-color'),
};

/**
 * Build the shared preset. When `appId` is given it is validated (throws on an
 * unknown id, new or legacy) so a typo in a consuming tailwind.config.ts fails
 * loudly at build time rather than silently dropping the app accent.
 */
export function buildQuantPreset(appId?: string): QuantTailwindPreset {
  if (appId !== undefined) {
    resolveAppConfig(appId);
  }
  const colors: QuantPresetColors = {
    ...semanticColors,
    brand: scaleVars('quant-primary'),
    neutral: scaleVars('quant-neutral'),
    success: scaleVars('quant-success'),
    warning: scaleVars('quant-warning'),
    error: scaleVars('quant-error'),
    info: scaleVars('quant-info'),
  };
  return {
    darkMode: ['class', '[data-theme="dark"]'],
    theme: {
      extend: {
        colors,
        fontFamily: {
          display: ['var(--quant-font-display)'],
          body: ['var(--quant-font-body)'],
          mono: ['var(--quant-font-mono)'],
        },
        borderRadius: { DEFAULT: 'var(--quant-radius)' },
        transitionTimingFunction: { brand: 'var(--quant-ease-out)' },
        transitionDuration: { brand: 'var(--quant-duration-normal)' },
        minWidth: { touch: '44px' },
        minHeight: { touch: '44px' },
      },
    },
    content: [],
  };
}
