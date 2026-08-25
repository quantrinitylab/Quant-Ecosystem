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
    50: '#090A0C', // Official Quant Canvas
    100: '#111318', // Primary Surface
    200: '#16181D', // Elevated Surface
    300: '#1F2228', // Surface 3
    700: '#6B6E76', // Muted Text
    800: '#A1A4AC', // Secondary Text
    900: '#F5F5F5', // Primary Text
    1000: '#FFFFFF',
  },
  saffron: {
    300: '#FFB875', // Highlight
    400: '#FF9B5A', // Hover
    500: '#FF8C42', // Primary Brand Orange
    600: '#E8752F', // Pressed
    700: '#C75D1E',
    800: '#2B1A11', // Brand Soft
    900: '#1D1410', // Brand Subtle
  },
  green: {
    400: '#4ADE80',
    500: '#22C55E',
    600: '#16A34A',
    700: '#15803D',
  },
  navy: {
    400: '#60A5FA',
    500: '#3B82F6',
    600: '#2563EB',
    700: '#1D4ED8',
  },
  light: {
    100: '#FFFFFF',
    200: '#F8F9FA',
    300: '#ECEEF1',
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
    canvas: '#090A0C',
    surface1: '#111318',
    surface2: '#16181D',
    surface3: '#1F2228',
    textStrong: '#F5F5F5',
    textDefault: '#A1A4AC',
    textMuted: '#6B6E76',
    borderSubtle: '#1C1F26',
    borderDefault: '#282C35',
    borderStrong: '#3A404D',
    actionPrimary: '#FF8C42',
    actionPrimaryHover: '#FF9B5A',
    actionPrimaryForeground: '#111111',
    focusRing: '#FF8C42',
    success: '#22C55E',
    warning: '#F59E0B',
    danger: '#EF4444',
    info: '#3B82F6',
    aiContext: '#A78BFA',
  },
  light: {
    canvas: '#F8F9FA',
    surface1: '#FFFFFF',
    surface2: '#F1F3F5',
    surface3: '#E9ECEF',
    textStrong: '#111318',
    textDefault: '#495057',
    textMuted: '#6C757D',
    borderSubtle: '#E9ECEF',
    borderDefault: '#CED4DA',
    borderStrong: '#ADB5BD',
    actionPrimary: '#E8752F',
    actionPrimaryHover: '#D96520',
    actionPrimaryForeground: '#FFFFFF',
    focusRing: '#E8752F',
    success: '#16A34A',
    warning: '#D97706',
    danger: '#DC2626',
    info: '#2563EB',
    aiContext: '#7C3AED',
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
    actionPrimary: '#FF8C42',
    actionPrimaryHover: '#FF9B5A',
    actionPrimaryForeground: '#000000',
    focusRing: '#FFFFFF',
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
