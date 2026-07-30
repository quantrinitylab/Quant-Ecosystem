import type { CSSProperties } from 'react';
import { createEndorsedProductLockup, foundationThemes } from '@quant/brand';

type SemanticStyle = CSSProperties & Record<`--${string}`, string>;

const dark = foundationThemes.dark;

/** Canonical endorsed identity for every QuantMail authentication surface. */
export const quantMailAuthLockup = Object.freeze(createEndorsedProductLockup('QuantMail'));

/**
 * Reversible bridge from the new semantic foundation to existing auth CSS.
 * New `--qt-*` roles and legacy `--quant-*` aliases intentionally coexist
 * until the auth stylesheet is migrated in a separate visual-review change.
 */
export const quantMailAuthTheme: Readonly<SemanticStyle> = Object.freeze({
  '--qt-canvas': dark.canvas,
  '--qt-surface-1': dark.surface1,
  '--qt-surface-2': dark.surface2,
  '--qt-surface-3': dark.surface3,
  '--qt-text-strong': dark.textStrong,
  '--qt-text-default': dark.textDefault,
  '--qt-text-muted': dark.textMuted,
  '--qt-border-subtle': dark.borderSubtle,
  '--qt-border-default': dark.borderDefault,
  '--qt-border-strong': dark.borderStrong,
  '--qt-action-primary': dark.actionPrimary,
  '--qt-action-primary-hover': dark.actionPrimaryHover,
  '--qt-action-primary-foreground': dark.actionPrimaryForeground,
  '--qt-focus-ring': dark.focusRing,
  '--qt-success': dark.success,
  '--qt-warning': dark.warning,
  '--qt-danger': dark.danger,
  '--qt-info': dark.info,
  '--qt-ai-context': dark.aiContext,

  '--quant-background': dark.canvas,
  '--quant-foreground': dark.textStrong,
  '--quant-surface': dark.surface1,
  '--quant-surface-elevated': dark.surface2,
  '--quant-muted': dark.surface3,
  '--quant-muted-foreground': dark.textMuted,
  '--quant-border': dark.borderDefault,
  '--quant-ring': dark.focusRing,
  '--quant-card': dark.surface1,
  '--quant-card-foreground': dark.textDefault,
  '--quant-destructive': dark.danger,
  '--quant-success': dark.success,
  '--brand-primary': dark.actionPrimary,
  '--brand-primary-hover': dark.actionPrimaryHover,
});

export const quantMailAuthThemeName = 'dark' as const;
