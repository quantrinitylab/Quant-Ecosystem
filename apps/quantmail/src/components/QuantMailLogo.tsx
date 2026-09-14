'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useLiveMark, type MarkFrame } from './marks/useLiveMark';
import {
  markSquirclePath,
  paintEmberPlate,
  paintGlossSweep,
  paintPlateDome,
  paintSideWall,
  strokeMarkBezel,
} from '../lib/marks/canvas-mark';

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
 * QuantMail's mark — the signature **"M"**, on the family's ember plate.
 *
 * ## The reversal, stated rather than buried
 *
 * The previous pass replaced this glyph with an envelope. That was wrong, and it was
 * wrong in a way worth writing down: the complaint it answered was *"the mail mark is
 * not in our palette"*, and the palette is thirteen gradient stops — `#E52E14`,
 * `#C61E08`, `#7F0A00`, `#FF5500`, `#FF3300`, `#D62000`, `#FFC700`, `#FF8A00`,
 * `#FF4500` over a `#060709` base, six of them plainly red against a system that has
 * no red in it. **That measurement stands and the fix stands**: the plate is
 * `paintEmberPlate`, which was itself derived from this file's own lava, so the drama
 * survives in the right hues. Nothing about it required a new glyph.
 *
 * The glyph went anyway, on the theory that an M with eyes was "a second mascot
 * competing with Quanty". Overturned. Two dark pupils on a white letter are not a
 * thirty-five-expression face; they are the one thing that made this mark *the*
 * QuantMail mark rather than a stock envelope, and an envelope is the single most
 * generic shape in the category — every mail client on earth already owns it.
 *
 * ## What "more advanced" means here, concretely
 *
 * The restored M is the original 54x44 bezier, unit for unit. What it did not have is
 * material: it was `ctx.fillStyle = '#FFFFFF'; ctx.fill()`, a flat white sticker with a
 * drop shadow. A white plane lying on molten metal is not flat white — so it now gets
 * the same treatment as every other object in the suite:
 *
 * - `paintSideWall` under it, warm rather than grey, because what lights the underside
 *   of a white card on an ember plate is the plate.
 * - a body ramp lit from the top left, and a **bounce band** along the bottom inside
 *   edge, which is the plate's own light coming back up into the paper.
 * - **occlusion in the notch.** The valley between the two peaks is a concave crease,
 *   and a crease that light cannot reach is darker. Without it the two shoulders read
 *   as one blob at 24px; it is the same law that gave the calendar its back sheet.
 * - `paintGlossSweep` clipped to the glyph, and an edge that catches white along the
 *   top-left pair of sides and falls to a warm seam along the bottom-right pair.
 *
 * The eyes are rebuilt rather than restored. The original drew three separate cases —
 * open pupils, a blink as two straight lines, a wink as a stroked arc — so the mark
 * *popped* between shapes. One squashing ellipse covers open and shut, which is what a
 * round eye actually does, and the blink is derived from `time` instead of from a
 * `setTimeout` chain, so it costs no timers and desynchronises for free across the
 * eight places this mounts (`useLiveMark` seeds its clock per instance). The pupils
 * still track the pointer, still widen past five unread, still wink on click, and the
 * blush is a gradient now rather than two hard 2.6-unit discs.
 *
 * Unread is light rather than a number: a hot halo behind the shoulders and a bloom in
 * the notch, so the letter reads as lit from within at 20px where a numeral cannot
 * resolve. The badge still carries the exact count for anyone who needs it.
 */

/**
 * The M, in the family's 100-unit buffer — the original's `mw` 54 by `mh` 44, and the
 * original's two-unit downward bias, which is why `y` is 30 and not 28. A letter's
 * optical centre sits below its geometric one.
 */
const M = { x: 23, y: 30, w: 54, h: 44 } as const;
const M_MID_X = M.x + M.w / 2;
/** The floor of the valley between the peaks. The original's `y0 + 17`. */
const M_NOTCH_Y = M.y + 17;

/**
 * The silhouette, kept bezier for bezier from the mark this restores.
 *
 * Left wall up, left ear over the top, down into the centre valley, back up over the
 * right ear, down the right wall, and a flat foot with two 7-unit corners. The ears are
 * what made people read it as a face, and the flat foot is what keeps it a letter.
 */
