'use client';

/**
 * The animation lifecycle every live mark shares, extracted so a new mark is only
 * its artwork.
 *
 * `QuantMailLogo` proved the shape of this: one `requestAnimationFrame` loop
 * mounted once, every mutable value in a ref so no state change can ever restart
 * it, and a device-pixel-scaled buffer transformed once per frame. Copying those
 * forty lines into six more components is exactly the duplication the design
 * engine's §18 forbids, so they live here and each mark passes in a painter.
 *
 * Two things this adds over the original, both of which matter once four marks
 * share a sidebar:
 *
 * - **Frame-rate independence.** The mail mark advances `time` by a fixed 0.024
 *   per frame, so it runs at double speed on a 120Hz display. Here the same 0.024
 *   is scaled by the real frame delta, which keeps the tuned look at 60Hz and
 *   fixes it everywhere else.
 * - **It stops when nobody is looking.** Off-screen or on a hidden tab, the loop
 *   cancels instead of burning a gradient repaint per mark per frame.
 */

import {
  useCallback,
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import { MARK_RES, markDpr } from '../../lib/marks/canvas-mark';

/** Everything a painter is allowed to know about the current frame. */
export interface MarkFrame {
  ctx: CanvasRenderingContext2D;
  /** Buffer edge in logical px — always `MARK_RES`, passed so painters never import it. */
  res: number;
  cx: number;
  cy: number;
  /** Monotonic, seeded at random per instance, never resets. Matches the mail mark's rate. */
  time: number;
  /** Damped pointer offset from centre, roughly ±0.8. */
  tiltX: number;
  tiltY: number;
  /** Eased 0→1 hover weight. */
  hover: number;
  /** Eased 0→1 press weight. */
  press: number;
  /** True when the user asked for less motion; the loop has drawn one frame and stopped. */
  reduced: boolean;
}

export type MarkPainter = (frame: MarkFrame) => void;

/** What a mark component spreads onto its host element to feel the pointer. */
export interface MarkPointerProps {
  onPointerMove: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  onPointerDown: () => void;
  onPointerUp: () => void;
}

export function useLiveMark(
  paint: MarkPainter,
  /**
   * Display edge in CSS px. The buffer is supersampled to `max(100, size) * dpr` and
   * the context scaled so painters keep working in the family's 100-unit space —
   * otherwise a mark at the 104px hero size is a 100px buffer stretched, which is
   * exactly the softness the fixed-`res` original shows when it is drawn large.
   */
  size: number,
): {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  pointerProps: MarkPointerProps;
  /** Force one frame. Needed under reduced motion, where the loop is not running. */
  repaint: () => void;
} {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // The painter is read through a ref so a fresh closure on every render — and it is
  // every render, since it captures props — cannot restart the loop.
  const paintRef = useRef(paint);
  paintRef.current = paint;

  const timeRef = useRef(Math.random() * 100);
  const tiltRef = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const hoverRef = useRef({ v: 0, target: 0 });
  const pressRef = useRef({ v: 0, target: 0 });
  const frameRef = useRef<number | null>(null);
  const lastTsRef = useRef(0);
  const reducedRef = useRef(false);
  const drawOnceRef = useRef<() => void>(() => {});

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const nx = (e.clientX - rect.left) / rect.width - 0.5;
    const ny = (e.clientY - rect.top) / rect.height - 0.5;
    tiltRef.current.tx = Math.max(-0.8, Math.min(0.8, nx * 1.6));
    tiltRef.current.ty = Math.max(-0.8, Math.min(0.8, ny * 1.6));
    if (reducedRef.current) drawOnceRef.current();
  }, []);

  const onPointerEnter = useCallback(() => {
    hoverRef.current.target = 1;
  }, []);

  const onPointerLeave = useCallback(() => {
    hoverRef.current.target = 0;
    pressRef.current.target = 0;
    tiltRef.current.tx = 0;
    tiltRef.current.ty = 0;
    if (reducedRef.current) drawOnceRef.current();
  }, []);

  const onPointerDown = useCallback(() => {
    pressRef.current.target = 1;
  }, []);

  const onPointerUp = useCallback(() => {
    pressRef.current.target = 0;
  }, []);

  const repaint = useCallback(() => {
    drawOnceRef.current();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const dpr = markDpr();
    const buffer = Math.max(MARK_RES, Math.ceil(size)) * dpr;
    canvas.width = buffer;
    canvas.height = buffer;
    const k = buffer / MARK_RES;

    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedRef.current = media.matches;

    const drawFrame = () => {
      ctx.setTransform(k, 0, 0, k, 0, 0);
      ctx.clearRect(0, 0, MARK_RES, MARK_RES);
      paintRef.current({
        ctx,
        res: MARK_RES,
        cx: MARK_RES / 2,
        cy: MARK_RES / 2,
        time: timeRef.current,
        tiltX: tiltRef.current.x,
        tiltY: tiltRef.current.y,
        hover: hoverRef.current.v,
        press: pressRef.current.v,
        reduced: reducedRef.current,
      });
    };
    drawOnceRef.current = drawFrame;

    const step = (ts: number) => {
      // Clamped so a tab that was hidden for a minute resumes instead of teleporting.
      const raw = lastTsRef.current === 0 ? 16.667 : ts - lastTsRef.current;
      lastTsRef.current = ts;
      const dt = Math.min(Math.max(raw, 1), 50) / 16.667;

      timeRef.current += 0.024 * dt;
      const t = tiltRef.current;
      t.x += (t.tx - t.x) * Math.min(1, 0.12 * dt);
      t.y += (t.ty - t.y) * Math.min(1, 0.12 * dt);
      const h = hoverRef.current;
      h.v += (h.target - h.v) * Math.min(1, 0.16 * dt);
      const p = pressRef.current;
      p.v += (p.target - p.v) * Math.min(1, 0.24 * dt);

      drawFrame();
      frameRef.current = requestAnimationFrame(step);
    };

    let onScreen = true;
    const start = () => {
      if (reducedRef.current || frameRef.current !== null) return;
      if (!onScreen || document.hidden) return;
      lastTsRef.current = 0;
      frameRef.current = requestAnimationFrame(step);
    };
    const stop = () => {
      if (frameRef.current === null) return;
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };

    // Paint immediately: a mark must never flash empty, even if the loop never starts.
    drawFrame();
    start();

    const onMedia = () => {
      reducedRef.current = media.matches;
      if (reducedRef.current) {
        stop();
        drawFrame();
      } else {
        start();
      }
    };
    media.addEventListener('change', onMedia);

    const onVisibility = () => {
      if (document.hidden) stop();
      else start();
    };
    document.addEventListener('visibilitychange', onVisibility);

    // Four marks in a collapsed sidebar are four gradient repaints per frame for
    // nothing. Scrolled out of view, they stop.
    const io =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver(
            (entries) => {
              const entry = entries[entries.length - 1];
              if (!entry) return;
              onScreen = entry.isIntersecting;
              if (onScreen) start();
              else stop();
            },
            { threshold: 0 },
          );
    io?.observe(canvas);

    return () => {
      stop();
      io?.disconnect();
      media.removeEventListener('change', onMedia);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [size]);

  return {
    canvasRef,
    pointerProps: { onPointerMove, onPointerEnter, onPointerLeave, onPointerDown, onPointerUp },
    repaint,
  };
}
