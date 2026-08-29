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
 *
 * Every alias below must resolve to the same value the `:root` block in
 * `globals.css` gives it. This object is an inline `style` on `.auth-shell`, so
 * any drift silently re-themes the signed-out screens only — which is how three
 * of these went unnoticed. The names are the trap: `--quant-muted-foreground`
 * is the app's *secondary* type colour and pairs with `--qt-text-default`, not
 * with the similarly-named `--qt-text-muted`, which is a tier darker.
 */
export const quantMailAuthTheme: Readonly<QuantMailSemanticStyle> = Object.freeze({
  ...quantMailDarkSemanticTheme,
  '--quant-background': quantMailDarkSemanticTheme['--qt-canvas'],
  '--quant-foreground': quantMailDarkSemanticTheme['--qt-text-strong'],
  '--quant-surface': quantMailDarkSemanticTheme['--qt-surface-1'],
  '--quant-surface-elevated': quantMailDarkSemanticTheme['--qt-surface-2'],
  // surface-2, matching `:root`. surface-3 made every muted panel on the auth
  // screens one step lighter than the same panel anywhere else in the app.
  '--quant-muted': quantMailDarkSemanticTheme['--qt-surface-2'],
  /*
   * text-default (#A1A4AC), matching `:root`. This was text-muted (#6B6E76),
   * which is 3.88:1 on the auth canvas — so the hint under the address field,
   * the "Keep me signed in" label, the Show/Hide toggle and the sign-up prompt
   * all failed WCAG AA on the first screen of the product. #A1A4AC is 7.94:1.
   * `--quant-text-muted` is the alias for the darker tier and is unaffected.
   */
  '--quant-muted-foreground': quantMailDarkSemanticTheme['--qt-text-default'],
  '--quant-border': quantMailDarkSemanticTheme['--qt-border-default'],
  '--quant-ring': quantMailDarkSemanticTheme['--qt-focus-ring'],
  '--quant-card': quantMailDarkSemanticTheme['--qt-surface-1'],
  // text-strong, matching `:root`. Card body copy was rendering at the
  // secondary weight instead of the primary one.
  '--quant-card-foreground': quantMailDarkSemanticTheme['--qt-text-strong'],
  '--quant-destructive': quantMailDarkSemanticTheme['--qt-danger'],
  '--quant-success': quantMailDarkSemanticTheme['--qt-success'],
  '--brand-primary': quantMailDarkSemanticTheme['--qt-action-primary'],
  '--brand-primary-hover': quantMailDarkSemanticTheme['--qt-action-primary-hover'],
});

export const quantMailAuthThemeName = quantMailDarkSemanticThemeName;
