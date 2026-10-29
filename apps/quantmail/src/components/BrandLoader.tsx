'use client';

import type { ReactNode } from 'react';
import { QuantWorkplaceRevolvingSplash } from './workplace/QuantWorkplaceRevolvingSplash';

interface BrandLoaderProps {
  variant?: 'splash' | 'inline';
  message?: string;
  hint?: ReactNode;
  className?: string;
}

const inlineCss = `
.qm-bl-inline{position:relative;display:inline-flex;width:20px;height:20px;}
.qm-bl-ring{position:absolute;inset:0;border-radius:9999px;border:2px solid rgba(245,158,11,0.18);border-top-color:var(--quant-primary);animation:qm-bl-spin 0.75s cubic-bezier(0.4, 0, 0.2, 1) infinite;}
@keyframes qm-bl-spin{to{transform:rotate(360deg);}}
@media (prefers-reduced-motion: reduce){.qm-bl-ring{animation:none;}}
`;

/**
 * QuantWorkplace loader (by quantrinity):
 * - `splash`: the revolving 5-app splash (black hole hub, five app rings,
 *   QuantWorkplace wordmark, "by quantrinity"). Server-renderable, so it is
 *   complete on first paint. `message` is announced to screen readers only
 *   (the splash shows no words of its own); `hint` is the one visible line.
 * - `inline`: the small spinner ring for buttons and rows.
 */
export function BrandLoader({
  variant = 'splash',
  message = 'Loading QuantWorkplace…',
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

  return <QuantWorkplaceRevolvingSplash message={message} hint={hint} className={className} />;
}

export default BrandLoader;
