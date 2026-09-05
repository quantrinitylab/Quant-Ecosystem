'use client';

import { useCallback } from 'react';
import type { QuantLogoProps } from './AppMark';
import { useLiveMark, type MarkFrame } from './marks/useLiveMark';
import {
  MARK_COLORS,
  markSquirclePath,
  paintEmberPlate,
  paintGlossSweep,
  paintPlateDome,
  strokeMarkBezel,
} from '../lib/marks/canvas-mark';

/**
 * QuantDrive's mark — a glossy sheet with a thick stacked rim, its top-right corner
 * rolled back over the ember underside, on the family's live ember plate.
 *
 * ## What this was, and why it changed
 *
 * The previous version was a document stack: two grey leaves rotated behind a white
 * front sheet, the bottom-right corner cut off along a straight fold, two 2.5-unit
 * dots and two ruled lines printed on the page. Put beside Mail, Calendar and
 * Contacts at the sizes this mark actually mounts at, it was the muddiest of the four
 * — and the reason is arithmetic, not taste.
 *
 * At 20 CSS px on a 1.5x panel the whole mark is 30 device pixels, so **one device
 * pixel is 3.33 buffer units**. A 2.6-unit ruled line is 0.78 of a pixel. A 2.5-unit
 * dot is one and a half pixels across with two and a half between centres. Two whole
 * rotated leaves in `#8A8F9C` sat at mid grey against a mid-orange plate, which is a
 * value match, not a contrast. So the sheet carried five separate printed features and
 * every one of them landed under a pixel: that is what mud is. The fix is not more
 * care with the same features, it is fewer and larger ones.
 *
 * ## What the reference actually shows
 *
 * Three things this did not have. A **thick multi-layer rim** — the edge of a ream,
 * stepping down and to the left in bands, lightest on the outside. The corner rolled
 * back at the **top right** in an S-curve, showing banded colour on the sheet's
 * underside, rather than a flat triangle clipped off the bottom right. And two
 * **glossy spheres low and centre**, each with a white specular and its own glow.
 *
 * All three are legibility wins as well as fidelity ones: a nine-unit rim reads as one
 * warm edge at 20px and resolves into three bands by 36px, a rolled corner has twice
 * the area of a clipped one, and an 11-unit sphere is three device pixels across where
 * the dot it replaces was one and a half.
 *
 * ## The deviations, stated rather than buried
 *
 * The previous file's reasoning for substituting the reference's lilac is kept: the
 * design system has one accent, and a mark has to sit next to the product's real
 * chrome rather than the sheet it was drawn on. Two of its conclusions are overturned,
 * because they were what the mud was made of.
 *
 * **The reference's two spheres are pure red; these are ember.** The spectral ring on
 * the mascot is a real, scoped exception to "no red, no blue, no green" — it is there
 * because a full spectrum *is* the identity of an LED-faced robot. Two accent dots are
 * not Drive's identity; the rolled sheet is. And this mark sits in the bottom nav and
 * in every page header next to three ember plates, which is exactly the position the
 * mail mark's crimson corners occupied before they were removed. The reference's
 * *material* is kept in full — radial body, offset specular, contact shadow, glow.
 * Only the hue comes from the system. This is the one call in the mark worth
 * overruling, and it is a one-line change to overrule.
 *
 * **The curl's underside bands are warm, with no magenta.** The reference runs yellow
 * → orange → red → magenta across the roll. What makes a roll read as a cylinder is
 * two lit zones with a shadow trough between them, and that is a lighting effect, so
 * the ramp here is pale gold → hover ember → a deep oxide trough → accent ember →
 * peach at the free edge. Five bands, same count, entirely inside the palette. A
 * magenta band would occupy less than one device pixel at 20px and would register
 * only as a colour cast over the whole corner — it would spend the exception and buy
 * nothing visible.
 *
 * **The plate stays ember; the reference's card is near-white.** In the reference the
 * white squircle *is* the document, so there is no plate and no glyph — it cannot
 * carry the family's dome or bezel. Keeping the ember plate and putting the
 * reference's object on it is what makes the value flip work: Calendar puts an
 * obsidian pad on ember and Contacts an obsidian figure, Drive puts white. At 24px in
 * a sidebar that flip is the whole recognition, far more reliable than silhouette.
 */

