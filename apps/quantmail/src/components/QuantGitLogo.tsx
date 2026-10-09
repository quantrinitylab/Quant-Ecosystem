'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { QuantLogoProps } from './AppMark';
import { useLiveMark, type MarkFrame } from './marks/useLiveMark';
import {
  paintFrog,
  createBlinkState,
  type BlinkState,
} from './marks/quantgit-frog';
import {
  onQuantGitMascotEvent,
  type QuantGitMascotEventKind,
} from './marks/quantgit-mascot-events';

/**
 * QuantGit's mark — the voxel-frog developer.
 *
 * A blocky purple frog (pale lavender belly, big pixel eyes with dark pupils)
 * sits behind a dark charcoal laptop with restrained silver pixel accents,
 * on a plain near-black plate — no smoke, no glow, no rim light. The scene
 * is stored as genuine 3D voxel data and projected per frame — the eyes genuinely blink
 * (a lid motion driven by a randomised state machine, never a flash), the
 * whole scene parallaxes a few degrees with the pointer, and a confirmed git
 * operation plays one short, restrained acknowledgement.
 *
 * It lives on the same `useLiveMark` pipeline as the other live marks, so it
 * inherits the shared lifecycle: one rAF loop, frame-rate independence,
 * reduced-motion (one static frame, eyes open), and pausing off-screen or on a
 * hidden tab. No WebGL, no new dependencies — voxel art is orthographic by
 * nature, and the existing Canvas 2D mark tier is its honest medium.
 *
 * Git operations reach the mascot through `quantgit-mascot-events`: the page
 * emits only *confirmed* outcomes (the same points that already toast), and an
 * `'error'` explicitly keeps the mascot neutral — a failure never plays the
 * success ack.
 */

const ACK_DURATION_MS = 1600;

interface Ack {
  kind: QuantGitMascotEventKind;
  startedAt: number;
}

/** Static twin for the no-Canvas-2D case: the same frog, simplified, as SVG. */
function QuantGitFrogStatic({ size, title }: { size: number; title: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label={title}
      className="h-full w-full"
    >
      <rect x="5" y="5" width="90" height="90" rx="22" fill="#0F0919" />
      {/* head */}
      <rect x="26" y="24" width="48" height="26" rx="4" fill="#8B46D9" />
      {/* eye sockets + whites + pupils */}
      <rect x="28" y="14" width="14" height="12" rx="2" fill="#9D55EC" />
      <rect x="58" y="14" width="14" height="12" rx="2" fill="#9D55EC" />
      <rect x="30" y="17" width="10" height="8" fill="#F5F2FF" />
      <rect x="60" y="17" width="10" height="8" fill="#F5F2FF" />
      <rect x="33" y="17" width="4" height="8" fill="#160B26" />
      <rect x="63" y="17" width="4" height="8" fill="#160B26" />
      {/* belly */}
      <rect x="40" y="50" width="20" height="14" rx="3" fill="#DCD4FC" />
      {/* laptop */}
      <rect x="26" y="62" width="48" height="22" rx="3" fill="#1C1526" />
      <rect x="32" y="68" width="4" height="4" fill="#CFC6F2" />
      <rect x="42" y="68" width="4" height="4" fill="#CFC6F2" />
      <rect x="52" y="68" width="4" height="4" fill="#CFC6F2" />
    </svg>
  );
}

export function QuantGitLogo({ size = 32, className = '', title = 'QuantGit' }: QuantLogoProps) {
  const blinkRef = useRef<BlinkState | null>(null);
  const ackRef = useRef<Ack | null>(null);
  const [canvas2d, setCanvas2d] = useState<boolean | null>(null);

  useEffect(() => {
    // Canvas 2D is the render path; without it the live mark cannot paint.
    try {
      setCanvas2d(!!document.createElement('canvas').getContext('2d'));
    } catch {
      setCanvas2d(false);
    }
    return onQuantGitMascotEvent((kind) => {
      if (kind === 'error') {
        ackRef.current = null;
        return;
      }
      ackRef.current = { kind, startedAt: performance.now() };
    });
  }, []);

  const paint = useCallback((frame: MarkFrame) => {
    const t = frame.reduced ? 0 : frame.time;
    if (!blinkRef.current) blinkRef.current = createBlinkState(t);

    let ackT = 0;
    const ack = ackRef.current;
    if (ack) {
      const ageMs = performance.now() - ack.startedAt;
      if (ageMs >= ACK_DURATION_MS) {
        ackRef.current = null;
      } else {
        ackT = ageMs / ACK_DURATION_MS;
      }
    }

    paintFrog(frame, blinkRef.current, ackT);
  }, []);

  const { canvasRef, pointerProps } = useLiveMark(paint, size);

  // No Canvas 2D (or still probing on the very first SSR frame): the static
  // twin. It is the same frog, simplified — not a different logo.
  if (canvas2d === false) {
    return (
      <span
        role="img"
        aria-label={title}
        title={title}
        className={`inline-flex shrink-0 select-none items-center justify-center ${className}`}
        style={{ width: size, height: size }}
      >
        <QuantGitFrogStatic size={size} title={title} />
      </span>
    );
  }

  return (
    <span
      role="img"
      aria-label={title}
      title={title}
      className={`inline-flex shrink-0 select-none items-center justify-center ${className}`}
      style={{ width: size, height: size }}
      {...pointerProps}
    >
      <canvas
        ref={canvasRef}
        className="h-full w-full drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]"
        style={{ width: size, height: size }}
      />
    </span>
  );
}

export default QuantGitLogo;
