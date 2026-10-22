'use client';

import { useId } from 'react';
import type { ReactNode } from 'react';

// ============================================================================
// QUANTWORKPLACE — REVOLVING 5-APP SPLASH (by quantrinity)
// ============================================================================
// What a signed-in visitor sees first. AuthGuard renders it while the session
// is restored (it replaces the old "Authenticating..." text), BrandLoader and
// RouteSplash render it for route loaders, and QuantumSplashIntro for the
// once-per-session brand hold.
//
//   centre    Gargantua black hole (static image)
//   wheel     smoked-obsidian bridge outline + five app rings that revolve
//             clockwise while every badge counter-rotates, so it stays upright
//               top         QuantGit     (-90deg)
//               top-right   QuantMail    (-18deg)
//               bottom-right QuantCalendar (54deg)
//               bottom-left QuantDrive   (126deg)
//               left        QuantContacts (198deg)
//   wordmark  QuantWorkplace (cursive image)
//   footer    "by", black hole, quantrinity (cursive image)
//
// Brand constraints (user, 2026-10-18): #040508 canvas, exactly five app
// badges, no extra words. `message` is therefore spoken only (sr-only); the
// single piece of optional visible text is `hint` (RouteSplash's slow-start
// notice after five seconds).
//
// First-paint contract. This markup is server-rendered inside AuthGuard, so it
// must be complete without any client JavaScript and identical on the server
// and in the browser:
//   - the badges are the preloaded static /mascots/<pillar>-sm.webp images, not
//     the canvas logos (those paint nothing until their first animation frame,
//     which on a cold load is after hydration);
//   - the motion is CSS keyframes only (no timers, no framer-motion), with a
//     prefers-reduced-motion block that stops it;
//   - the geometry is computed once at module load and rounded, so an engine
//     that differs in the last digit of Math.cos cannot cause a hydration
//     attribute mismatch;
//   - gradient ids come from useId, so a splash that is fading out over a
//     second one can never resolve url(#...) against the wrong <defs>;
//   - the inline stylesheet avoids quotes and combinators, so server and
//     client serialise it identically.

/** How long the fade-out lasts when AuthGuard hands over to the app. */
export const QW_SPLASH_EXIT_MS = 200;

const SIZE = 304;
const CENTER = SIZE / 2;
const ORBIT_RADIUS = 100;
const RING_RADIUS = 33.5;
const BADGE_BOX = 68;
const BADGE_IMAGE = 40;

const round2 = (value: number) => Math.round(value * 100) / 100;

/** The five app badges. Exactly five, by brand rule. */
const ORBITAL_NODES = [
  { id: 'quantgit', color: '#7C3AED', deg: -90 },
  { id: 'mail', color: '#EA580C', deg: -18 },
  { id: 'calendar', color: '#2563EB', deg: 54 },
  { id: 'drive', color: '#16A34A', deg: 126 },
  { id: 'contacts', color: '#D97706', deg: 198 },
].map((node) => {
  const rad = (node.deg * Math.PI) / 180;
  return {
    ...node,
    cx: round2(CENTER + ORBIT_RADIUS * Math.cos(rad)),
    cy: round2(CENTER + ORBIT_RADIUS * Math.sin(rad)),
    src: `/mascots/${node.id}-sm.webp`,
  };
});

