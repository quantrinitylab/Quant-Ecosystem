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
  paintSideWall,
  strokeMarkBezel,
} from '../lib/marks/canvas-mark';

/**
 * QuantContacts' mark — two people, one in front of the other, on the family's live
 * ember plate.
 *
 * What it replaced was a flat SVG contact card: a void rectangle, a brand circle, a
 * shoulder wedge and two detail bars. The card was the right *idea* — a record, not
 * an avatar — but five flat shapes next to `QuantMailLogo` read as a placeholder,
 * and the reference sheet for this mark is unambiguous: two overlapping figures and
 * a lit arc between them. So this is the same medium as its siblings — Canvas 2D on
 * one `requestAnimationFrame` loop, the family's 100-unit buffer, 45/22 squircle and
 * 1.4 rim (see `useLiveMark` and `canvas-mark`).
 *
 * ## Opposite values kept, obsidian overturned
 *
 * The measurement that produced the black figure stands, and it is still why this mark
 * is not two tints of the same peach: the calendar mark taught it the expensive way —
 * an orange plate stacked on an orange plate sampled one value apart read as a bloom,
 * not a plane. Opposite values make "two people" legible at 24px, where a tint
 * difference is gone.
 *
 * What is overturned, at the CEO's direct instruction after seeing this mark beside its
 * four ember siblings, is the *pigment* that carried that gap. Obsidian
 * (`#1B1F26 / #0B0D11 / #050608`) measured chroma 4-9 with blue above green above red —
 * a literally cool near-black, in a suite that has no black anywhere else, and the
 * family row's one obvious outlier at every mounted size.
 *
 * The front figure is now the design system's own **Brand Soft pair, lit**: `#5C3016`
 * (the border token, luminance 58.2, hue 22.3°) as the mid stop, `#7A3F1C` above it —
 * the same pigment at 1.33x exposure rather than a new colour — and `#2B1A11` (the
 * surface token, luminance 30.1) in the shadow. Hue 20.8-22.3° against `#FF8C42`'s own
 * 22.1°, and chroma 26-94 where obsidian had 4-9.
 *
 * The value gap survives the swap because it was never black-against-peach, it was
 * *dark* against *pale*, and dark has a hue.
 *
 * ## What the raster says, at every mounted size
 *
 * Read off the live buffer: front head 62-73 at chroma 71-84, front torso 34-61 at chroma
 * 32-55, every hue 21-24° against `#FF8C42`'s own 22.1°. The back figure is untouched at
 * 232 and 190, which is the proof that only the front figure moved.
 *
 * The wrap-aware hue census — over each cell's own buffer, skipping `a < 200` and
 * `max-min < 30` — reads **100.0% warm (14-60°) at all six sizes, with 0% red, 0% magenta
 * and 0% stray mid-hues**, median 22.7-23.1°, p01 20.4° and p99 29.3-34.9°. Not one
 * blue-dominant pixel remains, where obsidian was blue above green above red by
 * construction. Unlike its Drive sibling, this mark spends no palette exception.
 *
 * The one boundary the arithmetic called marginal is the front figure's lower-left flank,
 * the single edge that faces the plate's dark lower quadrant rather than the peach figure
 * or the plate's lit core. On the device raster, plate against body across that edge:
 *
 * | size | 20px | 24px | 32px | 36px | 64px | 104px |
 * |---|---|---|---|---|---|---|
 * | gap | 30 | 38 | 59 | 63 | 30 | 35 |
 *
 * Above the 30-point floor everywhere, and the prediction of 32-37 was pessimistic in the
 * middle of the range and exact at 24px. The two ends read 30 for opposite reasons: at
 * 20px the plate, the rim and the body all land inside three device pixels, and at 104px
 * the raster finally resolves the plate's own darkest ground (90) instead of averaging it
 * with the rim. At 32-104px that rim measures 127-155 on the boundary itself, so the edge
 * is carried by a line 47-78 above the body rather than by the plate alone.
 *
 * One consistency defect fell out of reading this file against its own rule. The back
 * figure's shadow is `rgba(72, 28, 6, 0.5)` and its wall is peach, both because "a
 * neutral wall under a warm body is the tell that an icon was assembled rather than
 * lit" — while the front figure's shadow was pure `rgba(0, 0, 0, 0.5)` and its wall ran
 * `#33231A` to `#100A07`, chroma 25 and 9. Both are warm now.
 *
 * The arc between them is the reference's white smile arc doing structural work: it
 * is the front figure's rim light, so where it crosses the peach figure it reads as
 * the gap between two bodies, and everywhere else it reads as light landing on a
 * shoulder. Two depths of parallax separate them under the pointer, and on hover the
 * one behind leans in — which is the only thing this icon could mean.
 */

