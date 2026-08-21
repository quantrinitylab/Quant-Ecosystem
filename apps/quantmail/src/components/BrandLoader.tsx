'use client';

import type { ReactNode } from 'react';
import { QuantMailLogo } from './QuantMailLogo';

interface BrandLoaderProps {
  variant?: 'splash' | 'inline';
  message?: string;
  hint?: ReactNode;
  className?: string;
}

const inlineCss = `
.qm-bl-inline{position:relative;display:inline-flex;width:20px;height:20px;}
.qm-bl-ring{position:absolute;inset:0;border-radius:9999px;border:2px solid rgba(245,158,11,0.18);border-top-color:#FF7A00;animation:qm-bl-spin 0.75s cubic-bezier(0.4, 0, 0.2, 1) infinite;}
@keyframes qm-bl-spin{to{transform:rotate(360deg);}}
@media (prefers-reduced-motion: reduce){.qm-bl-ring{animation:none;}}
`;

/**
 * QuantMail Apple/Google-tier luxury loader:
 * - Living mascot badge with subtle breathing amber glow.
 * - Precision smooth orbital spinner ring.
 * - Modern, clean typographic hierarchy with letterspaced QUANTRINITY branding.
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
      className={`fixed inset-0 z-50 flex flex-col items-center justify-between bg-[#080a0f] p-8 select-none ${className}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="w-full" />

      {/* Center Precision Mascot & Smooth Orbital Progress */}
      <div className="relative flex flex-col items-center justify-center">
        {/* Soft Ambient Warm Glow */}
        <div className="absolute -inset-12 rounded-full bg-gradient-to-tr from-amber-500/20 via-orange-500/10 to-transparent blur-3xl" />

        <div className="relative flex items-center justify-center size-24 sm:size-28">
          {/* Track Ring */}
          <div className="absolute inset-0 rounded-full border border-zinc-800/80" />

          {/* Smooth Conic Orbital Spinner */}
          <div
            className="absolute inset-0 rounded-full border-2 border-transparent border-t-[#FF7A00] border-r-amber-400/80 animate-[spin_1s_cubic-bezier(0.4,0,0.2,1)_infinite]"
            style={{ filter: 'drop-shadow(0 0 8px rgba(255, 122, 0, 0.4))' }}
          />

          {/* Center Mascot Logo */}
          <div className="relative z-10 flex items-center justify-center size-14 sm:size-16 rounded-2xl bg-zinc-950/80 border border-zinc-800/90 shadow-2xl">
            <QuantMailLogo size={42} variant="full" interactive={false} />
          </div>
        </div>

        {/* Crisp Modern Loading Subtitle */}
        <p className="mt-8 text-[13px] font-medium text-zinc-400 tracking-wide font-sans">
          {message}
        </p>
        {hint ? (
          <div className="text-center text-xs text-zinc-500 mt-1 font-sans">{hint}</div>
        ) : null}
      </div>

      {/* Minimalist Tech Hierarchy (Apple/Google style) */}
      <div className="flex flex-col items-center gap-1 pb-4 text-center">
        <span className="text-sm font-semibold tracking-wider text-zinc-200 font-sans">
          QUANTMAIL
        </span>
        <div className="flex items-center gap-1.5 text-[10px] font-mono tracking-[0.25em] text-zinc-500 uppercase">
          <span>BY</span>
          <span className="font-bold text-[#FF7A00] tracking-[0.3em]">QUANTRINITY</span>
        </div>
      </div>

      <span className="sr-only">{message}</span>
    </div>
  );
}

export default BrandLoader;