// Smoked-obsidian bridge outline joining the hub to the five rings. Baked as a
// path (the metaball it was traced from is not needed at runtime).
const HUB_OUTLINE_PATH =
  'M 181.27,69.30 L 179.33,73.75 L 178.28,78.48 L 178.16,83.33 L 178.97,88.11 L 180.69,92.65 L 183.25,96.77 L 186.55,100.32 L 190.47,103.17 L 194.87,105.21 L 199.58,106.37 L 204.43,106.61 L 209.22,105.90 L 213.80,104.29 L 217.98,101.83 L 221.61,98.61 L 221.61,98.61 L 228.78,92.76 L 237.28,89.10 L 246.46,87.91 L 255.62,89.27 L 264.05,93.09 L 271.12,99.07 L 276.28,106.75 L 279.14,115.56 L 279.48,124.81 L 277.28,133.80 L 272.70,141.84 L 266.09,148.33 L 257.97,152.76 L 248.94,154.79 L 239.69,154.28 L 239.69,154.28 L 234.87,153.81 L 230.04,154.27 L 225.39,155.66 L 221.09,157.91 L 217.31,160.94 L 214.18,164.65 L 211.83,168.89 L 210.33,173.50 L 209.74,178.32 L 210.10,183.15 L 211.37,187.83 L 213.52,192.18 L 216.47,196.03 L 220.10,199.25 L 224.28,201.70 L 224.28,201.70 L 232.06,206.72 L 238.17,213.67 L 242.15,222.03 L 243.68,231.16 L 242.65,240.36 L 239.15,248.93 L 233.44,256.21 L 225.95,261.66 L 217.26,264.84 L 208.02,265.52 L 198.96,263.65 L 190.75,259.37 L 184.03,253.01 L 179.30,245.05 L 176.93,236.10 L 176.93,236.10 L 175.89,231.37 L 173.95,226.92 L 171.20,222.93 L 167.73,219.54 L 163.68,216.88 L 159.18,215.05 L 154.43,214.12 L 149.57,214.12 L 144.82,215.05 L 140.32,216.88 L 136.27,219.54 L 132.80,222.93 L 130.05,226.92 L 128.11,231.37 L 127.07,236.10 L 127.07,236.10 L 124.70,245.05 L 119.97,253.01 L 113.25,259.37 L 105.04,263.65 L 95.98,265.52 L 86.74,264.84 L 78.05,261.66 L 70.56,256.21 L 64.85,248.93 L 61.35,240.36 L 60.32,231.16 L 61.85,222.03 L 65.83,213.67 L 71.94,206.72 L 79.72,201.70 L 79.72,201.70 L 83.90,199.25 L 87.53,196.03 L 90.48,192.18 L 92.63,187.83 L 93.90,183.15 L 94.26,178.32 L 93.67,173.50 L 92.17,168.89 L 89.82,164.65 L 86.69,160.94 L 82.91,157.91 L 78.61,155.66 L 73.96,154.27 L 69.13,153.81 L 64.31,154.28 L 64.31,154.28 L 55.06,154.79 L 46.03,152.76 L 37.91,148.33 L 31.30,141.84 L 26.72,133.80 L 24.52,124.81 L 24.86,115.56 L 27.72,106.75 L 32.88,99.07 L 39.95,93.09 L 48.38,89.27 L 57.54,87.91 L 66.72,89.10 L 75.22,92.76 L 82.39,98.61 L 82.39,98.61 L 86.02,101.83 L 90.20,104.29 L 94.78,105.90 L 99.57,106.61 L 104.42,106.37 L 109.13,105.21 L 113.53,103.17 L 117.45,100.32 L 120.75,96.77 L 123.31,92.65 L 125.03,88.11 L 125.84,83.33 L 125.72,78.48 L 124.67,73.75 L 122.73,69.30 L 122.73,69.30 L 119.39,60.67 L 118.54,51.45 L 120.24,42.36 L 124.36,34.07 L 130.60,27.23 L 138.47,22.35 L 147.37,19.82 L 156.63,19.82 L 165.53,22.35 L 173.40,27.23 L 179.64,34.07 L 183.76,42.36 L 185.46,51.45 L 184.61,60.67 L 181.27,69.30 Z';

const SPLASH_CSS = `
@keyframes qw-orbit-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
@keyframes qw-counter-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(-360deg); }
}
@keyframes qw-splash-out {
  from { opacity: 1; }
  to { opacity: 0; }
}
.qw-revolving-wheel { animation: qw-orbit-spin 9s linear infinite; }
.qw-upright-mascot { animation: qw-counter-spin 9s linear infinite; }
.qw-splash[data-leaving=true] { animation: qw-splash-out ${QW_SPLASH_EXIT_MS}ms ease-out forwards; }
@media (prefers-reduced-motion: reduce) {
  .qw-revolving-wheel, .qw-upright-mascot { animation: none; }
  .qw-splash[data-leaving=true] { animation: none; opacity: 0; }
}
`;

export interface QuantWorkplaceRevolvingSplashProps {
  /** Announced to screen readers only. The splash never shows words of its own. */
  message?: string;
  /** Visible notice under the wordmark (RouteSplash's slow-start hint). */
  hint?: ReactNode;
  onClick?: () => void;
  /**
   * Fade out and stop intercepting pointer events. Set by AuthGuard for the
   * moment the app mounts underneath, so the hand-over is a short cross-fade
   * the user can already tap through.
   */
  leaving?: boolean;
  className?: string;
}