interface Figure {
  cx: number;
  headCy: number;
  headR: number;
  shCy: number;
  shRx: number;
  shRy: number;
}

/**
 * The figure in front. Shoulders are the top of a *wide, shallow* ellipse — 46 across
 * against 16 tall — because that ratio is what reads as shoulders. Two earlier passes
 * failed it in opposite directions: `rx 18.5, ry 19` is a near-circle and drew a mound
 * under a floating head, and `rx 22, ry 40` drew a bell, because the top of a tall
 * ellipse has steep sides.
 */
const FRONT: Figure = { cx: 41, headCy: 41, headR: 12, shCy: 76, shRx: 23, shRy: 16 };
/** The figure behind: smaller, higher and further right, so perspective does the work. */
const BACK: Figure = { cx: 69, headCy: 36, headR: 9.5, shCy: 70, shRx: 18, shRy: 18 };

/**
 * Where a torso stops — 5 units *below* the plate's own bottom edge, so it never does.
 * The plate spans 5→95, and the body is cut by the frame rather than ending inside it.
 */
const BODY_BOTTOM = 100;

/**
 * The torso: shoulders, sides, and the crop. Kept separable from the head because the
 * rim light has to treat them differently — see `paintHeadRim`.
 *
 * The overrun past `BODY_BOTTOM` is not a detail. An earlier pass closed the shoulder
 * ellipse at `shCy`, which laid a hard horizontal line three-quarters of the way down
 * the plate — and the rim light traced it, so the brightest edge in the whole mark was a
 * shelf the anatomy does not have. Every mark of a person lets the torso leave the
 * frame; a body that ends in mid-air is a sticker of a bust.
 */
function bodySubpath(ctx: CanvasRenderingContext2D, f: Figure, dx: number): void {
  const x = f.cx + dx;
  // Down the left side to the crop, over the shoulders, down the right. The 3 units of
  // flare at the bottom is a chest widening below the shoulder line, not a straight box.
  ctx.moveTo(x - f.shRx - 3, BODY_BOTTOM);
  ctx.lineTo(x - f.shRx, f.shCy);
  ctx.ellipse(x, f.shCy, f.shRx, f.shRy, 0, Math.PI, 0);
  ctx.lineTo(x + f.shRx + 3, BODY_BOTTOM);
  ctx.closePath();
}

/**
 * Head and shoulders as one path, for fills, walls, shadows and clips. The neck gap is
 * intentional — it is what reads as a person rather than a snowman.
 */
function figurePath(ctx: CanvasRenderingContext2D, f: Figure, dx = 0): void {
  ctx.beginPath();
  ctx.arc(f.cx + dx, f.headCy, f.headR, 0, Math.PI * 2);
  bodySubpath(ctx, f, dx);
}

/** The torso alone, for the rim light that must not close a ring around the head. */
function bodyPath(ctx: CanvasRenderingContext2D, f: Figure, dx = 0): void {
  ctx.beginPath();
  bodySubpath(ctx, f, dx);
}

/**
 * Where the head's crescent starts and ends: up from the lower left, over the top, down
 * to the upper right. A little past 180° of sweep, so it is unmistakably a crescent.
 */
const RIM_FROM = Math.PI * 0.78;
const RIM_TO = Math.PI * 1.82;

/**
 * The head's rim light, as an *arc* — the fix for a defect that survived one attempt to
 * tune it away.
 *
 * Stroking the whole silhouette at an even weight draws a complete circle around the
 * head, and a black disc inside a white circle is a button. Dimming the shadow side of
 * that stroke was not enough: the head occupies only the bright third of a plate-wide
 * gradient, so even the dimmest part of it came out near 0.35 alpha and the ring still
 * closed. A lit sphere does not have a ring, it has a crescent — so this draws the
 * crescent, and the gradient runs along the crescent's own **chord** rather than across
 * the plate, which is what lets it peak at the light's tangent and reach zero at both
 * ends instead of being cut off mid-stroke.
 */
