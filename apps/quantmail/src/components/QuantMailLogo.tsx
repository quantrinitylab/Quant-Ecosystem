'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useLiveMark, type MarkFrame } from './marks/useLiveMark';
import {
  MARK_COLORS,
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
 * QuantMail's mark — a white envelope with a peach flap, on the family's *ember* plate.
 *
 * ## What this was, and why it changed
 *
 * This file used to paint "Solar Gold -> Fire Orange -> Crimson -> Obsidian": four
 * orbiting radial gradients over `#060709`, plus a 54x44 "M mascot" glyph with two
 * pupils that tracked the cursor, a blink cycle and blush. It was the most ambitious
 * mark in the set and it is the reason `useLiveMark` exists at all — that hook's own
 * doc comment credits this file for the shape of it. Two things about it were wrong,
 * and the second only became visible once all six marks were put in one row.
 *
 * **The colours were not ours.** Thirteen gradient stops and not one design-system
 * value: `#E52E14`, `#C61E08`, `#7F0A00`, `#FF3300`, `#D62000` and `#FF4500` are red,
 * `#FFC700` is yellow. The palette is `#FF8C42` / `#FF9B5A` / `#E8752F`, and the
 * system says no red. Beside Calendar, Contacts and Drive the flagship's own icon was
 * the one plate in the row burning to crimson at its corners — a different colour
 * family, in every page header. The plate is now `paintEmberPlate`, which was itself
 * derived from this file's lava (an ember floor under four orbiting layers, three hot
 * and one cold) and is the same molten construction in the right hues. The drama is
 * kept. The crimson is not.
 *
 * **The glyph was a second mascot.** It was drawn as an "M" and read as an animal
 * face: two ear peaks, a centre notch, two dark eyes following the pointer, blush on
 * the cheeks. That is a mascot, and this product already has one — Quanty, with a
 * thirty-five-expression face — so the cost of the second was paid by the icon whose
 * only job is to say *mail*. It now says mail. The old intent survives as geometry
 * rather than as a face: a flap creased to the centre is a wide M.
 *
 * Everything else is the shared rig, which is the point of having one — `paintEmberPlate`,
 * `paintPlateDome`, `paintSideWall` for the envelope's thickness, `paintGlossSweep` on
 * hover, `strokeMarkBezel` last and outside the clip. Moving onto `useLiveMark` also
 * buys three things the hand-rolled loop never had: `prefers-reduced-motion`, which it
 * ignored outright; a loop that stops off-screen and on a hidden tab; and frame-rate
 * independence, since its fixed `time += 0.024` ran at double speed on a 120Hz panel.
 */

/**
 * The envelope, in the family's 100-unit buffer.
 *
 * 54 x 38 is a C6 ratio, and the plate left around it is deliberate: 18 units either
 * side, 26 below. QuantGit's graph proved what happens without that margin — ink run
 * to the glyph's own edges reads as a smudge at 36px, because the eye needs plate
 * between the shape and the rim to resolve the shape against.
 */
const ENV = { x: 23, y: 32, w: 54, h: 38, r: 6 } as const;

/**
 * Where the two creases meet: 21 of the envelope's 38 units, so the flap covers 56% of
 * the face. That is where a real flap folds. Shallower reads as a line ruled across a
 * box; deeper and the envelope has no front left to be an envelope with.
 */
const CREASE_Y = 53;

const ENV_MID_X = ENV.x + ENV.w / 2;

function envelopePath(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath();
  ctx.roundRect(ENV.x, ENV.y, ENV.w, ENV.h, ENV.r);
}

/**
 * The flap, overshooting the envelope by two units on three sides so the *clip* supplies
 * the rounded corners. Building the corner arcs into this path as well would be the same
 * geometry written twice, and the two copies would drift the first time `ENV.r` moved.
 */