/** The front sheet, in buffer units. 50 x 55, portrait, because paper is. */
const SHEET = { x: 27, y: 18, right: 77, bottom: 73, r: 5 } as const;

/**
 * The ream under it: three copies of the sheet stepping down and to the left, so only
 * a band of each shows. Lightest on the outside, per the reference — physically the
 * exposed edges catch the room while the innermost is shadowed by the top sheet.
 *
 * 3.2 units per band is 0.96 of a device pixel at 20px and 1.7 at 36px, which is the
 * whole design: one warm edge when small, three bands when there is room for three.
 */
const RIM_LAYERS = [
  { dx: -6.6, dy: 9.6, top: '#FFCE9E', base: MARK_COLORS.emberDeep },
  { dx: -4.4, dy: 6.4, top: MARK_COLORS.emberHot, base: '#D6640F' },
  { dx: -2.2, dy: 3.2, top: '#FF9B5A', base: '#B4500F' },
] as const;

/** How far the roll eats into the sheet along each edge at rest. */
const CURL_SPAN = 20;

/** Diagonal unit normal pointing out of the top-right corner, away from the fold. */
const NX = Math.SQRT1_2;

/**
 * Where the roll starts, as a function of how far it has peeled.
 *
 * `a` walks left along the top edge, `b` walks down the right edge, both by the same
 * amount — so the fold stays a 45 degree line and hover grows the roll instead of
 * skewing it. An earlier pass on the old bottom-right fold bulged a lip nine units
 * across the page instead of growing the fold, and it read as a lump in the corner.
 */
const foldAt = (peel: number) => {
  const s = CURL_SPAN * peel;
  return { ax: SHEET.right - s, by: SHEET.y + s, s };
};

