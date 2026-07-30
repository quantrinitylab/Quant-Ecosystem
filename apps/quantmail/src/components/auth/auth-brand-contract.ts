import { quantMailBrandLockup } from '../../brand/identity';
import {
  quantMailDarkSemanticTheme,
  quantMailDarkSemanticThemeName,
  type QuantMailSemanticStyle,
} from '../../brand/theme';

/** Backwards-compatible auth export of the canonical QuantMail identity. */
export const quantMailAuthLockup = quantMailBrandLockup;

/**
 * Reversible bridge from the central semantic foundation to existing auth CSS.
 * New `--qt-*` roles and legacy `--quant-*` aliases intentionally coexist
 * until the auth stylesheet is migrated in a separate visual-review change.
 */
export const quantMailAuthTheme: Readonly<QuantMailSemanticStyle> = Object.freeze({
  ...quantMailDarkSemanticTheme,
  '--quant-background': quantMailDarkSemanticTheme['--qt-canvas'],
  '--quant-foreground': quantMailDarkSemanticTheme['--qt-text-strong'],
  '--quant-surface': quantMailDarkSemanticTheme['--qt-surface-1'],
  '--quant-surface-elevated': quantMailDarkSemanticTheme['--qt-surface-2'],
  '--quant-muted': quantMailDarkSemanticTheme['--qt-surface-3'],
  '--quant-muted-foreground': quantMailDarkSemanticTheme['--qt-text-muted'],
  '--quant-border': quantMailDarkSemanticTheme['--qt-border-default'],
  '--quant-ring': quantMailDarkSemanticTheme['--qt-focus-ring'],
  '--quant-card': quantMailDarkSemanticTheme['--qt-surface-1'],
  '--quant-card-foreground': quantMailDarkSemanticTheme['--qt-text-default'],
  '--quant-destructive': quantMailDarkSemanticTheme['--qt-danger'],
  '--quant-success': quantMailDarkSemanticTheme['--qt-success'],
  '--brand-primary': quantMailDarkSemanticTheme['--qt-action-primary'],
  '--brand-primary-hover': quantMailDarkSemanticTheme['--qt-action-primary-hover'],
});

export const quantMailAuthThemeName = quantMailDarkSemanticThemeName;
