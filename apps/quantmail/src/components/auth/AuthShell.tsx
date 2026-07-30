import type { CSSProperties, ReactNode } from 'react';
import { quantMailAuthTheme, quantMailAuthThemeName } from './auth-brand-contract';

interface AuthShellProps {
  brand: ReactNode;
  children: ReactNode;
}

/** Dark editorial access frame backed by the canonical Quantrinity foundation. */
export function AuthShell({ brand, children }: AuthShellProps) {
  return (
    <main
      className="auth-shell"
      data-quant-theme={quantMailAuthThemeName}
      style={quantMailAuthTheme as CSSProperties}
    >
      <div className="auth-shell-mobile-brand">{brand}</div>
      <div className="auth-shell-brand">{brand}</div>
      <section className="auth-shell-form">
        <div className="auth-shell-form-grid" aria-hidden="true" />
        <div className="auth-shell-form-glow" aria-hidden="true" />
        <div className="auth-shell-form-content">{children}</div>
      </section>
    </main>
  );
}
