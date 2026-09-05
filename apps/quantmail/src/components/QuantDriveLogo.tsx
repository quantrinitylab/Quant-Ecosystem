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
 * QuantDrive's mark — a ream of three sheets, the top one a near-white card in a warm
 * edge, its top-right corner rolled far back over a lit underside, with two glossy red
 * spheres low and centre. On the family's live ember plate.
 *
 * ## What stands from the last pass, and what is overturned
 *
 * Kept, because it is measurement and not taste: at 20 CSS px on a 1.5x panel the whole
 * mark is 30 device pixels, so **one device pixel is 3.33 buffer units**. That is why the
 * original document stack was mud — a 2.6-unit ruled line is 0.78 of a pixel, a 2.5-unit
 * dot is one and a half pixels across with two and a half between centres, and two
 * rotated leaves in `#8A8F9C` were a mid grey against a mid-orange plate, which is a
 * value match and not a contrast. Fewer and larger features is still the whole strategy.
 *
 * Overturned, at the CEO's direct instruction after seeing the shipped mark beside the
 * reference: **the three palette decisions the last pass defended**. The reference's two
 * spheres are pure red, its roll runs yellow to magenta on the underside, and its stack
 * is three visibly separate sheets rather than a thin ream. All three are now built as
 * the reference has them. The reasoning that produced the ember substitutions is left
 * above per the design engine's section 17; only the conclusions moved.
 *
 * ## The exception being spent, stated rather than buried
 *
 * The design system is `#FF8C42 / #FF9B5A / #E8752F` with **no red, no blue, no green**.
 * This mark now contains pure red (`#FF3B26`, `#DE1508`, `#8B0C02`) in the two spheres
 * and a red-to-magenta run (`#C21A0E`, `#F0246E`, `#FF77C8`) across the roll's underside.
 *
 * That is a deliberate, scoped exception, and it is the second one in the suite — the
 * first is the mascot's `spectral` ring. It is spent here for the same reason: the
 * reference was praised by name, and the two spheres were praised *specifically*, read as
 * eyes. It is scoped to this mark's printed objects. The plate, the frame, the ream's
 * middle sheet and the whole rest of the family stay in palette, so the exception is
 * visible as an accent on an ember mark rather than as a second identity.
 *
 * ## The reconciliation that keeps this in the family
 *
 * The reference's outer frame is bright orange and its card is near-white. Our ember
 * lives in the frame, so the family plate and the reference's own construction want the
 * same thing, and the near-white card is what makes the value flip work: Calendar puts an
 * obsidian pad on ember, Contacts a figure, Drive puts paper. At 24px in a sidebar that
 * flip is the whole recognition, far more reliable than silhouette.
 *
 * The warm ring around the card is **the sheet's own edge thickness catching light**, not
 * a card nested in a card. That distinction is not a dodge: a nested surface would repeat
 * the fold line as a second band, and it does not — along the fold the sheet bends, so
 * there is a crease hairline and no border at all, which is the physics and also what the
 * reference shows.
 *
 * ## Legibility of the three layers, which is what was asked for
 *
 * Each exposed band is 6.6 units, so 1.98 device pixels at 20px and 3.6 at 36px — where
 * the ream this replaces was 3.2 units, 0.96 of a pixel, and collapsed into a single warm
 * edge at the small sizes.
 *
 * The stack is separated by seams rather than by band brightness, which is what the raster
 * turned out to show. Walking a column at ux 40 down through the whole assembly at 104px:
 * card paper 215-234, the frame's bottom band 137-142, a shadow seam at 111-113, the ember
 * sheet's exposed edge climbing 141 to 203, the lavender sheet's 169 to 211, then plate at
 * 68-73. The two exposed bands are only 20 luminance points apart at their brightest, so
 * they are told apart by 60-100 points of *chroma* (warm 100-149 against cool 28-48) and by
 * the seam between them — not by value, which is what an earlier draft of this comment
 * claimed before it was measured.
 *
 * At 20px the ember and lavender bands merge into one bright plateau (181/189/178) under
 * one dark seam at 133, so the mark reads as two sheets there and three from 32px up. That
 * is the honest floor, and it is still the fix: the version this replaces read as *one*
 * warm edge at 20px, because 0.96 of a device pixel cannot hold a seam at all.
 */

/** The top sheet, in buffer units — 50 x 49, and the only near-white surface. */
const CARD = { x: 25, y: 13, right: 75, bottom: 62, r: 6 } as const;
const CARD_W = CARD.right - CARD.x;
const CARD_H = CARD.bottom - CARD.y;

/** The top sheet's own edge thickness, caught in warm light. */
const FRAME = 3.4;

