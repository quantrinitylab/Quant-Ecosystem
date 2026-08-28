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
.qm-bl-ring{position:absolute;inset:0;border-radius:9999px;border:2px solid rgba(245,158,11,0.18);border-top-color:#FF8C42;animation:qm-bl-spin 0.75s cubic-bezier(0.4, 0, 0.2, 1) infinite;}
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
        <div className="relative flex items-center justify-center size-24 sm:size-28">
          {/* Track Ring */}
          <div className="absolute inset-0 rounded-full border border-[#282C35]/80" />

          {/*
            Smooth conic orbital spinner. The arc is the whole signal — it had a
            blurred amber blob behind it and a drop-shadow around it, which on the
            near-black canvas read as a neon bloom rather than as progress.
          */}
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-[#FF8C42] border-r-[#FF9B5A]/70 animate-[spin_1s_cubic-bezier(0.4,0,0.2,1)_infinite]" />

          {/* Center Mascot Logo */}
          <div className="relative z-10 flex items-center justify-center size-14 sm:size-16 rounded-2xl bg-[#090A0C]/80 border border-[#282C35]/90 shadow-2xl">
            <QuantMailLogo size={42} variant="full" interactive={false} />
          </div>
        </div>

        {/* Crisp Modern Loading Subtitle */}
        <p className="mt-8 text-[13px] font-medium text-[#A1A4AC] tracking-wide font-sans">
          {message}
        </p>
        {hint ? (
          <div className="text-center text-xs text-[#6B6E76] mt-1 font-sans">{hint}</div>
        ) : null}
      </div>

      {/* Minimalist Tech Hierarchy (Apple/Google style) */}
      <div className="flex flex-col items-center gap-1 pb-4 text-center">
        <span className="text-sm font-semibold tracking-wider text-[#F5F5F5] font-sans">
          QUANTMAIL
        </span>
        <div className="flex items-center gap-1.5 text-[10px] font-mono tracking-[0.25em] text-[#6B6E76] uppercase">
          <span>BY</span>
          <span className="font-bold text-[#FF8C42] tracking-[0.3em]">QUANTRINITY</span>
        </div>
      </div>

      <span className="sr-only">{message}</span>
    </div>
  );
}

export default BrandLoader;
