'use client';

import { useCallback } from 'react';
import type { QuantLogoProps } from './AppMark';
import { useLiveMark, type MarkFrame } from './marks/useLiveMark';
import {
  markSquirclePath,
  paintEmberPlate,
  paintGlossSweep,
  paintPlateDome,
  paintSideWall,
  strokeMarkBezel,
} from '../lib/marks/canvas-mark';

/**
 * QuantDrive's mark — a stack of sheets with the front one's corner peeled up, on
 * the family's live ember plate.
 *
 * What it replaced was a flat tabbed folder with an upload arrow stamped into it.
 * The arrow was doing honest work — it said *upload*, not just *container* — but a
 * folder is what every drive product draws, and the reference sheet for this mark is
 * a document stack with a curled corner, which is both more specific and the only
 * shape in the set that can genuinely show a third dimension. So: Canvas 2D on one
 * `requestAnimationFrame` loop, the family's 100-unit buffer, 45/22 squircle and 1.4
 * rim (see `useLiveMark` and `canvas-mark`).
 *
 * Paper is why this mark reads instantly beside its siblings. Calendar puts an
 * obsidian pad on the ember plate and Contacts puts an obsidian figure on it; Drive
 * puts white on it. At 24px in a sidebar that value flip is the whole recognition —
 * far more reliable than any difference in silhouette at that size.
 *
 * Two deviations from the reference, both deliberate. Its sheets are white and lilac
 * and its curl runs orange → yellow → pink; the design system has one accent, so the
 * lilac becomes the cool grey the UI already uses for muted type and the curl stays
 * inside the ember ramp. Importing two new hues to match a moodboard would cost more
 * than it buys — a mark has to sit next to the product's real chrome, not the sheet
 * it was drawn on.
 *
 * The curl is the animation, not decoration on top of one: it breathes a couple of
 * units open and shut, and hover peels it further, which is the one gesture this
 * icon could mean.
 */

/** The front sheet, in buffer units. Portrait, because paper is. */
const SHEET = { x: 27, y: 22, r: 4, right: 73, bottom: 80 } as const;

/**
 * The fold, as a function of how far the corner has peeled. `peel` is 1 at rest; the
 * fold meets the right edge `28 * peel` above the corner and the bottom edge
 * `25 * peel` to its left, so hover grows the fold instead of bulging a flap over the
 * sheet. That is what peeling actually does, and an earlier pass that bulged a
 * quadratic lip 9 units across the page read as an orange lump in the corner.
 */
const foldAt = (peel: number) => ({
  y: SHEET.bottom - 28 * peel,
  x: SHEET.right - 25 * peel,
});

