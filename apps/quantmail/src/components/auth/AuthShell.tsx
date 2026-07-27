import type { CSSProperties, ReactNode } from 'react';

interface AuthShellProps {
  brand: ReactNode;
  children: ReactNode;
}

const darkTheme = {
  '--quant-background': '#09090a',
  '--quant-foreground': '#f7f7f2',
  '--quant-surface': '#141416',
  '--quant-surface-elevated': '#1b1b1f',
  '--quant-muted': '#222226',
  '--quant-muted-foreground': '#9b9b9f',
  '--quant-border': '#303034',
  '--quant-ring': '#ff9933',
  '--quant-card': '#111113',
  '--quant-card-foreground': '#f7f7f2',
  '--quant-destructive': '#ff7b7b',
  '--quant-success': '#54d46c',
  '--brand-primary': '#ff9933',
  '--brand-primary-hover': '#ffad5c',
} as CSSProperties;

/** Dark editorial access frame for the Quantrinity identity. */
export function AuthShell({ brand, children }: AuthShellProps) {
  return (
    <main className="auth-shell" style={darkTheme}>
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