export function QuantWorkplaceRevolvingSplash({
  message,
  hint,
  onClick,
  leaving = false,
  className = '',
}: QuantWorkplaceRevolvingSplashProps) {
  const hubGradientId = `qw-hub-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

  return (
    <div
      data-testid="qw-splash"
      data-leaving={leaving ? 'true' : undefined}
      onClick={onClick}
      className={`qw-splash fixed inset-0 z-[99999] flex select-none flex-col items-center justify-between overflow-hidden bg-[#040508] px-6 py-7 ${
        leaving ? 'pointer-events-none' : ''
      } ${className}`}
      role="status"
      aria-live="polite"
      aria-busy={leaving ? undefined : true}
    >
      <style>{SPLASH_CSS}</style>
      {message ? <span className="sr-only">{message}</span> : null}

      <div className="h-2" />

      {/* CENTER: revolving 5-app wheel + QuantWorkplace wordmark */}
      <div className="relative flex flex-col items-center justify-center">
        <div className="relative flex size-[304px] items-center justify-center">
          {/* Revolving wheel: bridge outline + five coloured app rings + badges */}
          <div className="qw-revolving-wheel absolute inset-0 flex items-center justify-center">
            <svg
              width={SIZE}
              height={SIZE}
              viewBox={`0 0 ${SIZE} ${SIZE}`}
              className="absolute inset-0"
              aria-hidden="true"
              focusable="false"
            >
              <defs>
                <radialGradient id={hubGradientId} cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#1E2538" stopOpacity="0.45" />
                  <stop offset="50%" stopColor="#131826" stopOpacity="0.32" />
                  <stop offset="80%" stopColor="#0B0E17" stopOpacity="0.22" />
                  <stop offset="100%" stopColor="#05070B" stopOpacity="0.12" />
                </radialGradient>
              </defs>

              {/* Smoked obsidian bridge between the hub and the rings */}
              <path
                d={HUB_OUTLINE_PATH}
                fill={`url(#${hubGradientId})`}
                stroke="#E2C499"
                strokeWidth="1.3"
                strokeOpacity="0.65"
              />

              {/* The five coloured app rings */}
              {ORBITAL_NODES.map((node) => (
                <g key={`ring-${node.id}`}>
                  <circle cx={node.cx} cy={node.cy} r={RING_RADIUS} fill="#07090E" />
                  <circle
                    cx={node.cx}
                    cy={node.cy}
                    r={RING_RADIUS}
                    fill="none"
                    stroke={node.color}
                    strokeWidth="5.2"
                  />
                </g>
              ))}

              {/* Warm golden collar around the central black hole */}
              <circle
                cx={CENTER}
                cy={CENTER}
                r="49"
                fill="none"
                stroke="#E5A85A"
                strokeOpacity="0.85"
                strokeWidth="1.8"
              />
            </svg>

            {/* Five upright app badges inside the revolving rings */}
            {ORBITAL_NODES.map((node) => (
              <div
                key={`badge-${node.id}`}
                className="absolute flex items-center justify-center"
                style={{
                  width: BADGE_BOX,
                  height: BADGE_BOX,
                  left: node.cx - BADGE_BOX / 2,
                  top: node.cy - BADGE_BOX / 2,
                }}
              >
                <div className="qw-upright-mascot flex items-center justify-center">
                  <img
                    src={node.src}
                    alt=""
                    width={BADGE_IMAGE}
                    height={BADGE_IMAGE}
                    draggable={false}
                    data-qw-badge={node.id}
                    className="block object-contain"
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Stationary core: Gargantua black hole */}
          <div className="relative z-10 flex size-[100px] items-center justify-center rounded-full bg-black shadow-[0_0_24px_rgba(229,168,90,0.22)]">
            <img
              src="/brand/gargantua_master.png"
              alt=""
              width={132}
              height={64}
              draggable={false}
              className="h-[64px] w-[132px] object-contain"
            />
          </div>
        </div>

        {/* QuantWorkplace cursive wordmark */}
        <div className="mt-7 flex flex-col items-center">
          <img
            src="/brand/quantworkplace_cursive_badge.png"
            alt="QuantWorkplace"
            height={52}
            draggable={false}
            className="h-[52px] object-contain"
          />
          {hint ? <div className="mt-3 text-center text-xs text-[#94A3B8]">{hint}</div> : null}
        </div>
      </div>

      {/* FOOTER: "by", black hole, quantrinity */}
      <div className="flex flex-col items-center gap-1.5 pb-1">
        <span className="text-[12px] font-medium tracking-[0.20em] text-[#94A3B8]/85">by</span>
        <img
          src="/brand/gargantua_master.png"
          alt=""
          width={58}
          height={25}
          draggable={false}
          className="h-[25px] w-[58px] object-contain"
        />
        <img
          src="/brand/quantrinity_cursive_badge.png"
          alt="quantrinity"
          height={22}
          draggable={false}
          className="h-[22px] object-contain"
        />
      </div>
    </div>
  );
}

export default QuantWorkplaceRevolvingSplash;