/**
 * The two sheets under it, furthest first so each is covered by the next. Offset down and
 * left, so the stack is countable from two directions rather than one.
 *
 * `base` is where the sheet tucks under the one above and `top` is its exposed edge,
 * which catches the room — so the gradient runs dark to light downward, the opposite of
 * the way a flat panel is usually shaded.
 */
const STACK = [
  { dx: -5.2, dy: 13.2, base: '#7E5C8C', mid: '#BE97C8', top: '#E9D6EC' },
  { dx: -2.6, dy: 6.6, base: '#A8480C', mid: MARK_COLORS.emberDeep, top: '#FFC689' },
] as const;

/** How far the roll eats into the sheet along each edge at rest. */
const CURL_SPAN = 26;

/** Diagonal unit normal pointing out of the top-right corner, away from the fold. */
const NX = Math.SQRT1_2;

/**
 * Where the roll starts, as a function of how far it has peeled.
 *
 * `ax` walks left along the top edge and `by` walks down the right edge by the same
 * amount, so the fold stays a 45 degree line and hover grows the roll instead of skewing
 * it. An earlier pass bulged a lip nine units across the page instead of growing the
 * fold, and it read as a lump in the corner.
 */
const foldAt = (peel: number) => {
  const s = CURL_SPAN * peel;
  return { ax: CARD.right - s, by: CARD.y + s, s };
};

/**
 * The top sheet, cut away along the fold, inset by `inset` on every side.
 *
 * The fold endpoints move *along their own edges* by `inset` rather than perpendicular,
 * which puts the inset outline's cut on the same 45 degree line as the outer one. That is
 * what leaves no border band along the crease.
 */
