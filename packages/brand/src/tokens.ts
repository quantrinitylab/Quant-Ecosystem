/** CSS custom property generation for the Quant brand system */

import { primary, accent, neutral, semantic, surface } from './colors';
import { fontFamily, fontSize, lineHeight, fontWeight } from './typography';
import { easing, duration } from './motion';
import { apps } from './apps';
import { themes } from './themes';

function colorVars(prefix: string, shades: Record<string, string>): string {
  return Object.entries(shades)
    .map(([shade, value]) => `  --${prefix}-${shade}: ${value};`)
    .join('\n');
}

/** Generate complete brand CSS with :root variables */
export function generateBrandCSS(): string {
  return `:root {
  /* Primary - Indigo */
${colorVars('brand-primary', primary)}

  /* Accent - Amber */
${colorVars('brand-accent', accent)}

  /* Neutral - Slate */
${colorVars('brand-neutral', neutral)}

  /* Semantic - Error */
${colorVars('brand-error', semantic.error)}

  /* Semantic - Warning */
${colorVars('brand-warning', semantic.warning)}

  /* Semantic - Success */
${colorVars('brand-success', semantic.success)}

  /* Semantic - Info */
${colorVars('brand-info', semantic.info)}

  /* Surfaces */
  --brand-surface-dark: ${surface.dark};
  --brand-surface-dark-elevated: ${surface.darkElevated};
  --brand-surface-dark-overlay: ${surface.darkOverlay};
  --brand-surface-light: ${surface.light};
  --brand-surface-light-elevated: ${surface.lightElevated};
  --brand-surface-light-overlay: ${surface.lightOverlay};

  /* Typography - Font Family */
  --brand-font-display: ${fontFamily.display};
  --brand-font-body: ${fontFamily.body};
  --brand-font-mono: ${fontFamily.mono};

  /* Typography - Font Size */
  --brand-text-xs: ${fontSize.xs};
  --brand-text-sm: ${fontSize.sm};
  --brand-text-base: ${fontSize.base};
  --brand-text-lg: ${fontSize.lg};
  --brand-text-xl: ${fontSize.xl};
  --brand-text-2xl: ${fontSize['2xl']};
  --brand-text-3xl: ${fontSize['3xl']};
  --brand-text-4xl: ${fontSize['4xl']};
  --brand-text-5xl: ${fontSize['5xl']};
  --brand-text-6xl: ${fontSize['6xl']};

  /* Typography - Line Height */
  --brand-leading-xs: ${lineHeight.xs};
  --brand-leading-sm: ${lineHeight.sm};
  --brand-leading-base: ${lineHeight.base};
  --brand-leading-lg: ${lineHeight.lg};
  --brand-leading-xl: ${lineHeight.xl};
  --brand-leading-2xl: ${lineHeight['2xl']};
  --brand-leading-3xl: ${lineHeight['3xl']};
  --brand-leading-4xl: ${lineHeight['4xl']};
  --brand-leading-5xl: ${lineHeight['5xl']};
  --brand-leading-6xl: ${lineHeight['6xl']};

  /* Typography - Font Weight */
  --brand-font-thin: ${fontWeight.thin};
  --brand-font-extralight: ${fontWeight.extralight};
  --brand-font-light: ${fontWeight.light};
  --brand-font-normal: ${fontWeight.normal};
  --brand-font-medium: ${fontWeight.medium};
  --brand-font-semibold: ${fontWeight.semibold};
  --brand-font-bold: ${fontWeight.bold};
  --brand-font-extrabold: ${fontWeight.extrabold};
  --brand-font-black: ${fontWeight.black};

  /* Motion - Easing */
  --brand-ease-out: ${easing.easeOut};
  --brand-ease-in: ${easing.easeIn};
  --brand-ease-in-out: ${easing.easeInOut};
  --brand-ease-bounce: ${easing.springBounce};
  --brand-ease-decelerate: ${easing.decelerate};
  --brand-ease-linear: ${easing.linear};

  /* Motion - Duration */
  --brand-duration-instant: ${duration.instant}ms;
  --brand-duration-fast: ${duration.fast}ms;
  --brand-duration-normal: ${duration.normal}ms;
  --brand-duration-moderate: ${duration.moderate}ms;
  --brand-duration-slow: ${duration.slow}ms;
  --brand-duration-glacial: ${duration.glacial}ms;
}`;
}

/** Generate app-specific CSS variables */
export function generateAppCSS(appId: string): string {
  const app = apps[appId];
  if (!app) {
    return `/* Unknown app: ${appId} */`;
  }
  return `:root {
  --app-name: "${app.name}";
  --app-color: ${app.color};
  --app-hue: ${app.hue};
}`;
}

/** Generate theme CSS custom properties */
export function generateThemeCSS(themeName: string): string {
  const theme = themes[themeName];
  if (!theme) {
    throw new Error(`Unknown theme: ${themeName}`);
  }
  return `:root[data-theme="${themeName}"] {
  --background: ${theme.background};
  --foreground: ${theme.foreground};
  --surface: ${theme.surface};
  --surface-elevated: ${theme.surfaceElevated};
  --primary: ${theme.primary};
  --primary-foreground: ${theme.primaryForeground};
  --accent: ${theme.accent};
  --accent-foreground: ${theme.accentForeground};
  --border: ${theme.border};
  --muted: ${theme.muted};
  --muted-foreground: ${theme.mutedForeground};
  --destructive: ${theme.destructive};
  --destructive-foreground: ${theme.destructiveForeground};
  --ring: ${theme.ring};
}`;
}