function markMPath(ctx: CanvasRenderingContext2D): void {
  const { x, y, w, h } = M;
  ctx.beginPath();
  ctx.moveTo(x + 7, y + h);
  ctx.arcTo(x, y + h, x, y + h - 7, 7);
  ctx.lineTo(x, y + 12);
  ctx.bezierCurveTo(x, y + 4, x + 4, y, x + 9, y);
  ctx.bezierCurveTo(x + 15, y + 2, x + 21, y + 17, x + 27, y + 17);
  ctx.bezierCurveTo(x + 33, y + 17, x + 39, y + 2, x + 45, y);
  ctx.bezierCurveTo(x + 50, y, x + w, y + 4, x + w, y + 12);
  ctx.lineTo(x + w, y + h - 7);
  ctx.arcTo(x + w, y + h, x + w - 7, y + h, 7);
  ctx.closePath();
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

  /*
   * Both of these are read by the painter and never by React, so they are refs.
   * `useLiveMark` reassigns `paintRef.current = paint` on every render, which is what
   * makes a `[]`-dep painter safe to read live values out of — the closure is replaced
   * before the next frame, so there is no stale-capture window.
   */
  const unreadRef = useRef(unreadCount);

  useEffect(() => {
    unreadRef.current = unreadCount;
  }, [unreadCount]);

  const paint = useCallback(
    ({ ctx, cx, cy, time, tiltX, tiltY, hover, press, reduced }: MarkFrame) => {
      const unread = unreadRef.current;
      const pulse = reduced ? 1 : 0.88 + Math.sin(time * 1.6) * 0.12;

      ctx.save();
      markSquirclePath(ctx, cx, cy);
      ctx.clip();
      paintEmberPlate(ctx, cx, cy, time, tiltX, tiltY);
      paintPlateDome(ctx, cx, cy);

      /*
       * The letter travels as one group: the original's `tilt * 2.5` parallax against
       * the lava, plus the family's hover lift and press squash. Everything below is
       * written in absolute buffer units, which is why the group ends on `-50, -50`.
       */
      ctx.save();
      ctx.translate(cx + tiltX * 2.5, cy + tiltY * 2.5 - (hover * 1.4 - press));
      const grow = 1 + hover * 0.02 - press * 0.03;
      ctx.scale(grow, grow);
      ctx.translate(-50, -50);

      /*
       * Unread, part one: a halo *behind* the glyph, and near-white rather than ember.
       * Ember light on an ember plate is invisible — the only channel left is luminance,
       * so the halo has to lift the plate towards white to register at all.
       */
      if (unread > 0) {
        const heat = Math.min(1, 0.55 + Math.min(unread, 20) / 40) * pulse;
        const halo = ctx.createRadialGradient(M_MID_X, M_NOTCH_Y, 2, M_MID_X, M_NOTCH_Y, 34);
        halo.addColorStop(0, `rgba(255, 238, 216, ${0.5 * heat})`);
        halo.addColorStop(0.45, `rgba(255, 192, 142, ${0.26 * heat})`);
        halo.addColorStop(1, 'rgba(255, 172, 112, 0)');
        ctx.fillStyle = halo;
        ctx.fillRect(M.x - 24, M.y - 24, M.w + 48, M.h + 48);
      }

      /* The paper has thickness, and what lights its underside is the plate. */
      paintSideWall(ctx, markMPath, 2.8 - press * 2, '#C4611F', '#5E230A', M.y, M.y + M.h);

      ctx.save();
      ctx.shadowColor = 'rgba(46, 16, 2, 0.55)';
      ctx.shadowBlur = 7 + hover * 4;
      ctx.shadowOffsetY = 2.4 + hover * 1.2;
      markMPath(ctx);
      const body = ctx.createLinearGradient(M.x, M.y, M.x + M.w, M.y + M.h);
      body.addColorStop(0, '#FFFFFF');
      body.addColorStop(0.46, '#F7F8FB');
      body.addColorStop(1, '#E3E6ED');
      ctx.fillStyle = body;
      ctx.fill();
      ctx.restore();

      ctx.save();
      markMPath(ctx);
      ctx.clip();

      /* The plate's own light, coming back up into the bottom edge of the paper. */
      const bounce = ctx.createLinearGradient(0, M.y + M.h - 15, 0, M.y + M.h);
      bounce.addColorStop(0, 'rgba(255, 150, 80, 0)');
      bounce.addColorStop(1, `rgba(255, 150, 80, ${0.3 + hover * 0.06})`);
      ctx.fillStyle = bounce;
      ctx.fillRect(M.x, M.y + M.h - 15, M.w, 15);

      /*
       * The valley is a concave crease, and a crease is darker than the plane it cuts.
       * Without this the two peaks merge into one shoulder at 24px — the same law that
       * gave the calendar mark its back sheet.
       */
      const ao = ctx.createRadialGradient(M_MID_X, M_NOTCH_Y, 1, M_MID_X, M_NOTCH_Y, 15);
      ao.addColorStop(0, 'rgba(120, 58, 20, 0.3)');
      ao.addColorStop(0.6, 'rgba(120, 58, 20, 0.1)');
      ao.addColorStop(1, 'rgba(120, 58, 20, 0)');
      ctx.fillStyle = ao;
      ctx.fillRect(M.x, M.y, M.w, 30);

      /* Unread, part two: warmth rising out of the notch, inside the paper. */
      if (unread > 0) {
        const heat = Math.min(1, 0.6 + Math.min(unread, 20) / 50) * pulse;
        const by = M_NOTCH_Y + 3;
        const bloom = ctx.createRadialGradient(M_MID_X, by, 1, M_MID_X, by, 22);
        bloom.addColorStop(0, `rgba(255, 140, 66, ${0.5 * heat})`);
        bloom.addColorStop(0.55, `rgba(255, 155, 90, ${0.2 * heat})`);
        bloom.addColorStop(1, 'rgba(255, 155, 90, 0)');
        ctx.fillStyle = bloom;
        ctx.fillRect(M.x, M.y, M.w, M.h);
      }

      const sweep = reduced ? 0.34 : (time * 0.07 + hover * 0.5) % 1;
      paintGlossSweep(ctx, M.x, M.y, M.w, M.h, sweep, 0.1 + hover * 0.12);

      /*
       * Clean architectural M glyph: embossed frosted-glass letterform with unread inner bloom,
       * specular gloss sweep, and dimensional edge highlights (zero cartoon eyes or pupils).
       */
      ctx.restore();

      /*
       * The edge catches white where the light is (top left) and falls to a warm seam
       * where the plate is (bottom right). One stroke, two facts.
       */
      markMPath(ctx);
      ctx.lineWidth = 1.1;
      const edge = ctx.createLinearGradient(M.x, M.y, M.x + M.w, M.y + M.h);
      edge.addColorStop(0, 'rgba(255, 252, 248, 0.9)');
      edge.addColorStop(0.45, 'rgba(255, 220, 186, 0.3)');
      edge.addColorStop(1, 'rgba(140, 60, 16, 0.45)');
      ctx.strokeStyle = edge;
      ctx.stroke();

      ctx.restore();
      ctx.restore();
      strokeMarkBezel(ctx, cx, cy);
    },
    [],
  );

  const { canvasRef, pointerProps, repaint } = useLiveMark(paint, size);
  const { onPointerEnter, onPointerLeave } = pointerProps;

  // `useLiveMark` owns the canvas-side hover easing; `isHovered` drives the DOM-side
  // scale on the wrapper, so both handlers have to run.
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
    repaint();
    setTimeout(() => {
      setIsSpinning(false);
      repaint();
    }, 650);

    if (onClick) {
      // The caller owns the gesture. Dispatching `quant:refresh` here as well is how
      // the shell header ended up firing it three times per click: once here, once
      // inside the handler passed in, and once more when the click bubbled to the
      // wrapper that carried the same handler.
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
          scale: isSpinning ? [1, 0.88, 1.12, 1] : isHovered ? 1.08 : 1,
        }}
        transition={{
          rotate: { duration: 0.65, ease: [0.34, 1.56, 0.64, 1] },
          scale: { duration: 0.22, ease: 'easeOut' },
        }}
      >
        <canvas
          ref={canvasRef}
          style={{ width: size, height: size }}
          /*
           * A neutral shadow, not a coloured one. This was
           * `drop-shadow(0 4px 16px rgba(255,85,0,0.45))` — a saturated orange at
           * 45% that isn't in the palette and, on the near-black canvas, read as a
           * halo around the mark rather than as elevation. The mark is drawn in
           * brand orange already; ringing it in more orange is the exact look the
           * product is defined against.
           */
          className="w-full h-full drop-shadow-[0_4px_16px_rgba(0,0,0,0.6)]"
        />
      </motion.span>

      {showBadge && unreadCount > 0 && (
        <span className="absolute -top-1 -right-1.5 z-20 pointer-events-none transition-transform duration-200 group-hover:scale-110">
          <span className="relative inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-[#111111] bg-[#FF8C42] rounded-full border border-[#090A0C] shadow-sm">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        </span>
      )}
    </>
  );

  /*
   * Decorative mode is the reason this branch exists. `interactive` and `title` were
   * declared in the props and then never read, so every caller that asked for a
   * decorative mark got a live one: `BrandLoader`'s splash mark navigated to `/`
   * mid-load, the auth panel's lockup bounced /login → / → /login, and
   * `QuantrinityMark` showed "QuantMail — refresh inbox" on a Quantrinity mark. A `div`
   * with `onClick` is also unreachable by keyboard, so the live branch is a real
   * `button` with a name and a focus ring.
   *
   * `aria-hidden` sits on a `display: contents` inner span rather than on the wrapper.
   * On the wrapper it silenced the visible unread badge with it — `AppShell` mounts the
   * mark decoratively *and* passes a real count, so the number was painted on screen and
   * announced nowhere. `display: contents` keeps the wrapper as the containing block for
   * the absolutely positioned pill while letting an `sr-only` sibling carry the count.
   */
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
      // The mark is 36–42px on most surfaces, which is under the 44px floor, and the box
      // is sized in px rather than by a class — so the floor has to be inline too. `max`
      // keeps the 96px empty-state mark from shrinking.
      style={{ minWidth: Math.max(size, 44), minHeight: Math.max(size, 44) }}
    >
      {art}
    </button>
  );
}

export default QuantMailLogo;
