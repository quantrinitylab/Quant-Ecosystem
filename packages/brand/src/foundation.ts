/**
 * Quantrinity foundation contract.
 *
 * These exports establish semantic product tokens and the endorsed-brand
 * relationship without freezing final logo geometry before visual review.
 */

export type FoundationMode = 'dark' | 'light' | 'highContrast';

export interface FoundationTheme {
  canvas: string;
  surface1: string;
  surface2: string;
  surface3: string;
  textStrong: string;
  textDefault: string;
  textMuted: string;
  borderSubtle: string;
  borderDefault: string;
  borderStrong: string;
  actionPrimary: string;
  actionPrimaryHover: string;
  actionPrimaryForeground: string;
  focusRing: string;
  success: string;
  warning: string;
  danger: string;
  info: string;
  aiContext: string;
}

export interface EndorsedProductLockup {
  productName: string;
  parentName: 'QUANTRINITY';
  byline: string;
  accessibleName: string;
  parentScale: 0.45;
  parentTrackingEm: 0.14;
  bylineCase: 'lowercase';
  parentCase: 'uppercase';
}

/** Primitive cultural and neutral values. Semantic themes consume these values. */
export const quantrinityPrimitives = {
  ink: {
    0: '#000000',
    50: '#070A0C',
    100: '#0D1113',
    200: '#151B1E',
    300: '#20282C',
    700: '#A7ACA2',
    800: '#D7DAD3',
    900: '#F7F8F4',
    1000: '#FFFFFF',
  },
  saffron: {
    400: '#FFB45E',
    500: '#FF9F1C',
    600: '#D97500',
    700: '#9A4C00',
  },
  green: {
    400: '#4ED17B',
    500: '#2FC164',
    600: '#168C43',
    700: '#0B6130',
  },
  navy: {
    400: '#6EA8F2',
    500: '#2F74C8',
    600: '#1F5AA6',
    700: '#153E73',
  },
  light: {
    100: '#FFF9EE',
    200: '#F7F8F4',
    300: '#E8EBE4',
  },
} as const;

export const quantrinityMasterbrand = {
  name: 'QUANTRINITY',
  displayName: 'Quantrinity',
  companyDomain: 'quantrinity.in',
  identityDomain: 'quantmail.in',
  origin: 'India',
  endorsementWord: 'by',
  markStatus: 'geometry-pending-visual-review',
} as const;

export const foundationThemes: Record<FoundationMode, FoundationTheme> = {
  dark: {
    canvas: quantrinityPrimitives.ink[50],
    surface1: quantrinityPrimitives.ink[100],
    surface2: quantrinityPrimitives.ink[200],
    surface3: quantrinityPrimitives.ink[300],
    textStrong: quantrinityPrimitives.ink[900],
    textDefault: quantrinityPrimitives.ink[800],
    textMuted: quantrinityPrimitives.ink[700],
    borderSubtle: '#222A2E',
    borderDefault: '#354045',
    borderStrong: '#526066',
    actionPrimary: quantrinityPrimitives.saffron[500],
    actionPrimaryHover: quantrinityPrimitives.saffron[400],
    actionPrimaryForeground: '#171006',
    focusRing: quantrinityPrimitives.navy[400],
    success: quantrinityPrimitives.green[400],
    warning: quantrinityPrimitives.saffron[400],
    danger: '#FF6B6B',
    info: quantrinityPrimitives.navy[400],
    aiContext: '#B99AFF',
  },
  light: {
    canvas: quantrinityPrimitives.light[200],
    surface1: quantrinityPrimitives.ink[1000],
    surface2: '#F0F2ED',
    surface3: '#E6EAE3',
    textStrong: '#101311',
    textDefault: '#29302B',
    textMuted: '#4F5850',
    borderSubtle: '#DDE1DA',
    borderDefault: '#C7CDC4',
    borderStrong: '#8E998F',
    actionPrimary: quantrinityPrimitives.saffron[700],
    actionPrimaryHover: '#7B3C00',
    actionPrimaryForeground: quantrinityPrimitives.ink[1000],
    focusRing: quantrinityPrimitives.navy[600],
    success: quantrinityPrimitives.green[700],
    warning: '#7A4100',
    danger: '#A52A2A',
    info: quantrinityPrimitives.navy[700],
    aiContext: '#5B3FA3',
  },
  highContrast: {
    canvas: '#000000',
    surface1: '#000000',
    surface2: '#111111',
    surface3: '#1D1D1D',
    textStrong: '#FFFFFF',
    textDefault: '#FFFFFF',
    textMuted: '#E6E6E6',
    borderSubtle: '#FFFFFF',
    borderDefault: '#FFFFFF',
    borderStrong: '#FFFFFF',
    actionPrimary: '#FFFF00',
    actionPrimaryHover: '#FFF36A',
    actionPrimaryForeground: '#000000',
    focusRing: '#00FFFF',
    success: '#5CFF8A',
    warning: '#FFFF00',
    danger: '#FF7070',
    info: '#00FFFF',
    aiContext: '#FF8CFF',
  },
};

/**
 * Returns copy, hierarchy and accessibility metadata for a product endorsement.
 * Final SVG geometry remains deliberately separate from this contract.
 */
export function createEndorsedProductLockup(productName: string): EndorsedProductLockup {
  const normalizedProductName = productName.trim();
  if (!normalizedProductName) {
    throw new Error('Product name is required for a Quantrinity endorsement');
  }

  return {
    productName: normalizedProductName,
    parentName: 'QUANTRINITY',
    byline: 'by QUANTRINITY',
    accessibleName: `${normalizedProductName} by Quantrinity`,
    parentScale: 0.45,
    parentTrackingEm: 0.14,
    bylineCase: 'lowercase',
    parentCase: 'uppercase',
  };
}

const cssVariableMap: Record<keyof FoundationTheme, string> = {
  canvas: '--qt-canvas',
  surface1: '--qt-surface-1',
  surface2: '--qt-surface-2',
  surface3: '--qt-surface-3',
  textStrong: '--qt-text-strong',
  textDefault: '--qt-text-default',
  textMuted: '--qt-text-muted',
  borderSubtle: '--qt-border-subtle',
  borderDefault: '--qt-border-default',
  borderStrong: '--qt-border-strong',
  actionPrimary: '--qt-action-primary',
  actionPrimaryHover: '--qt-action-primary-hover',
  actionPrimaryForeground: '--qt-action-primary-foreground',
  focusRing: '--qt-focus-ring',
  success: '--qt-success',
  warning: '--qt-warning',
  danger: '--qt-danger',
  info: '--qt-info',
  aiContext: '--qt-ai-context',
};

/** Generate semantic declarations for embedding in any scoped surface. */
export function generateFoundationThemeDeclarations(mode: FoundationMode): string {
  const theme = foundationThemes[mode];
  return (Object.keys(cssVariableMap) as Array<keyof FoundationTheme>)
    .map((key) => `${cssVariableMap[key]}: ${theme[key]};`)
    .join('\n');
}

/** Generate a root-scoped semantic CSS variable contract. */
export function generateFoundationCSS(mode: FoundationMode): string {
  const declarations = generateFoundationThemeDeclarations(mode)
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n');

  return `:root[data-quant-theme="${mode}"] {\n${declarations}\n}`;
}
