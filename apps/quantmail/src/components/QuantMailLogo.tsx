'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useLiveMark, type MarkFrame } from './marks/useLiveMark';
import { markSquirclePath, strokeMarkBezel } from '../lib/marks/canvas-mark';

interface QuantMailLogoProps {
  size?: number;
  unreadCount?: number;
  showBadge?: boolean;
  className?: string;
  onClick?: () => void;
  /**
   * `false` renders the mark as decoration: no click target, no pointer cursor,
   * no tooltip, and `aria-hidden` so a screen reader reads the wordmark beside
   * it instead of an unnamed graphic. Default `true` for the surfaces where
   * tapping the mark really is the refresh gesture.
   */
  interactive?: boolean;
  /** Accessible name and tooltip when interactive. Defaults to the unread summary. */
  title?: string;
}

/**
 * QuantMail's mark — the **obsidian envelope-emblem**, reforged.
 *
 * The previous incarnation leaned on a 1990s mailbox-friendly white "M" lying on a
 * molten ember plate. That mark worked. It also looked like every other mail
 * client with a mascot and a lava gradient. The brand is *Quant* — precise,
 * instrumented, premium — and a flat white letter on lava is neither of those
 * things. It is friendly. Friendly is the wrong note for a header that has to
 * read at 24px next to the wordmark and announce *capability*, not *personality*.
 *
 * ## The redesign, stated
 *
 * The plate is now **obsidian**: a layered dark surface — `#050609` base,
 * `#0E1116` mid, a faint cool sheen as the room light, and a single ember
 * undertone drawn from below. It is a slab of black glass, not a sticker.
 *
 * The glyph is no longer a letter. It is a **folded envelope-emblem** built from
 * two sharp geometric planes: a back rectangle (the message waiting) and a
 * triangular flap (the act of sending). Both are stroked, not filled, so the
 * neon-amber edge does the work — a thin `#FF8C42 → #FFC700 → #FF8C42` line
 * with a soft outer glow. The geometry reads as *mail* at any size, without
 * looking like a Post-it with a tab.
 *
 * The neon accent is the mark. A conic ember gradient strokes the silhouette at
 * every rendered size, with `shadowBlur` carrying the bloom outward — the same
 * trick a high-end automotive logo uses to look lit from within. The accent
 * *moves*: it rotates slowly with `time`, so the mark is never frozen, and it
 * flares on hover and click. This is what makes the header stop being ignored.
 *
 * Unread is signalled by a hot ember bloom pulsing from the emblem's centre,
 * not by a count painted into the geometry — the badge still carries the
 * exact number for anyone who needs it.
 */

const E = { x: 23, y: 27, w: 54, h: 46 } as const;
const E_MID_X = E.x + E.w / 2;
const E_CY = E.y + E.h / 2;

/**
 * Obsidian plate — dark glass over a single ember undertone. The point of this
 * mark is that the *ember comes from the emblem*, not from the surface, so the
 * plate is intentionally restrained: a `#050609 → #0E1116 → #161A22` diagonal
 * with one cool sheen top-left and one warm bottom-right whisper. The amber
 * undercurrent sits at the far corner only, so the plate never reads as
 * orange — only the emblem's edge does.
 */
