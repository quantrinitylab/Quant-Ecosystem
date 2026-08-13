'use client';

import type { ReactNode } from 'react';
import { QuantrinityMark } from './QuantrinityMark';

interface BrandLoaderProps {
  variant?: 'splash' | 'inline';
  message?: string;
  hint?: ReactNode;
  className?: string;
}

const splashCss = `
.qm-bl-splash{position:fixed;inset:0;z-index:60;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;background:var(--quant-background,var(--quant-surface,#0b0f14));}
.qm-bl-scene{position:relative;display:flex;align-items:flex-end;justify-content:center;width:180px;height:150px;perspective:900px;}
.qm-bl-envelope{position:relative;width:150px;height:100px;transform-style:preserve-3d;animation:qm-bl-tilt 3.6s ease-in-out infinite;}
.qm-bl-base{position:absolute;inset:0;border-radius:10px;background:linear-gradient(150deg,#151b23,#0e1319);border:1px solid var(--quant-border,rgba(255,255,255,0.09));box-shadow:inset 0 0 24px rgba(0,0,0,0.55);}
.qm-bl-flap{position:absolute;left:0;top:0;width:0;height:0;border-left:75px solid transparent;border-right:75px solid transparent;border-top:52px solid #1d2631;transform-origin:top center;animation:qm-bl-flap 3.6s ease-in-out infinite;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.4));z-index:4;}
.qm-bl-card{position:absolute;left:14px;right:14px;bottom:10px;height:78px;display:flex;align-items:center;justify-content:center;border-radius:8px;background:linear-gradient(160deg,#f6f8fb,#dfe6ee);box-shadow:0 6px 18px rgba(0,0,0,0.45);animation:qm-bl-card 3.6s ease-in-out infinite;z-index:2;}
.qm-bl-card-mark svg{width:64px;height:auto;display:block;}
.qm-bl-pocket{position:absolute;left:0;right:0;bottom:0;height:56px;border-radius:0 0 10px 10px;background:linear-gradient(180deg,#18202a,#121820);clip-path:polygon(0 0,50% 62%,100% 0,100% 100%,0 100%);border-top:1px solid rgba(255,255,255,0.05);z-index:3;}
.qm-bl-tricolor{position:absolute;left:10px;right:10px;bottom:6px;height:3px;border-radius:2px;background:linear-gradient(90deg,#ff8a18,#fff8e8,#45b94d);opacity:0.9;z-index:5;}
.qm-bl-shadow{position:absolute;bottom:-8px;width:120px;height:14px;border-radius:50%;background:radial-gradient(ellipse,rgba(0,0,0,0.5),transparent 70%);animation:qm-bl-shadow 3.6s ease-in-out infinite;}
.qm-bl-message{margin:0;font-size:14px;letter-spacing:0.02em;color:var(--quant-muted-foreground,#8a94a3);}
.qm-bl-hint{text-align:center;}
@keyframes qm-bl-tilt{0%,100%{transform:rotateY(-8deg) rotateX(6deg);}50%{transform:rotateY(8deg) rotateX(2deg);}}
@keyframes qm-bl-flap{0%,18%{transform:rotateX(0deg);z-index:4;}42%,68%{transform:rotateX(-178deg);z-index:1;}88%,100%{transform:rotateX(0deg);z-index:4;}}
@keyframes qm-bl-card{0%,20%{transform:translateY(8px);}46%,64%{transform:translateY(-34px);}90%,100%{transform:translateY(8px);}}
@keyframes qm-bl-shadow{0%,100%{transform:scaleX(1);opacity:0.8;}50%{transform:scaleX(0.86);opacity:0.55;}}
@media (prefers-reduced-motion: reduce){
.qm-bl-envelope,.qm-bl-flap,.qm-bl-card,.qm-bl-shadow{animation:none;}
.qm-bl-flap{transform:rotateX(-178deg);z-index:1;}
.qm-bl-card{transform:translateY(-20px);}
}
`;

const inlineCss = `
.qm-bl-inline{position:relative;display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;}
.qm-bl-ring{position:absolute;inset:0;border-radius:9999px;border:2px solid var(--quant-border,rgba(255,255,255,0.12));border-top-color:#ff8a18;border-right-color:#45b94d;animation:qm-bl-spin 0.9s linear infinite;}
.qm-bl-inline-mark svg{width:20px;height:auto;display:block;}
@keyframes qm-bl-spin{to{transform:rotate(360deg);}}
@media (prefers-reduced-motion: reduce){.qm-bl-ring{animation:none;}}
`;

/**
 * QuantMail 3D brand loader.
 *
 * Splash: full-screen 3D envelope choreography — the flap lifts, the
 * Quantrinity card rises out, settles back, and loops until content is ready.
 * Inline: compact orbit ring around the Quantrinity mark for in-panel loads.
 * Honors prefers-reduced-motion with a static brand lockup instead of motion.
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
        <QuantrinityMark compact className="qm-bl-inline-mark" label="Loading" />
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
      <div className="qm-bl-scene" aria-hidden="true">
        <div className="qm-bl-envelope">
          <span className="qm-bl-flap" />
          <span className="qm-bl-card">
            <QuantrinityMark className="qm-bl-card-mark" label="Quantrinity" />
          </span>
          <span className="qm-bl-pocket" />
          <span className="qm-bl-base" />
          <span className="qm-bl-tricolor" />
        </div>
        <span className="qm-bl-shadow" />
      </div>
      <p className="qm-bl-message">{message}</p>
      {hint ? <div className="qm-bl-hint">{hint}</div> : null}
      <span className="sr-only">{message}</span>
      <style>{splashCss}</style>
    </div>
  );
}
