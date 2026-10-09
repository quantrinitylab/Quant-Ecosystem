'use client';

import { useCallback } from 'react';
import type { QuantLogoProps } from './AppMark';
import { useLiveMark, type MarkFrame } from './marks/useLiveMark';
import { markSquirclePath } from '../lib/marks/canvas-mark';

/**
 * QuantContacts' mark — two people, one in front of the other, in amber.
 *
 * CLEAN PASS (2026-10-09, user's explicit direction): the old ember-plate
 * version carried rim lights, gloss sweeps, hover glows and a lit arc — all
 * removed. What remains is the character: two overlapping figures in the
 * locked Contacts accent (amber #F59E0B family) on a plain dark plate.
 *
 * - Back figure: light amber (#FCD34D → #F59E0B), smaller, higher, right.
 * - Front figure: deep amber (#D97706 → #92400E), larger, left.
 * - A thin dark stroke separates the front figure from the back one — plain
 *   occlusion, no light.
 * - Motion is the family's quiet set: pointer parallax (two depths), a
 *   fractional breathe, hover lift, press dip. No glow anywhere.
 *
 * Same component interface as before (QuantLogoProps, default export), so the
 * app switcher keeps working unchanged.
 */

const AMBER = {
  plate: '#0D0D10',
  backTop: '#FCD34D',
  backBottom: '#F59E0B',
  frontTop: '#D97706',
  frontBottom: '#92400E',
  separator: 'rgba(13, 13, 16, 0.65)',
} as const;

interface Figure {
  cx: number;
  headCy: number;
  headR: number;
  shCy: number;
  shRx: number;
  shRy: number;
}

/** The figure in front: larger, left. Shoulders are a wide, shallow ellipse. */
const FRONT: Figure = { cx: 41, headCy: 41, headR: 12, shCy: 76, shRx: 23, shRy: 16 };
/** The figure behind: smaller, higher and further right — perspective does the work. */
const BACK: Figure = { cx: 69, headCy: 36, headR: 9.5, shCy: 70, shRx: 18, shRy: 18 };

/** The torso runs off the bottom of the plate — a body never ends in mid-air. */
const BODY_BOTTOM = 100;

function figurePath(ctx: CanvasRenderingContext2D, f: Figure, dx = 0): void {
  const x = f.cx + dx;
  ctx.beginPath();
  ctx.arc(x, f.headCy, f.headR, 0, Math.PI * 2);
  // Down the left side to the crop, over the shoulders, down the right.
  ctx.moveTo(x - f.shRx - 3, BODY_BOTTOM);
  ctx.lineTo(x - f.shRx, f.shCy);
  ctx.ellipse(x, f.shCy, f.shRx, f.shRy, 0, Math.PI, 0);
  ctx.lineTo(x + f.shRx + 3, BODY_BOTTOM);
  ctx.closePath();
}

function paintFigure(
  ctx: CanvasRenderingContext2D,
  f: Figure,
  top: string,
  bottom: string,
  dx: number,
): void {
  figurePath(ctx, f, dx);
  const g = ctx.createLinearGradient(f.cx + dx - 20, 28, f.cx + dx + 20, 98);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fill();
}

export function QuantContactsLogo({
  size = 32,
  className = '',
  title = 'QuantContacts',
}: QuantLogoProps) {
  const paint = useCallback(
    ({ ctx, cx, cy, time, tiltX, tiltY, hover, press, reduced }: MarkFrame) => {
      const t = reduced ? 0 : time;
      const breathe = reduced ? 0 : Math.sin(t * 0.52);

      ctx.save();
      markSquirclePath(ctx, cx, cy);
      ctx.clip();

      // Plain dark plate — no ember, no dome, no bezel.
      ctx.fillStyle = AMBER.plate;
      ctx.fillRect(cx - 50, cy - 50, 100, 100);

      // The figure behind: shallow parallax, leans in a touch on hover.
      ctx.save();
      ctx.translate(tiltX * 1.3, tiltY * 1.3 + breathe * 0.2);
      paintFigure(ctx, BACK, AMBER.backTop, AMBER.backBottom, -hover * 2.4);
      ctx.restore();

      // The figure in front: deeper parallax, lifts on hover, dips on press.
      const lift = hover * 1.6 - press * 1;
      ctx.save();
      ctx.translate(tiltX * 3, tiltY * 3 - lift);
      ctx.translate(FRONT.cx, 58);
      const scale = 1 + breathe * 0.005 + hover * 0.02 - press * 0.032;
      ctx.scale(scale, scale);
      ctx.translate(-FRONT.cx, -58);
      // Dark separator first, slightly wider — plain occlusion between the two.
      figurePath(ctx, FRONT);
      ctx.lineWidth = 3;
      ctx.strokeStyle = AMBER.separator;
      ctx.stroke();
      paintFigure(ctx, FRONT, AMBER.frontTop, AMBER.frontBottom, 0);
      ctx.restore();

      ctx.restore(); // plate clip
    },
    [],
  );

  const { canvasRef, pointerProps } = useLiveMark(paint, size);

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

export default QuantContactsLogo;
