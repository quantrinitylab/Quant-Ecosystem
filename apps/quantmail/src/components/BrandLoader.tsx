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
.qm-bl-inline{position:relative;display:inline-flex;width:22px;height:22px;}
.qm-bl-ring{position:absolute;inset:0;border-radius:9999px;border:2px solid rgba(255,255,255,0.12);border-top-color:#ff9933;animation:qm-bl-spin 0.8s linear infinite;}
@keyframes qm-bl-spin{to{transform:rotate(360deg);}}
@media (prefers-reduced-motion: reduce){.qm-bl-ring{animation:none;}}
`;

/**
 * QuantMail loader — living mascot with active fast spin, glowing orbit ring,
 * and Instagram-by-Meta style footer branding.
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
      <div className="w-full flex justify-end" />

      {/* Center Active Rotating Mascot + Orbit Rings */}
      <div className="relative flex flex-col items-center justify-center">
        {/* Outer glowing pulsing background */}
        <div className="absolute -inset-10 rounded-full bg-gradient-to-r from-amber-500/25 via-orange-500/15 to-transparent blur-2xl animate-pulse" />

        {/* Outer Spinning Dash Ring */}
        <div className="absolute -inset-6 rounded-full border-2 border-dashed border-amber-500/30 animate-[spin_4s_linear_infinite]" />

        {/* Middle Glowing Orbit Ring */}
        <div className="absolute -inset-3 rounded-full border-2 border-transparent border-t-amber-400 border-r-orange-500 animate-[spin_1.2s_linear_infinite]" />

        {/* Center Mascot Logo Fast Spin */}
        <div className="relative z-10 animate-[spin_3s_ease-in-out_infinite]">
          <QuantMailLogo size={68} variant="full" interactive={false} />
        </div>

        {/* Message below mascot */}
        <p className="mt-8 text-xs font-medium text-zinc-400 tracking-wider animate-pulse">
          {message}
        </p>
        {hint ? <div className="text-center text-xs text-zinc-500 mt-1">{hint}</div> : null}
      </div>

      {/* Bottom Instagram-by-Meta Style Branding */}
      <div className="flex flex-col items-center gap-0.5 pb-2 text-center">
        <span
          className="text-lg font-normal tracking-wide bg-gradient-to-r from-[#ff9933] via-[#ff5e62] to-[#e64980] bg-clip-text text-transparent"
          style={{
            fontFamily: 'var(--font-brand), "Segoe Script", "Comic Sans MS", cursive',
          }}
        >
          QuantMail
        </span>
        <div className="flex items-center gap-1.5 text-[11px] font-mono tracking-widest text-zinc-400 uppercase">
          <span>by</span>
          <span className="font-bold text-amber-400 tracking-[0.2em]">QUANTRINITY</span>
        </div>
      </div>

      <span className="sr-only">{message}</span>
    </div>
  );
}
