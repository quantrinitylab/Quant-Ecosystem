import { cloneElement, isValidElement, type ReactNode } from 'react';
import { quantMailAuthTheme, quantMailAuthThemeName } from './auth-brand-contract';

interface AuthShellProps {
  brand: ReactNode;
  children: ReactNode;
}

/**
 * Place the brand element into one slot as its own distinct element object.
 *
 * Root cause of the desktop ember-plate P1 (R12-NEW-1 round 2): the same
 * `brand` element object was rendered in BOTH the mobile and desktop slots.
 * React's RSC Flight renderer renders a shared element object ONCE and
 * references it twice in the payload (verified against Next 15's
 * react-server-dom-webpack Flight renderer), so `useId()` inside the brand —
 * e.g. QuantMailLogoStatic's ember-plate gradient — is evaluated a single
 * time and both copies ship byte-identical markup with DUPLICATE SVG gradient
 * ids. Chrome resolves `url(#…)` to the first id in document order, which on
 * desktop is the `display:none` mobile copy, and never resolves a paint server
 * inside a display:none subtree — so the visible desktop copy's plate fill
 * silently failed. (The #1233 `useId` fix could not help: there was only one
 * render producing one id set.) Cloning per slot defeats the dedup: each copy
 * renders independently with its own ids. Non-element brands pass through
 * untouched.
 */
function placeBrand(brand: ReactNode, slot: 'mobile' | 'desktop'): ReactNode {
  return isValidElement(brand) ? cloneElement(brand, { key: `auth-brand-${slot}` }) : brand;
}

/** Dark editorial access frame backed by the canonical Quantrinity foundation. */
export function AuthShell({ brand, children }: AuthShellProps) {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="auth-shell"
      data-quant-theme={quantMailAuthThemeName}
      style={quantMailAuthTheme}
    >
      <div className="auth-shell-mobile-brand">{placeBrand(brand, 'mobile')}</div>
      <div className="auth-shell-brand">{placeBrand(brand, 'desktop')}</div>
      <section className="auth-shell-form">
        <div className="auth-shell-form-grid" aria-hidden="true" />
        <div className="auth-shell-form-glow" aria-hidden="true" />
        <div className="auth-shell-form-content">{children}</div>
      </section>
    </main>
  );
}