/** The sheet, with its top-right corner cut away along the fold. */
function sheetPath(ctx: CanvasRenderingContext2D, ax: number, by: number): void {
  const { x, y, r, right, bottom } = SHEET;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(ax, y);
  ctx.lineTo(right, by);
  ctx.lineTo(right, bottom - r);
  ctx.arcTo(right, bottom, right - r, bottom, r);
  ctx.lineTo(x + r, bottom);
  ctx.arcTo(x, bottom, x, bottom - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

/**
 * The rolled corner: the fold line, and a free edge that leaves the fold steeply,
 * passes *outside* where the sheet's corner used to be, and tucks back in to meet the
 * right edge.
 *
 * Passing outside the old corner is the whole difference between a roll and a fold.
 * The corner sits `s / sqrt(2)` from the fold line; a cubic's midpoint offset is about
 * three quarters of its mean control offset, so control offsets of 1.45 s and 0.63 s
 * put the free edge roughly a unit and a half beyond it. Making the two offsets
 * different is what puts the inflection in the silhouette — tight where the paper
 * leaves the page, opening out as it comes back down.
 */
function curlPath(ctx: CanvasRenderingContext2D, ax: number, by: number, s: number): void {
  ctx.beginPath();
  ctx.moveTo(ax, SHEET.y);
  ctx.bezierCurveTo(
    ax + s * 0.35 + NX * s * 1.45,
    SHEET.y + s * 0.35 - NX * s * 1.45,
    ax + s * 0.8 + NX * s * 0.63,
    SHEET.y + s * 0.8 - NX * s * 0.63,
    SHEET.right,
    by,
  );
  ctx.closePath();
}

/**
 * The two spheres, low and centre, straddling the sheet's midline.
 *
 * 5.6 units of radius is 3.4 device pixels across at 20px with 4.5 between centres,
 * which resolves as two objects. The dots these replace were 1.5 across with 2.5
 * between, which resolves as one smudge. Same idea as the reference, at a size the
 * product's real chrome can show.
 */
const SPHERES = [44.5, 59.5] as const;
const SPHERE_CY = 56;
const SPHERE_R = 5.6;

/**
 * One glossy sphere: glow, contact shadow, body, specular, then a rim light on the
 * shaded side.
 *
 * The order matters more than any single value here. The glow has to go down before
 * the body or it washes the body out; the contact shadow has to go down before the
 * body or it darkens the sphere's own lower edge instead of the paper under it; and
 * the specular has to go last, because it is the only thing in the mark that is
 * allowed to be pure white on white paper.
 */
function paintSphere(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  const glow = ctx.createRadialGradient(x, y, r * 0.2, x, y, r * 2.4);
  glow.addColorStop(0, 'rgba(255, 140, 66, 0.32)');
  glow.addColorStop(0.55, 'rgba(255, 140, 66, 0.1)');
  glow.addColorStop(1, 'rgba(255, 140, 66, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(x - r * 2.4, y - r * 2.4, r * 4.8, r * 4.8);

  ctx.beginPath();
  ctx.ellipse(x + r * 0.16, y + r * 0.92, r * 0.86, r * 0.3, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(96, 48, 14, 0.34)';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  const body = ctx.createRadialGradient(
    x - r * 0.36,
    y - r * 0.42,
    r * 0.08,
    x - r * 0.1,
    y - r * 0.1,
    r * 1.36,
  );
  body.addColorStop(0, '#FFD3AB');
  body.addColorStop(0.34, MARK_COLORS.ember);
  body.addColorStop(0.7, MARK_COLORS.emberDeep);
  body.addColorStop(1, '#A8410A');
  ctx.fillStyle = body;
  ctx.fill();

  // Light bouncing off the paper into the sphere's shaded lower-right — the one cue
  // that stops a shaded ball from reading as a flat disc with a dot on it.
  ctx.beginPath();
  ctx.arc(x, y, r - 0.5, Math.PI * 0.08, Math.PI * 0.72);
  ctx.lineWidth = 1.1;
  ctx.strokeStyle = 'rgba(255, 198, 152, 0.55)';
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(x - r * 0.34, y - r * 0.4, r * 0.3, r * 0.22, -0.6, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.fill();
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
        const glow = ctx.createRadialGradient(52, 54, 4, 52, 54, 46);
        glow.addColorStop(0, `rgba(255, 232, 204, ${0.26 * hover})`);
        glow.addColorStop(1, 'rgba(255, 176, 95, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(cx - 45, cy - 45, 90, 90);
      }

      // ---- one transform, so the sheet, its ream and its roll parallax as a unit ----
      const lift = hover * 1.5 - press * 1;
      ctx.translate(cx + tiltX * 2.4, cy + tiltY * 2.4 - lift);
      const scale = 1 + breathe * 0.004 + hover * 0.018 - press * 0.03;
      ctx.scale(scale, scale);
      ctx.translate(-cx, -cy);

      // ---- the ream, deepest first so each band is covered by the next ----
      const w = SHEET.right - SHEET.x;
      const h = SHEET.bottom - SHEET.y;
      for (const layer of RIM_LAYERS) {
        ctx.beginPath();
        ctx.roundRect(SHEET.x + layer.dx, SHEET.y + layer.dy, w, h, SHEET.r);
        const g = ctx.createLinearGradient(
          SHEET.x + layer.dx,
          SHEET.y + layer.dy,
          SHEET.x + layer.dx,
          SHEET.bottom + layer.dy,
        );
        g.addColorStop(0, layer.top);
        g.addColorStop(1, layer.base);
        ctx.fillStyle = g;
        ctx.fill();
      }

      const { ax, by, s } = foldAt(1 + breathe * 0.04 + hover * 0.18 - press * 0.09);

      // ---- the sheet ----
      ctx.save();
      ctx.shadowColor = 'rgba(48, 20, 4, 0.5)';
      ctx.shadowBlur = 5 + hover * 3;
      ctx.shadowOffsetY = 2.4;
      sheetPath(ctx, ax, by);
      const paper = ctx.createLinearGradient(SHEET.x, SHEET.y, SHEET.right, SHEET.bottom);
      paper.addColorStop(0, '#FFFFFF');
      paper.addColorStop(0.55, '#F7F6F9');
      paper.addColorStop(1, '#E2E1E9');
      ctx.fillStyle = paper;
      ctx.fill();
      ctx.restore();

      // Everything printed on the sheet is clipped to it.
      ctx.save();
      sheetPath(ctx, ax, by);
      ctx.clip();

      for (const sx of SPHERES) {
        paintSphere(ctx, sx, SPHERE_CY, SPHERE_R);
      }

      // Shade cast by the lifted corner, running perpendicular to the fold and only 15
      // units into the page. An axis-aligned version of this flooded the whole upper
      // half of the sheet with brown, which is how paper gets muddy rather than shaded.
      const mx = (ax + SHEET.right) / 2;
      const my = (SHEET.y + by) / 2;
      const cast = ctx.createLinearGradient(mx, my, mx - NX * 15, my + NX * 15);
      cast.addColorStop(0, 'rgba(94, 62, 34, 0.34)');
      cast.addColorStop(1, 'rgba(94, 62, 34, 0)');
      ctx.fillStyle = cast;
      ctx.fillRect(SHEET.x, SHEET.y, w, h);

      // Sheen, not seam. This is the faintest gloss in the family and it has to be: the
      // primitive paints *white*, and at 0.3 over near-white paper the lit half clipped
      // solid while the unlit half stayed grey, so the band's leading edge drew a hard
      // diagonal across the page that read as a crease the geometry does not have.
      const sweep = reduced ? 0.32 : (t * 0.065 + hover * 0.5) % 1;
      paintGlossSweep(ctx, SHEET.x, SHEET.y, w, h, sweep, 0.11 + hover * 0.09);
      ctx.restore();

      // The sheet's own edge, over the printing: caught light along the top-left pair of
      // sides, falling to a warm seam where it meets the ream.
      sheetPath(ctx, ax, by);
      ctx.lineWidth = 1;
      const edge = ctx.createLinearGradient(SHEET.x, SHEET.y, SHEET.right, SHEET.bottom);
      edge.addColorStop(0, 'rgba(255, 255, 255, 0.75)');
      edge.addColorStop(0.5, 'rgba(255, 226, 198, 0.24)');
      edge.addColorStop(1, 'rgba(150, 74, 24, 0.4)');
      ctx.strokeStyle = edge;
      ctx.stroke();

      // ---- the roll ----
      // Two lit zones with a shadow trough between them, measured out from the fold: the
      // crease catches the light because that is where the paper tilts up into it, the
      // middle of the roll has turned away, and the free edge has come back round. A
      // single dark-to-light ramp across the same triangle is what made the old version
      // read as a coloured corner rather than as paper.
      ctx.save();
      curlPath(ctx, ax, by, s);
      const roll = ctx.createLinearGradient(
        (ax + SHEET.right) / 2,
        (SHEET.y + by) / 2,
        (ax + SHEET.right) / 2 + NX * s * 1.1,
        (SHEET.y + by) / 2 - NX * s * 1.1,
      );
      roll.addColorStop(0, '#FFE8CE');
      roll.addColorStop(0.24, '#FF9B5A');
      roll.addColorStop(0.56, '#B4500F');
      roll.addColorStop(0.84, MARK_COLORS.ember);
      roll.addColorStop(1, MARK_COLORS.peach);
      ctx.fillStyle = roll;
      ctx.shadowColor = 'rgba(40, 16, 2, 0.45)';
      ctx.shadowBlur = 4 + hover * 2;
      ctx.shadowOffsetY = 1.4;
      ctx.fill();
      ctx.restore();

      // The crease. A hairline of caught light along the fold is what makes the shape read
      // as a bend in one sheet rather than as a second object stuck to the corner.
      ctx.beginPath();
      ctx.moveTo(ax, SHEET.y);
      ctx.lineTo(SHEET.right, by);
      ctx.lineWidth = 1.1;
      ctx.strokeStyle = 'rgba(255, 250, 242, 0.8)';
      ctx.stroke();

      ctx.restore(); // plate clip + group transform

      // The bezel last and outside the clip, so the highlight sits over the sheet's
      // corners rather than under them — the ordering the whole family relies on.
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
