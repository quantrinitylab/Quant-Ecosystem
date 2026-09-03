import type { ReactNode } from 'react';
import { quantMailAuthTheme, quantMailAuthThemeName } from './auth-brand-contract';

interface AuthShellProps {
  brand: ReactNode;
  children: ReactNode;
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
