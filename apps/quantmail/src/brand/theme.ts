import type { CSSProperties } from 'react';
import { foundationThemes } from '@quant/brand';

export type QuantMailSemanticStyle = CSSProperties & Record<`--${string}`, string>;

const dark = foundationThemes.dark;

/** Canonical dark semantic roles for QuantMail-owned surfaces. */
export const quantMailDarkSemanticTheme: Readonly<QuantMailSemanticStyle> = Object.freeze({
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
});

export const quantMailDarkSemanticThemeName = 'dark' as const;