function flapPath(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath();
  ctx.moveTo(ENV.x - 2, ENV.y - 2);
  ctx.lineTo(ENV_MID_X, CREASE_Y);
  ctx.lineTo(ENV.x + ENV.w + 2, ENV.y - 2);
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

  // Read by the painter, so a changing count never rebuilds it.
  const unreadRef = useRef(unreadCount);
  useEffect(() => {
    unreadRef.current = unreadCount;
  }, [unreadCount]);

  const paint = useCallback(
    ({ ctx, cx, cy, time, tiltX, tiltY, hover, press, reduced }: MarkFrame) => {
      const t = reduced ? 0 : time;

      ctx.save();
      markSquirclePath(ctx, cx, cy);
      ctx.clip();
      paintEmberPlate(ctx, cx, cy, t, tiltX, tiltY);
      paintPlateDome(ctx, cx, cy);

      // ---- the envelope: one transform, so the whole card parallaxes as a unit ----
      const lift = hover * 1.4 - press * 1;
      ctx.translate(cx + tiltX * 2.6, cy + tiltY * 2.6 - lift);
      const scale = 1 + hover * 0.02 - press * 0.03;
      ctx.scale(scale, scale);
      ctx.translate(-cx, -cy);

      // Its thickness. Warm, because what lights the underside of a white card lying on
      // an orange plate is the plate.
      paintSideWall(ctx, envelopePath, 2.6 - press * 2, '#C4611F', '#5E230A', ENV.y, ENV.y + ENV.h);

      ctx.save();
      ctx.shadowColor = 'rgba(46, 16, 2, 0.55)';
      ctx.shadowBlur = 7 + hover * 4;
      ctx.shadowOffsetY = 2.4 + hover * 1.2;
      envelopePath(ctx);
      const body = ctx.createLinearGradient(ENV.x, ENV.y, ENV.x + ENV.w, ENV.y + ENV.h);
      body.addColorStop(0, '#FFFFFF');
      body.addColorStop(0.46, '#F6F7FA');
      body.addColorStop(1, '#DFE2E9');
      ctx.fillStyle = body;
      ctx.fill();
      ctx.restore();

      // Everything printed on the envelope is clipped to it.
      ctx.save();
      envelopePath(ctx);
      ctx.clip();

      // Unread, as light inside the envelope rather than as a number on it. The badge
      // carries the count; this carries the fact, and it still reads at 20px where a
      // numeral cannot. The old mark spent this on 0.7 of a unit of extra pupil radius.
      if (unreadRef.current > 0) {
        const inner = ctx.createRadialGradient(
          ENV_MID_X,
          CREASE_Y + 3,
          1,
          ENV_MID_X,
          CREASE_Y + 3,
          20,
        );
        inner.addColorStop(0, 'rgba(255, 140, 66, 0.55)');
        inner.addColorStop(0.55, 'rgba(255, 155, 90, 0.22)');
        inner.addColorStop(1, 'rgba(255, 140, 66, 0)');
        ctx.fillStyle = inner;
        ctx.fillRect(ENV.x, ENV.y, ENV.w, ENV.h);
      }

      // The flap. Peach rather than grey for two reasons: a white plane tilted towards an
      // ember plate picks the plate up, and two near-whites touching read as one smear at
      // 24px however clean the fold is — the law that decided the calendar's back sheet
      // and QuantGit's dark under-stroke. It also keeps the whole mark inside the palette.
      flapPath(ctx);
      const flap = ctx.createLinearGradient(ENV.x, ENV.y, ENV.x + ENV.w * 0.6, CREASE_Y);
      flap.addColorStop(0, '#FFE7CF');
      flap.addColorStop(0.5, MARK_COLORS.peach);
      flap.addColorStop(1, '#F0B583');
      ctx.fillStyle = flap;
      ctx.fill();

      // The crease, as a hairline over a boundary that already exists in value. A stroke
      // on its own would not survive: at 20px one buffer unit is a third of a device
      // pixel, so the fold has to be a change of fill first and a line second.
      ctx.beginPath();
      ctx.moveTo(ENV.x - 2, ENV.y - 2);
      ctx.lineTo(ENV_MID_X, CREASE_Y);
      ctx.lineTo(ENV.x + ENV.w + 2, ENV.y - 2);
      ctx.lineWidth = 1.5;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(122, 58, 18, 0.5)';
      ctx.stroke();

      const sweep = reduced ? 0.34 : (t * 0.07 + hover * 0.5) % 1;
      paintGlossSweep(ctx, ENV.x, ENV.y, ENV.w, ENV.h, sweep, 0.1 + hover * 0.12);
      ctx.restore(); // envelope clip

      // The envelope's own edge, over the printing: caught light along the top-left pair
      // of sides, falling to a warm seam along the bottom-right pair.
      envelopePath(ctx);
      ctx.lineWidth = 1.1;
      const edge = ctx.createLinearGradient(ENV.x, ENV.y, ENV.x + ENV.w, ENV.y + ENV.h);
      edge.addColorStop(0, 'rgba(255, 252, 248, 0.9)');
      edge.addColorStop(0.45, 'rgba(255, 220, 186, 0.3)');
      edge.addColorStop(1, 'rgba(140, 60, 16, 0.45)');
      ctx.strokeStyle = edge;
      ctx.stroke();

      ctx.restore(); // plate clip + group transform

      // The bezel last and outside the clip, so the highlight sits over the envelope's
      // corners rather than under them — the ordering the whole family relies on.
      strokeMarkBezel(ctx, cx, cy);
    },
    [],
  );

  const { canvasRef, pointerProps } = useLiveMark(paint, size);
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

  // One-Tap Instant Refresh & Inbox Navigation
  const handleClick = useCallback(() => {
    setIsSpinning(true);
    setTimeout(() => setIsSpinning(false), 650);

    // Dispatch global refresh event
    if (onClick) {
      // The caller owns the gesture. Dispatching `quant:refresh` here as well
      // is how the shell header ended up firing it three times per click:
      // once here, once inside the handler passed in, and once more when the
      // click bubbled to the wrapper that carried the same handler.
      onClick();
      return;
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('quant:refresh'));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    router.push('/');
  }, [onClick, router]);

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
   * Decorative mode is the reason this branch exists. `interactive` and `title`
   * were declared in the props and then never read, so every caller that asked
   * for a decorative mark got a live one: `BrandLoader`'s splash mark navigated
   * to `/` mid-load, the auth panel's lockup bounced /login → / → /login, and
   * `QuantrinityMark` showed "QuantMail — Click to refresh" on a Quantrinity
   * mark. A `div` with `onClick` is also unreachable by keyboard, so the live
   * branch is a real `button` with a name and a focus ring.
   */
  if (!interactive) {
    return (
      <span
        className={`relative inline-flex items-center justify-center select-none group ${className}`}
        style={{ width: size, height: size }}
        {...pointerProps}
      >
        {/*
          `aria-hidden` sits on the art rather than on this wrapper so the unread pill
          is not silenced with it. `AppShell` mounts this decoratively *and* passes a
          real `unreadCount`, so the count was painted on screen and announced nowhere —
          a visible number no assistive tech could reach. `display: contents` keeps the
          wrapper as the containing block for the absolutely-positioned badge.
        */}
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
      {...pointerProps}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onClick={handleClick}
      aria-label={accessibleName}
      title={accessibleName}
      className={`relative inline-flex items-center justify-center cursor-pointer select-none group outline-none rounded-xl focus-visible:ring-2 focus-visible:ring-[#FF8C42] ${className}`}
      // The mark is 36–42px on most surfaces, which is under the 44px floor, and
      // the box is sized in px rather than by a class — so the floor has to be
      // inline too. `max` keeps the 96px empty-state mark from shrinking.
      style={{ minWidth: Math.max(size, 44), minHeight: Math.max(size, 44) }}
    >
      {art}
    </button>
  );
}

export default QuantMailLogo;