function cardPath(ctx: CanvasRenderingContext2D, ax: number, by: number, inset: number): void {
  const x = CARD.x + inset;
  const y = CARD.y + inset;
  const right = CARD.right - inset;
  const bottom = CARD.bottom - inset;
  const r = Math.max(1.6, CARD.r - inset);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(ax + inset, y);
  ctx.lineTo(right, by - inset);
  ctx.lineTo(right, bottom - r);
  ctx.arcTo(right, bottom, right - r, bottom, r);
  ctx.lineTo(x + r, bottom);
  ctx.arcTo(x, bottom, x, bottom - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

/**
 * The roll's free edge: it leaves the fold steeply, passes *outside* where the sheet's
 * corner used to be, and tucks back in to meet the right edge.
 *
 * Passing outside the old corner is the whole difference between a roll and a fold. The
 * corner sits `s / sqrt(2)` from the fold line; a cubic's midpoint offset is about three
 * quarters of its mean control offset, so control offsets of 1.45 s and 0.63 s put the
 * free edge about two units beyond it. Making the two offsets unequal is what puts the
 * inflection in the silhouette — tight where the paper leaves the page, opening out as it
 * comes back down.
 */
function curlFreeEdge(ctx: CanvasRenderingContext2D, ax: number, by: number, s: number): void {
  ctx.beginPath();
  ctx.moveTo(ax, CARD.y);
  ctx.bezierCurveTo(
    ax + s * 0.35 + NX * s * 1.45,
    CARD.y + s * 0.35 - NX * s * 1.45,
    ax + s * 0.8 + NX * s * 0.63,
    CARD.y + s * 0.8 - NX * s * 0.63,
    CARD.right,
    by,
  );
}

function curlPath(ctx: CanvasRenderingContext2D, ax: number, by: number, s: number): void {
  curlFreeEdge(ctx, ax, by, s);
  ctx.closePath();
}

/**
 * How far past the fold the roll's gradient runs, as a fraction of the peel span.
 *
 * This is not a taste value, it is the bezier's own reach. A cubic's midpoint sits about
 * three quarters of the way out along its mean control offset, and `curlFreeEdge`'s offsets
 * of 1.45 s and 0.63 s mean the free edge bulges `0.78 s` from the fold chord. A gradient
 * longer than that paints its last stops on canvas the fill never covers.
 *
 * The first measurement of this file caught exactly that: at `1.06` the painted triangle
 * only reached gradient position 0.735, so **both magenta stops fell outside the fill** and
 * a diagonal walk out of the fold read 244 at the crease, 80 in the trough, then straight
 * to the plate — a red roll with the magenta the CEO asked for silently clipped off. At
 * `0.82` the ramp's 1.0 lands at 0.95 of the bulge, so every stop paints.
 */
const ROLL_REACH = 0.82;

/**
 * The underside of the roll: the reference's yellow, orange, red and magenta, with the
 * luminance shaped as lit crease, shadow trough, lit free edge.
 *
 * Both readings are in one ramp on purpose. The hue sequence is the reference's and it is
 * what was asked for; the luminance profile is what makes a triangle read as a cylinder,
 * because a roll is two lit zones with the turned-away middle between them. A pure
 * dark-to-light ramp over the same triangle is what made the previous version read as a
 * coloured corner rather than as paper.
 *
 * The stops are pulled inward from an even spread so the magenta gets a share it can be
 * seen at. 0.74 to 1.0 over a 21.3-unit ramp is 5.5 units at the bulge — 1.66 device pixels
 * at 20 CSS px and 8.6 at 104 — which is the same order as the ream's bands, and it is the
 * reason PR #232's "a magenta band would occupy under one device pixel" no longer holds:
 * that was measured against a 16%-of-ramp share ending at a clipped edge.
 */
const ROLL_BANDS: ReadonlyArray<readonly [number, string]> = [
  [0, '#FFEFB0'],
  [0.14, '#FFC63D'],
  [0.32, '#FF7A1A'],
  [0.52, '#C21A0E'],
  [0.74, '#F0246E'],
  [1, '#FF77C8'],
];

/**
 * The two spheres, low and centre.
 *
 * 6.2 units of radius is 3.7 device pixels across at 20px with 5.1 between the near
 * edges, which resolves as two objects; the dots these replace were 1.5 across with 2.5
 * between, which resolves as one smudge. They sit 17 apart on the card's own midline
 * because the CEO read them as a pair of eyes and said so — that reading is the reason
 * they survive at all, and symmetry about the midline is what protects it.
 */
const EYES = [41.5, 58.5] as const;
const EYE_CY = 46;
const EYE_R = 6.2;

/**
 * One glossy sphere: glow, contact shadow, body, paper-bounce rim, specular.
 *
 * The order matters more than any single value. The glow goes down before the body or it
 * washes the body out; the contact shadow goes down before the body or it darkens the
 * sphere's own lower edge instead of the paper under it; and the specular goes last,
 * because it is the only thing on the card allowed to be pure white on near-white paper.
 */
function paintSphere(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  const glow = ctx.createRadialGradient(x, y, r * 0.2, x, y, r * 2.4);
  glow.addColorStop(0, 'rgba(232, 32, 16, 0.34)');
  glow.addColorStop(0.55, 'rgba(232, 32, 16, 0.11)');
  glow.addColorStop(1, 'rgba(232, 32, 16, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(x - r * 2.4, y - r * 2.4, r * 4.8, r * 4.8);

  ctx.beginPath();
  ctx.ellipse(x + r * 0.16, y + r * 0.92, r * 0.86, r * 0.3, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(88, 22, 10, 0.34)';
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
  body.addColorStop(0, '#FF8A72');
  body.addColorStop(0.34, '#FF3B26');
  body.addColorStop(0.7, '#DE1508');
  body.addColorStop(1, '#8B0C02');
  ctx.fillStyle = body;
  ctx.fill();

  // Light bouncing off the paper into the sphere's shaded lower-right — the one cue that
  // stops a shaded ball from reading as a flat disc with a dot on it.
  ctx.beginPath();
  ctx.arc(x, y, r - 0.5, Math.PI * 0.08, Math.PI * 0.72);
  ctx.lineWidth = 1.1;
  ctx.strokeStyle = 'rgba(255, 186, 168, 0.6)';
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(x - r * 0.34, y - r * 0.4, r * 0.32, r * 0.23, -0.6, 0, Math.PI * 2);
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
        const glow = ctx.createRadialGradient(52, 50, 4, 52, 50, 46);
        glow.addColorStop(0, `rgba(255, 232, 204, ${0.26 * hover})`);
        glow.addColorStop(1, 'rgba(255, 176, 95, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(cx - 45, cy - 45, 90, 90);
      }

      // ---- one transform, so the ream, the card and the roll parallax as a unit ----
      const lift = hover * 1.5 - press * 1;
      ctx.translate(cx + tiltX * 2.4, cy + tiltY * 2.4 - lift);
      const scale = 1 + breathe * 0.004 + hover * 0.018 - press * 0.03;
      ctx.scale(scale, scale);
      ctx.translate(-cx, -cy);

      // ---- the two sheets under the card ----
      for (const layer of STACK) {
        const bot = CARD.bottom + layer.dy;
        ctx.beginPath();
        ctx.roundRect(CARD.x + layer.dx, CARD.y + layer.dy, CARD_W, CARD_H, CARD.r);
        const g = ctx.createLinearGradient(0, bot - 13, 0, bot);
        g.addColorStop(0, layer.base);
        g.addColorStop(0.55, layer.mid);
        g.addColorStop(1, layer.top);
        ctx.fillStyle = g;
        ctx.fill();
      }

      const { ax, by, s } = foldAt(1 + breathe * 0.04 + hover * 0.16 - press * 0.08);

      // ---- the top sheet's edge: the warm frame, and the card's drop shadow ----
      ctx.save();
      ctx.shadowColor = 'rgba(48, 20, 4, 0.5)';
      ctx.shadowBlur = 5 + hover * 3;
      ctx.shadowOffsetY = 2.4;
      cardPath(ctx, ax, by, 0);
      const frame = ctx.createLinearGradient(CARD.x, CARD.y, CARD.right, CARD.bottom);
      frame.addColorStop(0, '#FFD9AE');
      frame.addColorStop(0.42, MARK_COLORS.ember);
      frame.addColorStop(1, '#B24C0E');
      ctx.fillStyle = frame;
      ctx.fill();
      ctx.restore();

      // ---- the near-white card inside it ----
      cardPath(ctx, ax, by, FRAME);
      const paper = ctx.createLinearGradient(CARD.x, CARD.y, CARD.right, CARD.bottom);
      paper.addColorStop(0, '#FFFFFF');
      paper.addColorStop(0.55, '#F6F2FB');
      paper.addColorStop(1, '#E3DDEF');
      ctx.fillStyle = paper;
      ctx.fill();

      // Everything printed on the card is clipped to it.
      ctx.save();
      cardPath(ctx, ax, by, FRAME);
      ctx.clip();

      for (const ex of EYES) {
        paintSphere(ctx, ex, EYE_CY, EYE_R);
      }

      // Shade cast by the lifted corner, running perpendicular to the fold and only 16
      // units into the page. An axis-aligned version of this flooded the whole upper half
      // of the card with brown, which is how paper gets muddy rather than shaded.
      const mx = (ax + CARD.right) / 2;
      const my = (CARD.y + by) / 2;
      const cast = ctx.createLinearGradient(mx, my, mx - NX * 16, my + NX * 16);
      cast.addColorStop(0, 'rgba(94, 62, 34, 0.36)');
      cast.addColorStop(1, 'rgba(94, 62, 34, 0)');
      ctx.fillStyle = cast;
      ctx.fillRect(CARD.x, CARD.y, CARD_W, CARD_H);

      // Sheen, not seam. This is the faintest gloss in the family and it has to be: the
      // primitive paints *white*, and at 0.3 over near-white paper the lit half clipped
      // solid while the unlit half stayed grey, so the band's leading edge drew a hard
      // diagonal across the page that read as a crease the geometry does not have.
      const sweep = reduced ? 0.32 : (t * 0.065 + hover * 0.5) % 1;
      paintGlossSweep(ctx, CARD.x, CARD.y, CARD_W, CARD_H, sweep, 0.11 + hover * 0.09);
      ctx.restore();

      // The seam where the card meets its own edge, and then the edge's outer boundary.
      cardPath(ctx, ax, by, FRAME);
      ctx.lineWidth = 0.9;
      ctx.strokeStyle = 'rgba(122, 60, 18, 0.5)';
      ctx.stroke();

      cardPath(ctx, ax, by, 0);
      ctx.lineWidth = 1;
      const edge = ctx.createLinearGradient(CARD.x, CARD.y, CARD.right, CARD.bottom);
      edge.addColorStop(0, 'rgba(255, 246, 232, 0.8)');
      edge.addColorStop(0.5, 'rgba(255, 214, 176, 0.28)');
      edge.addColorStop(1, 'rgba(126, 56, 14, 0.5)');
      ctx.strokeStyle = edge;
      ctx.stroke();

      // ---- the roll ----
      ctx.save();
      curlPath(ctx, ax, by, s);
      const roll = ctx.createLinearGradient(
        (ax + CARD.right) / 2,
        (CARD.y + by) / 2,
        (ax + CARD.right) / 2 + NX * s * ROLL_REACH,
        (CARD.y + by) / 2 - NX * s * ROLL_REACH,
      );
      for (const [at, hex] of ROLL_BANDS) {
        roll.addColorStop(at, hex);
      }
      ctx.fillStyle = roll;
      ctx.shadowColor = 'rgba(40, 16, 2, 0.45)';
      ctx.shadowBlur = 4 + hover * 2;
      ctx.shadowOffsetY = 1.4;
      ctx.fill();
      ctx.restore();

      // The sheet's own back face, seen along the free edge where the paper has come all
      // the way round. Two hairlines and not one fill: at 20px the whole roll is six
      // device pixels across, so a band wide enough to fill would be the roll.
      curlFreeEdge(ctx, ax, by, s);
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = 'rgba(255, 236, 246, 0.7)';
      ctx.stroke();

      // The crease. A hairline of caught light along the fold is what makes the shape read
      // as a bend in one sheet rather than as a second object stuck to the corner.
      ctx.beginPath();
      ctx.moveTo(ax, CARD.y);
      ctx.lineTo(CARD.right, by);
      ctx.lineWidth = 1.1;
      ctx.strokeStyle = 'rgba(255, 250, 242, 0.85)';
      ctx.stroke();

      ctx.restore(); // plate clip + group transform

      // The bezel last and outside the clip, so the highlight sits over the card's corners
      // rather than under them — the ordering the whole family relies on.
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