function paintObsidian(ctx: CanvasRenderingContext2D, cx: number, cy: number, time: number): void {
  const half = 45;
  const x0 = cx - half;
  const y0 = cy - half;
  const edge = half * 2;

  const base = ctx.createLinearGradient(x0, y0, x0 + edge, y0 + edge);
  base.addColorStop(0, '#161A22');
  base.addColorStop(0.42, '#0A0C11');
  base.addColorStop(1, '#050609');
  ctx.fillStyle = base;
  ctx.fillRect(x0, y0, edge, edge);

  const sx = cx - 16 + Math.cos(time * 0.45) * 6;
  const sy = cy - 20 + Math.sin(time * 0.38) * 5;
  const sheen = ctx.createRadialGradient(sx, sy, 2, sx, sy, 36);
  sheen.addColorStop(0, 'rgba(168, 188, 222, 0.16)');
  sheen.addColorStop(0.5, 'rgba(108, 132, 178, 0.06)');
  sheen.addColorStop(1, 'rgba(80, 104, 150, 0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(x0, y0, edge, edge);

  const wx = cx + 22 + Math.sin(time * 0.33) * 4;
  const wy = cy + 24 + Math.cos(time * 0.51) * 4;
  const warm = ctx.createRadialGradient(wx, wy, 2, wx, wy, 44);
  warm.addColorStop(0, 'rgba(255, 140, 66, 0.14)');
  warm.addColorStop(0.55, 'rgba(198, 88, 30, 0.05)');
  warm.addColorStop(1, 'rgba(255, 140, 66, 0)');
  ctx.fillStyle = warm;
  ctx.fillRect(x0, y0, edge, edge);

  const dome = ctx.createLinearGradient(cx, y0, cx, cy + half);
  dome.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
  dome.addColorStop(0.32, 'rgba(255, 255, 255, 0.015)');
  dome.addColorStop(0.78, 'rgba(0, 0, 0, 0.18)');
  dome.addColorStop(1, 'rgba(0, 0, 0, 0.42)');
  ctx.fillStyle = dome;
  ctx.fillRect(x0, y0, edge, edge);
}

/**
 * The envelope-emblem silhouette: a back panel and a folded flap, drawn as one
 * closed path so a single neon stroke reads as the entire shape. The flap
 * peaks at the top-centre and falls to the lower corners, which is what
 * distinguishes an envelope from a square. Two sharp 4-unit corners on the
 * back, matching the bezel radius, so the emblem feels engineered rather
 * than drawn freehand.
 */
function markEnvelopePath(ctx: CanvasRenderingContext2D): void {
  const { x, y, w, h } = E;
  ctx.beginPath();
  ctx.moveTo(x + 4, y);
  ctx.lineTo(x + w - 4, y);
  ctx.lineTo(x + w - 4, y + h - 4);
  ctx.lineTo(x + 4, y + h - 4);
  ctx.closePath();
}

/** The triangular flap, separate so it can carry a different stroke weight. */
function markFlapPath(ctx: CanvasRenderingContext2D): void {
  const { x, y, w } = E;
  ctx.beginPath();
  ctx.moveTo(x + 4, y);
  ctx.lineTo(x + w / 2, y + E.h * 0.52);
  ctx.lineTo(x + w - 4, y);
  ctx.closePath();
}

/**
 * Neon amber gradient — `#FF5500 → #FFC700 → #FF8C42 → #FF5500`. Two warm
 * anchors and a solar gold core, so the line carries chroma *and* lightness
 * along its length rather than a flat orange. Rotated by `time` so the colour
 * travels around the silhouette.
 */
function emberStrokeGradient(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  time: number,
  intensity = 1,
): CanvasGradient {
  const angle = time * 0.6;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const r = 60;
  const g = ctx.createLinearGradient(cx - dx * r, cy - dy * r, cx + dx * r, cy + dy * r);
  g.addColorStop(0, `rgba(255, 90, 20, ${intensity})`);
  g.addColorStop(0.28, `rgba(255, 160, 50, ${intensity})`);
  g.addColorStop(0.5, `rgba(255, 215, 100, ${intensity})`);
  g.addColorStop(0.72, `rgba(255, 160, 50, ${intensity})`);
  g.addColorStop(1, `rgba(255, 90, 20, ${intensity})`);
  return g;
}

/**
 * The unread bloom — a hot pulse from the emblem's centre. Lifts the plate
 * toward ember rather than toward white, so it reads as *the mark powering
 * up* rather than as a highlight bouncing off it. Width ramps with `unread`,
 * capped at the readable ceiling of ~20.
 */
function paintUnreadBloom(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  intensity: number,
  pulse: number,
): void {
  if (intensity <= 0.01) return;
  const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, 42);
  const a = intensity * pulse;
  g.addColorStop(0, `rgba(255, 200, 120, ${0.55 * a})`);
  g.addColorStop(0.4, `rgba(255, 140, 66, ${0.28 * a})`);
  g.addColorStop(1, 'rgba(255, 120, 50, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(cx - 45, cy - 45, 90, 90);
}

export function QuantMailLogo({
  size = 40,
  unreadCount = 0,
  showBadge = true,
  className = '',
  onClick,
  interactive = true,
  title,
}: QuantMailLogoProps) {
  const router = useRouter();
  const [isHovered, setIsHovered] = useState(false);
  const [isSpinning, setIsSpinning] = useState(false);

  const unreadRef = useRef(unreadCount);
  const flashRef = useRef(0);

  useEffect(() => {
    unreadRef.current = unreadCount;
  }, [unreadCount]);

  const paint = useCallback(({ ctx, cx, cy, time, hover, press, reduced }: MarkFrame) => {
    const unread = unreadRef.current;
    const flash = flashRef.current;
    const pulse = reduced ? 1 : 0.82 + Math.sin(time * 1.9) * 0.18;
    const accent = 1 + hover * 0.25 + flash * 0.6 - press * 0.15;

    ctx.save();
    markSquirclePath(ctx, cx, cy);
    ctx.clip();
    paintObsidian(ctx, cx, cy, time);

    const bloomIntensity = unread > 0 ? Math.min(1, 0.45 + Math.min(unread, 20) / 28) * pulse : 0;
    paintUnreadBloom(ctx, cx, cy, bloomIntensity, 1);

    ctx.save();
    const lift = -(hover * 1.8 - press);
    ctx.translate(cx, cy + lift);
    const grow = 1 + hover * 0.025 - press * 0.04;
    ctx.scale(grow, grow);
    ctx.translate(-50, -50);

    const strokeColor = emberStrokeGradient(ctx, 50, 50, time, accent);

    ctx.save();
    ctx.shadowColor = `rgba(255, 140, 66, ${0.7 * accent})`;
    ctx.shadowBlur = 9 + hover * 6 + unread * 2;
    markEnvelopePath(ctx);
    ctx.lineWidth = 2.4;
    ctx.lineJoin = 'miter';
    ctx.miterLimit = 4;
    ctx.strokeStyle = strokeColor;
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.shadowColor = `rgba(255, 180, 80, ${0.85 * accent})`;
    ctx.shadowBlur = 7 + hover * 5;
    markFlapPath(ctx);
    ctx.lineWidth = 2.4;
    ctx.lineJoin = 'miter';
    ctx.miterLimit = 4;
    ctx.strokeStyle = strokeColor;
    ctx.stroke();
    ctx.restore();

    const accentHi = ctx.createRadialGradient(50, 40, 0.5, 50, 50, 36);
    accentHi.addColorStop(0, `rgba(255, 220, 140, ${0.18 * accent})`);
    accentHi.addColorStop(0.5, `rgba(255, 160, 70, ${0.06 * accent})`);
    accentHi.addColorStop(1, 'rgba(255, 140, 66, 0)');
    ctx.fillStyle = accentHi;
    ctx.fillRect(E.x - 8, E.y - 8, E.w + 16, E.h + 16);

    ctx.restore();

    ctx.save();
    markEnvelopePath(ctx);
    ctx.lineWidth = 0.6;
    ctx.strokeStyle = `rgba(255, 220, 180, ${0.35 * accent})`;
    ctx.stroke();
    ctx.restore();

    ctx.restore();
    strokeMarkBezel(ctx, cx, cy);
  }, []);

  const { canvasRef, pointerProps, repaint } = useLiveMark(paint, size);
  const { onPointerEnter, onPointerLeave } = pointerProps;

  const handlePointerEnter = useCallback(() => {
    onPointerEnter();
    setIsHovered(true);
  }, [onPointerEnter]);

  const handlePointerLeave = useCallback(() => {
    onPointerLeave();
    setIsHovered(false);
  }, [onPointerLeave]);

  const handleClick = useCallback(() => {
    setIsSpinning(true);
    flashRef.current = 1;
    repaint();
    const start = performance.now();
    const decay = () => {
      const t = (performance.now() - start) / 600;
      flashRef.current = Math.max(0, 1 - t);
      repaint();
      if (t < 1) requestAnimationFrame(decay);
    };
    requestAnimationFrame(decay);
    setTimeout(() => setIsSpinning(false), 650);

    if (onClick) {
      onClick();
      return;
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('quant:refresh'));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    router.push('/');
  }, [onClick, repaint, router]);

  const accessibleName =
    title ?? (unreadCount > 0 ? `QuantMail — ${unreadCount} unread` : 'QuantMail — refresh inbox');

  const art = (
    <>
      <motion.span
        className="relative flex items-center justify-center w-full h-full"
        animate={{
          rotate: isSpinning ? 360 : 0,
          scale: isSpinning ? [1, 0.9, 1.1, 1] : isHovered ? 1.06 : 1,
        }}
        transition={{
          rotate: { duration: 0.65, ease: [0.34, 1.56, 0.64, 1] },
          scale: { duration: 0.22, ease: 'easeOut' },
        }}
      >
        <canvas
          ref={canvasRef}
          style={{ width: size, height: size }}
          className="w-full h-full drop-shadow-[0_4px_18px_rgba(255,140,66,0.35)]"
        />
      </motion.span>

      {showBadge && unreadCount > 0 && (
        <span className="absolute -top-1 -right-1.5 z-20 pointer-events-none transition-transform duration-200 group-hover:scale-110">
          <span className="relative inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-[#0A0A0C] bg-[#FF8C42] rounded-full border border-[#0A0A0C] shadow-[0_0_8px_rgba(255,140,66,0.7)]">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        </span>
      )}
    </>
  );

  if (!interactive) {
    return (
      <span
        className={`relative inline-flex items-center justify-center select-none group ${className}`}
        style={{ width: size, height: size }}
      >
        <span aria-hidden="true" style={{ display: 'contents' }}>
          {art}
        </span>
        {showBadge && unreadCount > 0 && (
          <span className="sr-only">{unreadCount > 99 ? 'over 99' : unreadCount} unread</span>
        )}
      </span>
    );
  }

  return (
    <button
      type="button"
      onPointerMove={pointerProps.onPointerMove}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onPointerDown={pointerProps.onPointerDown}
      onPointerUp={pointerProps.onPointerUp}
      onClick={handleClick}
      aria-label={accessibleName}
      title={accessibleName}
      className={`relative inline-flex items-center justify-center cursor-pointer select-none group outline-none rounded-xl focus-visible:ring-2 focus-visible:ring-[#FF8C42] ${className}`}
      style={{ minWidth: Math.max(size, 44), minHeight: Math.max(size, 44) }}
    >
      {art}
    </button>
  );
}

export default QuantMailLogo;