/** The sheet with its bottom-right corner cut off along the fold. */
function sheetPath(ctx: CanvasRenderingContext2D, foldX: number, foldY: number): void {
  const { x, y, r, right, bottom } = SHEET;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(right - r, y);
  ctx.arcTo(right, y, right, y + r, r);
  ctx.lineTo(right, foldY);
  ctx.lineTo(foldX, bottom);
  ctx.lineTo(x + r, bottom);
  ctx.arcTo(x, bottom, x, bottom - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

/** A plain rounded sheet, for the two behind the front one. `grow` pushes it outward. */
function backSheetPath(ctx: CanvasRenderingContext2D, grow: number): void {
  ctx.beginPath();
  ctx.roundRect(
    SHEET.x - grow,
    SHEET.y - grow,
    SHEET.right - SHEET.x + grow * 2,
    SHEET.bottom - SHEET.y + grow * 2,
    SHEET.r + grow,
  );
}

export function QuantDriveLogo({
  size = 32,
  className = '',
  title = 'QuantDrive',
}: QuantLogoProps) {
  const paint = useCallback(
    ({ ctx, cx, cy, time, tiltX, tiltY, hover, press, reduced }: MarkFrame) => {
      const t = reduced ? 0 : time;
      const breathe = reduced ? 0 : Math.sin(t * 0.6);

      ctx.save();
      markSquirclePath(ctx, cx, cy);
      ctx.clip();
      paintEmberPlate(ctx, cx, cy, t, tiltX, tiltY);
      paintPlateDome(ctx, cx, cy);

      if (hover > 0.01) {
        const glow = ctx.createRadialGradient(50, 58, 4, 50, 58, 46);
        glow.addColorStop(0, `rgba(255, 232, 204, ${0.26 * hover})`);
        glow.addColorStop(1, 'rgba(255, 176, 95, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(cx - 45, cy - 45, 90, 90);
      }

      // ---- the stack: one transform for all three sheets ----
      const lift = hover * 1.5 - press * 1;
      ctx.translate(cx + tiltX * 2.4, cy + tiltY * 2.4 - lift);
      const scale = 1 + breathe * 0.004 + hover * 0.018 - press * 0.03;
      ctx.scale(scale, scale);
      ctx.translate(-cx, -cy);

      // ---- the two behind, rotated apart so the stack has a count ----
      // They are the same size as the front sheet, or a hair larger — never smaller. A
      // first pass inset them by 3 and 5.5 units and they vanished behind the front
      // sheet entirely, leaving a stack of one. Rotation is what makes a stack; a size
      // difference just hides the evidence.
      const leaves: Array<[number, number, string, string]> = [
        [-0.16, 1.2, '#8A8F9C', '#5F6370'],
        [0.11, 0.4, '#C6C9D4', '#9A9EAC'],
      ];
      for (const [angle, grow, top, base] of leaves) {
        ctx.save();
        ctx.translate(50, 51);
        ctx.rotate(angle + breathe * 0.008);
        ctx.translate(-50, -51);
        ctx.shadowColor = 'rgba(0, 0, 0, 0.42)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetY = 2;
        backSheetPath(ctx, grow);
        const g = ctx.createLinearGradient(SHEET.x, SHEET.y, SHEET.right, SHEET.bottom);
        g.addColorStop(0, top);
        g.addColorStop(1, base);
        ctx.fillStyle = g;
        ctx.fill();
        ctx.restore();
      }

      // ---- the front sheet ----
      const peel = 1 + breathe * 0.035 + hover * 0.17 - press * 0.09;
      const fold = foldAt(peel);
      // Paper has a thickness too, and on a stack it is the one edge you actually see.
      // Short — 1.6 units, not the pad's 3 — because a sheet is a sheet.
      paintSideWall(
        ctx,
        (c) => sheetPath(c, fold.x, fold.y),
        1.6 - press * 1.1,
        '#BDBDC8',
        '#63636E',
        SHEET.y,
        SHEET.bottom,
      );
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
      ctx.shadowBlur = 5;
      ctx.shadowOffsetY = 2.5;
      sheetPath(ctx, fold.x, fold.y);
      const paper = ctx.createLinearGradient(SHEET.x, SHEET.y, SHEET.right, SHEET.bottom);
      paper.addColorStop(0, '#FFFFFF');
      paper.addColorStop(0.55, '#F6F5F8');
      paper.addColorStop(1, '#DEDEE6');
      ctx.fillStyle = paper;
      ctx.fill();
      ctx.restore();

      // Printed on the sheet, clipped to it.
      ctx.save();
      sheetPath(ctx, fold.x, fold.y);
      ctx.clip();

      // The reference's two dots. They also rhyme with the calendar's two binder posts,
      // which is the kind of repetition a family is allowed.
      for (const dx of [0, 8.4]) {
        ctx.beginPath();
        ctx.arc(36 + dx, 32, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = dx === 0 ? '#E8752F' : '#FF8C42';
        ctx.fill();
      }

      // Two ruled lines: enough to say "document", few enough to survive 24px.
      ctx.fillStyle = 'rgba(120, 124, 138, 0.55)';
      ctx.fillRect(35, 45, 30, 2.6);
      ctx.fillRect(35, 53.5, 21, 2.6);

      // Sheen, not seam. This is the faintest gloss in the family and it has to be: the
      // primitive paints *white*, and at 0.3 over near-white paper the lit half clipped
      // solid while the unlit half stayed grey, so the band's leading edge drew a hard
      // diagonal across the page that read as a crease the geometry does not have.
      const sweep = reduced ? 0.32 : (t * 0.065 + hover * 0.5) % 1;
      paintGlossSweep(ctx, SHEET.x, SHEET.y, 46, 58, sweep, 0.11 + hover * 0.09);

      // Shade pooled along the crease, so the flap has something to sit on. The gradient
      // runs *perpendicular to the fold* and only 15 units into the page: an axis-aligned
      // version flooded the whole lower half of the sheet with brown, which is how paper
      // gets muddy rather than shaded.
      const fdx = fold.x - SHEET.right;
      const fdy = SHEET.bottom - fold.y;
      const flen = Math.hypot(fdx, fdy);
      const midX = (SHEET.right + fold.x) / 2;
      const midY = (fold.y + SHEET.bottom) / 2;
      const under = ctx.createLinearGradient(
        midX,
        midY,
        midX - (fdy / flen) * 15,
        midY + (fdx / flen) * 15,
      );
      under.addColorStop(0, 'rgba(94, 66, 40, 0.32)');
      under.addColorStop(1, 'rgba(94, 66, 40, 0)');
      ctx.fillStyle = under;
      ctx.fillRect(SHEET.x, SHEET.y, 46, 58);
      ctx.restore();

      // Sheet edge, over the printing.
      sheetPath(ctx, fold.x, fold.y);
      ctx.lineWidth = 0.9;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.stroke();

      // ---- the curl: the corner folded back, showing the sheet's ember underside ----
      // The triangle *is* the curl. An earlier pass drew a bulging lip across the sheet
      // face and left the notch showing the grey sheets beneath it, which read as a grey
      // wedge with an orange sliver stuck on. A folded corner is one triangle of the
      // page's own back, brightest along the crease where it tilts into the light.
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(SHEET.right, fold.y);
      ctx.lineTo(SHEET.right, SHEET.bottom - SHEET.r);
      ctx.arcTo(SHEET.right, SHEET.bottom, SHEET.right - SHEET.r, SHEET.bottom, SHEET.r);
      ctx.lineTo(fold.x, SHEET.bottom);
      ctx.closePath();
      const curl = ctx.createLinearGradient(
        (SHEET.right + fold.x) / 2,
        (fold.y + SHEET.bottom) / 2,
        SHEET.right,
        SHEET.bottom,
      );
      curl.addColorStop(0, '#FFE3C2');
      curl.addColorStop(0.22, '#FFB067');
      curl.addColorStop(0.55, '#EE7C2C');
      curl.addColorStop(1, '#8A3A0C');
      ctx.fillStyle = curl;
      ctx.fill();
      ctx.restore();

      // The crease itself: a hairline of caught light along the fold, which is what makes
      // the triangle read as a fold rather than a coloured corner.
      ctx.beginPath();
      ctx.moveTo(SHEET.right, fold.y);
      ctx.lineTo(fold.x, SHEET.bottom);
      ctx.lineWidth = 1.1;
      ctx.strokeStyle = 'rgba(255, 250, 242, 0.8)';
      ctx.stroke();

      ctx.restore(); // plate clip
      strokeMarkBezel(ctx, cx, cy);
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

export default QuantDriveLogo;
