'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
// Relative, not `@/` — in this app `@/*` resolves to `src/app/*`, so `@/lib`
// would be a directory that does not exist. The rest of `src/components`
// imports `../lib/...` for the same reason.
import {
  createMarkRenderer,
  type MarkRenderer,
  type UniformValue,
} from '../../lib/marks/gl-renderer';

export interface MarkGLProps {
  /** A complete fragment shader, from `buildMarkShader`. */
  fragmentSource: string;
  /** Mark-specific uniform values. Re-applied whenever they change. */
  uniforms?: Readonly<Record<string, UniformValue>>;
  /** CSS px. The canvas backing store is this times DPR, capped at 2. */
  size?: number;
  /** Run the idle ember settle. Forced off under `prefers-reduced-motion`. */
  animate?: boolean;
  /** Lift the ember on pointer hover, on the shared 120ms/380ms curve. */
  interactive?: boolean;
  className?: string;
  title: string;
  /**
   * The SVG twin. Rendered instead of the canvas when WebGL2 is unavailable or
   * the shader fails to build — which is not an edge case worth apologising for:
   * this material degrades to *flat dark plus a glowing path*, and that is
   * trivially expressible in SVG. A glossy candy-3D mark has no such fallback,
   * and that was the strongest technical argument for graphite in the first
   * place.
   */
  fallback?: ReactNode;
  /**
   * The compile/link log, or the reason there is no context. Fires once, and it
   * is the only way a shader error is observable — `no-console` is an error in
   * this app, so a failed mark would otherwise be a silent SVG substitution and
   * a shader bug could ship looking exactly like a browser without WebGL2.
   */
  onFailure?: (reason: string) => void;
}

/** The shared motion signature: ~120ms in, ~380ms out, `cubic-bezier(.16,1,.3,1)`. */
const HOVER_IN_MS = 120;
const HOVER_OUT_MS = 380;

function emberEase(t: number): number {
  // The tail of cubic-bezier(.16,1,.3,1): fast departure, long settle.
  return 1 - Math.pow(1 - t, 3);
}

/**
 * One canvas, one shader, one draw call.
 *
 * This never appears in the app shell's critical path: it is the hero tier. The
 * 16-40px tier is the SVG twin, and the reduced-motion tier is that same SVG.
 */
export function MarkGL({
  fragmentSource,
  uniforms,
  size = 220,
  animate = true,
  interactive = true,
  className = '',
  title,
  fallback,
  onFailure,
}: MarkGLProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<MarkRenderer | null>(null);
  const hoverRef = useRef({ value: 0, target: 0, frame: 0, at: 0 });
  const failureRef = useRef(onFailure);
  failureRef.current = onFailure;
  const [failed, setFailed] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = createMarkRenderer(canvas, {
      fragmentSource,
      animate: false, // set below, once reduced-motion is known
      onFailure: (reason) => {
        setFailed(true);
        // Through a ref so a caller passing an inline arrow does not tear the
        // context down and rebuild it on every parent render.
        failureRef.current?.(reason);
      },
    });
    rendererRef.current = renderer;
    if (!renderer.supported) setFailed(true);

    return () => {
      renderer.dispose();
      rendererRef.current = null;
    };
  }, [fragmentSource]);

  // Uniforms are re-applied on every change. `JSON.stringify` is the dependency
  // because the caller passes a fresh object literal each render, and a lab page
  // with six sliders would otherwise rebuild nothing or everything.
  const uniformKey = JSON.stringify(uniforms ?? {});
  useEffect(() => {
    rendererRef.current?.setUniforms({
      ...(uniforms ?? {}),
      uBreath: animate && !reducedMotion ? 1 : 0,
    });
  }, [uniformKey, animate, reducedMotion, uniforms]);

  useEffect(() => {
    rendererRef.current?.setAnimating(animate && !reducedMotion);
  }, [animate, reducedMotion]);

  useEffect(() => {
    return () => {
      if (hoverRef.current.frame) cancelAnimationFrame(hoverRef.current.frame);
    };
  }, []);

  function tweenHover(target: number) {
    if (!interactive || reducedMotion) return;
    const state = hoverRef.current;
    const from = state.value;
    const duration = target > from ? HOVER_IN_MS : HOVER_OUT_MS;
    const started = performance.now();
    state.target = target;

    if (state.frame) cancelAnimationFrame(state.frame);

    const step = (now: number) => {
      const t = duration <= 0 ? 1 : Math.min(1, (now - started) / duration);
      state.value = from + (target - from) * emberEase(t);
      rendererRef.current?.setUniform('uHover', state.value);
      state.frame = t < 1 ? requestAnimationFrame(step) : 0;
    };
    state.frame = requestAnimationFrame(step);
  }

  if (failed && fallback) {
    // No `role="img"` here: the twin is a whole mark and carries its own label,
    // so wrapping it in a second labelled image announces the icon twice.
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center ${className}`}
        style={{ width: size, height: size }}
      >
        {fallback}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center ${className}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={title}
      onPointerEnter={() => tweenHover(1)}
      onPointerLeave={() => tweenHover(0)}
    >
      <canvas
        ref={canvasRef}
        className="h-full w-full"
        style={{ width: size, height: size }}
        aria-hidden="true"
      />
    </span>
  );
}

export default MarkGL;
