'use client';

/**
 * Living logos — the WebGL2 mascot marks in `lib/living-logos`, as React.
 *
 * The classic canvas marks stay the baseline. They are what renders on the
 * server, on the first client frame, without WebGL2, under the
 * `quant_living_logos=off` opt-out, and whenever the living renderer fails
 * (shader error, lost context, a chunk that will not load). The engine is its
 * own chunk, loaded with `import()` after hydration, and a mark switches to its
 * living twin only once that app's program and distance field are ready — so a
 * logo never shows an empty box.
 *
 * One module-level store serves every mark: one engine load, one prepare per
 * app, one failure flag that sends every mark back to its classic canvas.
 */

import { useEffect, useLayoutEffect, useRef, useSyncExternalStore, type CSSProperties } from 'react';
import type { CalendarFace, LivingLogoApp, LivingLogoHandle } from '../../lib/living-logos/engine';

export type { CalendarFace, LivingLogoApp, LivingLogoHandle };

type Engine = typeof import('../../lib/living-logos/engine');

/** `localStorage.setItem('quant_living_logos', 'off')` pins the classic marks. */
export const LIVING_LOGOS_OPT_OUT_KEY = 'quant_living_logos';

/**
 * Quant Workplace logo style (user-approved 2026-10-13): **clean** is the
 * default — glossy bead eyes without the neon cores, calm professional motion
 * (rarer blinks, small slow glances), eyes balanced per mark. Anyone who
 * prefers the original neon-eyed living logos keeps them with
 * `localStorage.setItem('quant_logo_style', 'original')`.
 */
export const LOGO_STYLE_KEY = 'quant_logo_style';

/** Clean-eye size per mark, measured against each mark's face (1 = reference art). */
const CLEAN_EYE_SCALE: Record<LivingLogoApp, number> = {
  mail: 0.72,
  calendar: 1,
  drive: 0.8,
  contacts: 1,
  git: 1,
};

function cleanLogoStyle(): boolean {
  try {
    return window.localStorage.getItem(LOGO_STYLE_KEY) !== 'original';
  } catch {
    return true; // storage is blocked, so nobody could have opted out
  }
}

let engine: Engine | null = null;
let loading: Promise<Engine> | null = null;
let disabled = false;
const requested = new Set<LivingLogoApp>();
const ready = new Set<LivingLogoApp>();
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** Every mark goes back to its classic canvas, for the rest of the page's life. */
function disable(): void {
  if (disabled) return;
  disabled = true;
  ready.clear();
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function supported(): boolean {
  if (typeof window === 'undefined' || typeof WebGL2RenderingContext === 'undefined') return false;
  try {
    return window.localStorage.getItem(LIVING_LOGOS_OPT_OUT_KEY) !== 'off';
  } catch {
    return true; // storage is blocked, so nobody could have opted out
  }
}

function loadEngine(): Promise<Engine> {
  loading ??= import('../../lib/living-logos/engine').then((mod) => {
    engine = mod;
    mod.onLivingLogoFailure(disable);
    return mod;
  });
  return loading;
}

function request(app: LivingLogoApp): void {
  if (disabled || requested.has(app)) return;
  if (!supported()) {
    disable();
    return;
  }
  requested.add(app);
  loadEngine()
    .then((mod) => mod.prepareLivingLogo(app))
    .then(() => {
      if (disabled) return;
      ready.add(app);
      emit();
    })
    .catch(disable);
}

/**
 * True once `app`'s living logo can mount. Always false on the server and during
 * hydration, so server and client markup match and the classic mark paints first.
 */
export function useLivingLogo(app: LivingLogoApp): boolean {
  const live = useSyncExternalStore(
    subscribe,
    () => !disabled && ready.has(app),
    () => false,
  );
  useEffect(() => {
    request(app);
  }, [app]);
  return live;
}

export interface LivingLogoCanvasProps {
  app: LivingLogoApp;
  /** CSS px edge; the backing store follows the element's box x DPR (max 2). */
  size: number;
  className?: string;
  style?: CSSProperties;
  /** Calendar only: what the card prints. Omit to follow the browser's local date. */
  face?: CalendarFace | null;
  /** Hover, tap and pointer-follow reactions (default true). */
  interactive?: boolean;
  /** Scale inside the box (default 1). */
  zoom?: number;
  /** Receives the engine handle (`notify`, `react`, `setExpression`) while mounted. */
  handleRef?: { current: LivingLogoHandle | null };
}

/** Render only when `useLivingLogo(app)` is true. */
export function LivingLogoCanvas({
  app,
  size,
  className,
  style,
  face = null,
  interactive = true,
  zoom = 1,
  handleRef,
}: LivingLogoCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mountedRef = useRef<LivingLogoHandle | null>(null);
  const faceRef = useRef(face);
  faceRef.current = face;
  const faceKey = face ? `${face.weekday}|${face.day}` : '';

  // A layout effect, so the first frame is painted before the browser shows the
  // swap from the classic canvas (this component never renders on the server).
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !engine) return;
    let handle: LivingLogoHandle;
    try {
      const clean = cleanLogoStyle();
      handle = engine.mountLivingLogo(canvas, {
        app,
        face: faceRef.current,
        zoom,
        interactive,
        calm: clean,
        clean,
        eyeScale: clean ? CLEAN_EYE_SCALE[app] : 1,
      });
    } catch {
      disable();
      return;
    }
    mountedRef.current = handle;
    if (handleRef) handleRef.current = handle;
    return () => {
      handle.dispose();
      mountedRef.current = null;
      if (handleRef && handleRef.current === handle) handleRef.current = null;
    };
  }, [app, zoom, interactive, handleRef]);

  useEffect(() => {
    mountedRef.current?.setFace(faceRef.current);
  }, [faceKey]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={className}
      style={{ width: size, height: size, ...style }}
    />
  );
}