'use client';

import { useCallback, useEffect, useState } from 'react';
import type { QuantLogoProps } from './AppMark';
import { useLiveMark, type MarkFrame } from './marks/useLiveMark';
import {
  MARK_COLORS,
  markFont,
  markSquirclePath,
  paintEmberPlate,
  paintGlossSweep,
  paintPlateDome,
  paintSideWall,
  roundRectPath,
  strokeMarkBezel,
} from '../lib/marks/canvas-mark';

/**
 * QuantCalendar's mark — a real pad on a live ember plate, drawn the way
 * `QuantMailLogo` is drawn.
 *
 * What it replaced was five flat SVG rectangles. Flat is the whole problem: the
 * ecosystem's own mark earns its presence from moving material, stacked planes and
 * hand-placed light, and a sibling built from `<rect fill="#090A0C">` sits next to
 * it in the sidebar looking like a placeholder. So this is Canvas 2D on one
 * `requestAnimationFrame` loop (see `useLiveMark`), sharing the family's 100px
 * buffer, 45/22 squircle and 1.4 rim so the silhouette cannot drift from the mark
 * beside it.
 *
 * Three planes give it depth: a deep-ember sheet offset up-and-left behind the pad,
 * the pad face itself, and two white binder posts standing proud of the pad's top
 * edge. They parallax against the plate under the pointer, the pad breathes, and a
 * specular band travels across its face — pushed along on hover, not faded in.
 *
 * **The pad is frosted glass, not obsidian, and that is a reversal.** The draft this
 * replaced built it as a near-black slab (`#171A20 → #050608`) for the reason still
 * recorded at plane 1 below. Reviewed against the reference render that was the wrong
 * call, and wrong in a way worth keeping on the record rather than quietly deleting:
 * the reference stacks a *bright* body on an orange plate, so the hero of the mark is
 * its lightest element — warm at the top, cooling to near-white at the foot, with the
 * ember reading around and behind it. Making the hero the darkest thing in the mark
 * inverted the entire value structure, and no amount of gloss on a black face
 * recovers that; at 24px in the sidebar it went to a muddy chip. Every value below
 * follows from the inversion: the sheet went warm because it now has to sit between a
 * bright plate and a brighter pad, the type went to ember ink because it sits on
 * light, the pad's shading pools warm because a frosted sheet over molten metal
 * cannot shade neutral, and the gloss ceiling lifted because frost has no charcoal to
 * be lifted to.
 *
 * The content is today's real date, not the reference's six dots: the day number
 * always, the weekday only from 88px up, where 8.5px of type resolves instead of
 * turning to mud — at the 64px draft it was a grey smudge under the posts. A
 * calendar icon that shows the wrong day is a small lie the product cannot afford,
 * so it re-reads the clock every minute.
 */

/** The pad, in buffer units. Centred at 50,52 — a hair below the optical centre. */
const PAD = { x: 22, y: 26, w: 56, h: 52, r: 9, cx: 50, cy: 52 } as const;
const HEAD_H = 13;

interface DateParts {
  day: string;
  weekday: string;
  long: string;
}

const readToday = (): DateParts => {
  const now = new Date();
  return {
    day: String(now.getDate()),
    weekday: now.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 3).toUpperCase(),
    long: now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }),
  };
};