function paintHeadRim(ctx: CanvasRenderingContext2D, f: Figure, alpha: number): void {
  const ax = f.cx + Math.cos(RIM_FROM) * f.headR;
  const ay = f.headCy + Math.sin(RIM_FROM) * f.headR;
  const bx = f.cx + Math.cos(RIM_TO) * f.headR;
  const by = f.headCy + Math.sin(RIM_TO) * f.headR;
  ctx.beginPath();
  ctx.arc(f.cx, f.headCy, f.headR, RIM_FROM, RIM_TO);
  ctx.lineWidth = 1.9;
  ctx.lineCap = 'round';
  const g = ctx.createLinearGradient(ax, ay, bx, by);
  g.addColorStop(0, 'rgba(255, 255, 255, 0)');
  g.addColorStop(0.4, `rgba(255, 255, 255, ${alpha})`);
  g.addColorStop(0.72, `rgba(255, 238, 216, ${alpha * 0.4})`);
  g.addColorStop(1, 'rgba(255, 222, 190, 0)');
  ctx.strokeStyle = g;
  ctx.stroke();
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
      paintEmberPlate(ctx, cx, cy, t, tiltX, tiltY);
      paintPlateDome(ctx, cx, cy);

      // Warmth gathering behind the pair, so the front figure has something to lift off.
      if (hover > 0.01) {
        const glow = ctx.createRadialGradient(52, 60, 4, 52, 60, 46);
        glow.addColorStop(0, `rgba(255, 230, 198, ${0.28 * hover})`);
        glow.addColorStop(1, 'rgba(255, 176, 95, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(cx - 45, cy - 45, 90, 90);
      }

      // ---- the figure behind: peach, shallow parallax, leaning in on hover ----
      ctx.save();
      ctx.translate(tiltX * 1.3, tiltY * 1.3 + breathe * 0.2);
      // Its thickness first. Peach in shadow is peach, not grey — a neutral wall under a
      // warm body is the tell that an icon was assembled rather than lit.
      paintSideWall(
        ctx,
        (c) => figurePath(c, BACK, -hover * 2.4),
        1.9,
        '#C4855A',
        '#7A4525',
        BACK.headCy - BACK.headR,
        BODY_BOTTOM,
      );
      ctx.shadowColor = 'rgba(72, 28, 6, 0.5)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetY = 2;
      figurePath(ctx, BACK, -hover * 2.4);
      // Light from the top-left, falling off down the torso — the lower a chest is, the
      // less sky reaches it. The bottom stop is what keeps a body that now runs off the
      // plate from becoming a peach slab in the corner.
      const behind = ctx.createLinearGradient(BACK.cx - 16, 24, BACK.cx + 14, 98);
      behind.addColorStop(0, '#FFEBD8');
      behind.addColorStop(0.4, MARK_COLORS.peach);
      behind.addColorStop(0.72, '#DD9E6E');
      behind.addColorStop(1, '#A9663A');
      ctx.fillStyle = behind;
      ctx.fill();

      // A contact seam on its upper-left, and it is not an outline for its own sake. The
      // plate's solar-gold core is `#FFF1D6` and the top of this body is `#FFEBD8` — the
      // same value — so at 24px the pale figure's top edge dissolved into the plate's
      // brightest quadrant. Making the body brighter is not available: nothing on the plate
      // may out-shine the core. What a raised object actually gives you there is occlusion,
      // so that is what this is, warm because it is shadow on ember, and dying to nothing
      // on the lower right where `paintSideWall` already carries the separation.
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      figurePath(ctx, BACK, -hover * 2.4);
      ctx.lineWidth = 1.5;
      const seam = ctx.createLinearGradient(BACK.cx - 14, 24, BACK.cx + 16, 78);
      seam.addColorStop(0, 'rgba(94, 40, 10, 0.52)');
      seam.addColorStop(0.42, 'rgba(112, 52, 18, 0.22)');
      seam.addColorStop(1, 'rgba(120, 58, 22, 0)');
      ctx.strokeStyle = seam;
      ctx.stroke();
      ctx.restore();

      // ---- the figure in front: dark ember, deeper parallax, lifting on hover ----
      const lift = hover * 1.6 - press * 1;
      ctx.save();
      ctx.translate(tiltX * 3, tiltY * 3 - lift);
      ctx.translate(FRONT.cx, 58);
      const scale = 1 + breathe * 0.005 + hover * 0.02 - press * 0.032;
      ctx.scale(scale, scale);
      ctx.translate(-FRONT.cx, -58);

      ctx.save();
      // The front body's wall. What lights the underside of a dark shape sitting on molten
      // metal is the metal, so the wall is ember in shadow and its floor is the family's own
      // `emberInk` — not the near-neutral `#33231A -> #100A07` it used to be, which had
      // chroma 25 and 9 and was the same "assembled rather than lit" tell the back figure's
      // own wall comment warns about.
      paintSideWall(
        ctx,
        (c) => figurePath(c, FRONT),
        2.8 - press * 2,
        '#40200E',
        MARK_COLORS.emberInk,
        FRONT.headCy - FRONT.headR,
        BODY_BOTTOM,
      );
      ctx.shadowColor = 'rgba(58, 22, 4, 0.55)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 2.5;
      figurePath(ctx, FRONT);
      // Brand Soft, lit from the upper left. The mid stop is `#5C3016` verbatim, the top is
      // that same pigment at 1.33x exposure, and the floor is `#2B1A11`. The 0.34 midpoint
      // is not a taste value: it puts the lower-left flank — the one edge in this mark that
      // faces the plate's darkest quadrant — past the mid stop and onto the falling half of
      // the ramp, which is what keeps that boundary above 30 luminance points.
      const front = ctx.createLinearGradient(FRONT.cx - 20, 30, FRONT.cx + 20, 98);
      front.addColorStop(0, '#7A3F1C');
      front.addColorStop(0.34, '#5C3016');
      front.addColorStop(1, '#2B1A11');
      ctx.fillStyle = front;
      ctx.fill();
      ctx.restore();

      // The travelling band, clipped to the body so it grazes the shoulder rather than
      // washing the plate. Idles slowly; hover pushes it across.
      ctx.save();
      figurePath(ctx, FRONT);
      ctx.clip();
      const sweep = reduced ? 0.36 : (t * 0.06 + hover * 0.5) % 1;
      paintGlossSweep(ctx, 15, 28, 52, 72, sweep, 0.07 + hover * 0.09);
      ctx.restore();

      // The lit arc: rim light on the front body, which is the gap where it crosses the
      // peach figure and light on a shoulder everywhere else. One shape, two readings.
      //
      // Body only. The head gets its own crescent, because a stroke that goes all the way
      // round a circle is a button however carefully it is graded.
      //
      // It brightens *again* past 0.78, and that second band is the reference's white arc.
      // A single top-left ramp left the boundary between the two figures unlit, so the
      // separation rested entirely on the front body's cast shadow and the arc the sheet
      // shows was missing. The band is not a second light source: the peach figure is a
      // large pale surface pressed against a dark ember one, so bounce off it is exactly
      // what lights that edge — warmer and dimmer than the direct light, as bounce is.
      //
      // This stroke also carries the mark's tightest boundary. Its 0.9-alpha white start
      // sits on the front figure's lower-left flank, which is the one edge that faces the
      // plate's dark lower quadrant rather than the peach figure or the plate's lit core.
      bodyPath(ctx, FRONT);
      ctx.lineWidth = 1.9;
      const rim = ctx.createLinearGradient(FRONT.cx - 21, 52, FRONT.cx + 20, 84);
      rim.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
      rim.addColorStop(0.3, `rgba(255, 240, 220, ${0.5 + hover * 0.2})`);
      rim.addColorStop(0.56, 'rgba(255, 214, 172, 0.12)');
      rim.addColorStop(0.84, `rgba(255, 226, 190, ${0.52 + hover * 0.18})`);
      rim.addColorStop(1, 'rgba(255, 208, 164, 0.2)');
      ctx.strokeStyle = rim;
      ctx.stroke();

      paintHeadRim(ctx, FRONT, 0.88 + hover * 0.1);
      ctx.restore();

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

export default QuantContactsLogo;
