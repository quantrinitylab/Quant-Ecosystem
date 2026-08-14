'use client';

import type { ReactNode } from 'react';

interface BrandLoaderProps {
  variant?: 'splash' | 'inline';
  message?: string;
  hint?: ReactNode;
  className?: string;
}

const splashCss = `
.qm-bl-splash{position:fixed;inset:0;z-index:60;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:var(--quant-background,var(--quant-surface,#0b0f14));}
.qm-bl-wordmark{font-size:24px;font-weight:800;letter-spacing:-0.02em;background:linear-gradient(120deg,#ffd9ac,#ff9933 45%,#ff7a00);-webkit-background-clip:text;background-clip:text;color:transparent;}
.qm-bl-track{position:relative;width:148px;height:3px;border-radius:9999px;background:rgba(255,255,255,0.08);overflow:hidden;}
.qm-bl-fill{position:absolute;top:0;left:0;width:38%;height:100%;border-radius:9999px;background:linear-gradient(90deg,#ff9933,#ffb15e);animation:qm-bl-slide 1.05s ease-in-out infinite;}
.qm-bl-message{margin:0;font-size:12.5px;letter-spacing:0.01em;color:var(--quant-muted-foreground,#8a94a3);}
.qm-bl-hint{text-align:center;}
@keyframes qm-bl-slide{0%{transform:translateX(-110%);}55%{transform:translateX(160%);}100%{transform:translateX(290%);}}
@media (prefers-reduced-motion: reduce){.qm-bl-fill{animation:none;width:60%;left:20%;}}
`;

const inlineCss = `
.qm-bl-inline{position:relative;display:inline-flex;width:22px;height:22px;}
.qm-bl-ring{position:absolute;inset:0;border-radius:9999px;border:2px solid rgba(255,255,255,0.12);border-top-color:#ff9933;animation:qm-bl-spin 0.8s linear infinite;}
@keyframes qm-bl-spin{to{transform:rotate(360deg);}}
@media (prefers-reduced-motion: reduce){.qm-bl-ring{animation:none;}}
`;

/**
 * QuantMail loader — intentionally minimal and calm.
 *
 * Splash: the QuantMail wordmark with a thin sliding progress bar. No 3D, no
 * gimmicks — fast, quiet, brand-first (replaces the old envelope animation).
 * Inline: a small spinner ring for in-panel loads.
 */
export function BrandLoader({
  variant = 'splash',
  message = 'Loading QuantMail…',
  hint,
  className = '',
}: BrandLoaderProps) {
  if (variant === 'inline') {
    return (
      <span className={`qm-bl-inline ${className}`} role="status" aria-live="polite">
        <span className="qm-bl-ring" aria-hidden="true" />
        <span className="sr-only">{message}</span>
        <style>{inlineCss}</style>
      </span>
    );
  }

  return (
    <div
      className={`qm-bl-splash ${className}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="qm-bl-wordmark" aria-hidden="true">QuantMail</span>
      <span className="qm-bl-track" aria-hidden="true">
        <span className="qm-bl-fill" />
      </span>
      <p className="qm-bl-message">{message}</p>
      {hint ? <div className="qm-bl-hint">{hint}</div> : null}
      <span className="sr-only">{message}</span>
      <style>{splashCss}</style>
    </div>
  );
}