export function QuantCalendarLogo({
  size = 32,
  className = '',
  title = 'QuantCalendar',
}: QuantLogoProps) {
  // Seeded on first render so the very first painted frame already carries a date.
  // The server's value is never used for markup — a canvas has no SSR content — and
  // the accessible name only picks the date up after mount, so there is nothing to
  // mismatch during hydration.
  const [today, setToday] = useState<DateParts>(readToday);
  const [spokenDate, setSpokenDate] = useState<string | null>(null);
  const showWeekday = size >= 88;

  const paint = useCallback(
    ({ ctx, cx, cy, time, tiltX, tiltY, hover, press, reduced }: MarkFrame) => {
      const t = reduced ? 0 : time;
      const breathe = reduced ? 0 : Math.sin(t * 0.5);
      const sway = reduced ? 0 : Math.sin(t * 0.37);

      // ---- the plate: brand ember, with two slow passes moving over it ----
      ctx.save();
      markSquirclePath(ctx, cx, cy);
      ctx.clip();
      paintEmberPlate(ctx, cx, cy, t, tiltX, tiltY);
      paintPlateDome(ctx, cx, cy);

      // Warmth gathering under the pad on hover, so the lift has something to lift off.
      if (hover > 0.01) {
        const glow = ctx.createRadialGradient(PAD.cx, PAD.cy + 6, 4, PAD.cx, PAD.cy + 6, 44);
        glow.addColorStop(0, `rgba(255, 226, 190, ${0.3 * hover})`);
        glow.addColorStop(1, 'rgba(255, 176, 95, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(cx - 45, cy - 45, 90, 90);
      }

      // ---- the pad group: one transform for all three planes ----
      const lift = hover * 1.4 - press * 0.9;
      ctx.translate(cx + tiltX * 2.6, cy + tiltY * 2.6 - lift);
      ctx.rotate(sway * 0.006);
      const scale = 1 + breathe * 0.004 + hover * 0.018 - press * 0.03;
      ctx.scale(scale, scale);
      ctx.translate(-cx, -cy);

      // ---- plane 1: the sheet behind, offset up-and-left so it reads as a stack ----
      // *Ember ink, not graphite — and this is where the reversal was argued.* The draft
      // before this one wanted a cool graphite sheet, having sampled an orange one at
      // `#C26930` beside a `#A45422` plate: one value apart, a muddy bloom on the
      // plate's edge rather than a plane. The measurement was right; the conclusion was
      // wrong, because it was taken with an obsidian pad in front. Against a frosted pad
      // the sheet's job changes from *separate from the plate* to *sit between a bright
      // plate and a brighter pad*, and the value it needs is still dark — but warm.
      // Cool graphite between two warm planes was the grey seam the whole mark read as.
      // Deep ember ink is the same value and belongs to the plate it lies on.
      //
      // Offset as well as rotated: the reference's back plate is a clean translation up
      // and to the left. Rotation alone poked corners out symmetrically, which reads as
      // an outline round the pad rather than as a second sheet behind it.
      ctx.save();
      ctx.translate(PAD.cx - 2.4, PAD.cy - 2.4);
      ctx.rotate(-0.15 + sway * 0.012);
      ctx.translate(-PAD.cx, -PAD.cy);
      roundRectPath(ctx, PAD.x - 2, PAD.y - 2, PAD.w + 4, PAD.h + 4, PAD.r + 2);
      ctx.shadowColor = 'rgba(0, 0, 0, 0.42)';
      ctx.shadowBlur = 3.5;
      ctx.shadowOffsetY = 2;
      const sheet = ctx.createLinearGradient(PAD.x, PAD.y, PAD.x + PAD.w, PAD.y + PAD.h);
      sheet.addColorStop(0, '#7A3510');
      sheet.addColorStop(0.55, '#4A1D06');
      sheet.addColorStop(1, '#2A0F04');
      ctx.fillStyle = sheet;
      ctx.fill();

      // Its lit edge, drawn with the shadow off: the plate's own glow caught on the
      // sheet's rim, which is what stops a dark plane becoming a hole.
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      ctx.lineWidth = 0.9;
      ctx.strokeStyle = 'rgba(255, 198, 148, 0.5)';
      ctx.stroke();
      ctx.restore();

      // ---- plane 2: the pad face, knocked out of the plate in the family's void ----
      // The shadow is deliberately tight. At blur 9 it blackened the back plate's
      // exposed corners, which is what made the stack read as one smudged shape.
      //
      // Under it, the pad's *thickness*. A single filled rounded rect is a decal on the
      // plate however good the plate is, because it has an outline and no edge; the same
      // silhouette pushed 3 units down leaves a wall showing along the bottom and the
      // lower curves, and the pad becomes a slab lying on molten metal. Press shortens
      // the wall, because a thing pressed into a surface shows less of its side — which
      // is a far better press than a scale change, and it costs one extra path.
      //
      // The wall is the *shaded side of a light slab*, so it is warm and mid-value, not
      // near-black. Frosted glass over ember has no black in its edge; the previous
      // `#3A2417 → #130B07` was the wall of an obsidian pad and under a bright face it
      // read as a drawn outline instead of a thickness.
      const depth = 3.2 - press * 2.4;
      paintSideWall(
        ctx,
        (c) => roundRectPath(c, PAD.x, PAD.y, PAD.w, PAD.h, PAD.r),
        depth,
        '#D79A67',
        '#8A4A1C',
        PAD.y,
        PAD.y + PAD.h,
      );

      // The face: warm ember-cream at the top, cooling to a faintly cool near-white at
      // the foot. Four stops, because three read as a ramp and the reference's body has
      // an interior — and the contact shadow under it is warm, since the only light
      // reaching the plate beneath the pad is the plate's own.
      ctx.save();
      ctx.shadowColor = 'rgba(70, 26, 6, 0.5)';
      ctx.shadowBlur = 5 + hover * 3;
      ctx.shadowOffsetY = 2.4 + hover * 1.4;
      roundRectPath(ctx, PAD.x, PAD.y, PAD.w, PAD.h, PAD.r);
      const face = ctx.createLinearGradient(PAD.x, PAD.y, PAD.x, PAD.y + PAD.h);
      face.addColorStop(0, '#FFD2A8');
      face.addColorStop(0.3, '#FFEEDD');
      face.addColorStop(0.68, '#F4F2F1');
      face.addColorStop(1, '#DFE2E9');
      ctx.fillStyle = face;
      ctx.fill();
      ctx.restore();

      // Everything printed on the pad is clipped to it, so nothing bleeds onto the plate.
      ctx.save();
      roundRectPath(ctx, PAD.x, PAD.y, PAD.w, PAD.h, PAD.r);
      ctx.clip();

      // The header rail.
      const head = ctx.createLinearGradient(PAD.x, PAD.y, PAD.x + PAD.w, PAD.y + HEAD_H);
      head.addColorStop(0, MARK_COLORS.emberHot);
      head.addColorStop(0.55, MARK_COLORS.ember);
      head.addColorStop(1, MARK_COLORS.emberDeep);
      ctx.fillStyle = head;
      ctx.fillRect(PAD.x, PAD.y, PAD.w, HEAD_H);

      // Light on the rail's own top edge, shade where it meets the body.
      const rail = ctx.createLinearGradient(PAD.x, PAD.y, PAD.x, PAD.y + HEAD_H);
      rail.addColorStop(0, 'rgba(255, 255, 255, 0.34)');
      rail.addColorStop(0.35, 'rgba(255, 255, 255, 0.05)');
      rail.addColorStop(1, 'rgba(90, 34, 6, 0.32)');
      ctx.fillStyle = rail;
      ctx.fillRect(PAD.x, PAD.y, PAD.w, HEAD_H);

      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.fillRect(PAD.x, PAD.y + HEAD_H - 0.7, PAD.w, 0.7);

      // ---- the date ----
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      if (showWeekday) {
        ctx.fillStyle = MARK_COLORS.emberInk;
        ctx.font = markFont(700, 8.5);
        ctx.fillText(today.weekday, PAD.cx, PAD.y + HEAD_H / 2 + 0.4);
      }

      // Ember ink, not white: the face is light now, so the type is the dark element.
      // The shadow is warm and almost gone — on a light face a hard black drop reads as
      // an outline, and what sells type sitting *in* glass is one unit of warm bleed.
      ctx.save();
      ctx.shadowColor = 'rgba(122, 58, 18, 0.34)';
      ctx.shadowBlur = 2.4;
      ctx.shadowOffsetY = 0.9;
      ctx.fillStyle = MARK_COLORS.emberInk;
      ctx.font = markFont(700, showWeekday ? 27 : 30);
      ctx.fillText(today.day, PAD.cx, PAD.y + HEAD_H + (PAD.h - HEAD_H) / 2 - 0.2);
      ctx.restore();

      // Travelling specular band. Idles slowly, and hover pushes it across. The old
      // 0.055 ceiling was a constraint of the obsidian face — anything brighter lifted
      // it to charcoal. Frost has the opposite requirement: the reference carries a
      // highlight on every element in it and not one flat fill.
      const sweep = reduced ? 0.34 : (t * 0.07 + hover * 0.5) % 1;
      paintGlossSweep(ctx, PAD.x, PAD.y, PAD.w, PAD.h, sweep, 0.16 + hover * 0.16);

      // Shading, warm. A frosted sheet lying on molten metal cannot pool neutral: the
      // light reaching its underside is the plate's, so the foot goes warm and the top
      // keeps the sky. Black here was the other half of the muddiness.
      const inner = ctx.createLinearGradient(PAD.x, PAD.y, PAD.x, PAD.y + PAD.h);
      inner.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
      inner.addColorStop(0.16, 'rgba(255, 255, 255, 0)');
      inner.addColorStop(0.74, 'rgba(122, 58, 18, 0)');
      inner.addColorStop(1, 'rgba(108, 50, 14, 0.2)');
      ctx.fillStyle = inner;
      ctx.fillRect(PAD.x, PAD.y, PAD.w, PAD.h);

      // The rim-light the reference traces round its whole silhouette, here on the pad's
      // own edge: bright where it catches the plate's hottest layer at the top, deeper
      // ember as it comes down. The white hairline this replaces vanished into the frost.
      roundRectPath(ctx, PAD.x + 0.5, PAD.y + 0.5, PAD.w - 1, PAD.h - 1, PAD.r - 0.5);
      ctx.lineWidth = 1;
      const padRim = ctx.createLinearGradient(PAD.x, PAD.y, PAD.x, PAD.y + PAD.h);
      padRim.addColorStop(0, 'rgba(255, 214, 172, 0.9)');
      padRim.addColorStop(0.4, 'rgba(255, 165, 96, 0.5)');
      padRim.addColorStop(1, 'rgba(226, 116, 46, 0.7)');
      ctx.strokeStyle = padRim;
      ctx.stroke();
      ctx.restore();

      // ---- plane 3: the binder posts, standing proud of the pad's top edge ----
      // Short and chunky. The first pass stood 7 units clear at 4.2 wide and read as
      // antennae; a real binder ring is a stud, so the exposed part is now shorter
      // than it is wide by less than half. White at the crown, because in the reference
      // the rings are the one pure-white element and they have to stay the brightest
      // thing on the mark now that the pad is light too — they read against the orange
      // rail and the plate, never against the frost.
      const postY = PAD.y - 5.6;
      const postH = 11.4;
      for (const px of [PAD.x + 16, PAD.x + PAD.w - 16]) {
        // A stud is a cylinder, so it gets a wall too — a short one, warm, because the
        // post is peach and its shaded side is peach in shadow, not grey.
        paintSideWall(
          ctx,
          (c) => roundRectPath(c, px - 2.5, postY, 5, postH, 2.5),
          1.7 - press * 1.2,
          '#B4703C',
          '#6B3819',
          postY,
          postY + postH,
        );
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetY = 2;
        roundRectPath(ctx, px - 2.5, postY, 5, postH, 2.5);
        const post = ctx.createLinearGradient(px - 2.5, postY, px + 2.5, postY + postH);
        post.addColorStop(0, '#FFFFFF');
        post.addColorStop(0.46, '#FFF1E1');
        post.addColorStop(1, MARK_COLORS.peach);
        ctx.fillStyle = post;
        ctx.fill();
        ctx.restore();

        roundRectPath(ctx, px - 1.15, postY + 1.5, 1.3, 3.4, 0.65);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.78)';
        ctx.fill();
      }

      ctx.restore(); // pad group + plate clip

      // ---- the bezel, last and outside the clip, so it sits over the pad's edge ----
      strokeMarkBezel(ctx, cx, cy);
    },
    [today, showWeekday],
  );

  const { canvasRef, pointerProps, repaint } = useLiveMark(paint, size);

  // Re-read the clock every minute, and only re-render when the day actually turns.
  useEffect(() => {
    const tick = () => {
      const next = readToday();
      setSpokenDate(next.long);
      setToday((prev) =>
        prev.day === next.day && prev.weekday === next.weekday && prev.long === next.long
          ? prev
          : next,
      );
    };
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, []);

  // Under reduced motion no loop is running, so a new date needs an explicit frame.
  useEffect(() => {
    repaint();
  }, [today, showWeekday, repaint]);

  return (
    <span
      role="img"
      aria-label={spokenDate ? `${title} — ${spokenDate}` : title}
      title={title}
      className={`inline-flex shrink-0 select-none items-center justify-center ${className}`}
      style={{ width: size, height: size }}
      {...pointerProps}
    >
      <canvas
        ref={canvasRef}
        // Hover and press live in the canvas, so there is no CSS transform to fight
        // with them. The shadow stays neutral: the mark is already ember, and ringing
        // it in more ember is the exact halo the product is defined against.
        className="h-full w-full drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]"
        style={{ width: size, height: size }}
      />
    </span>
  );
}

export default QuantCalendarLogo;
