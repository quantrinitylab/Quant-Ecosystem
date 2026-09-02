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
 * Three planes give it depth: a back sheet rotated 11° behind the pad, the pad
 * face itself, and two binder posts standing proud of the pad's top edge. They
 * parallax against the plate under the pointer, the pad breathes, and a specular
 * band travels across its face — pushed along on hover rather than faded in.
 *
 * The content is today's real date, not six placeholder dots: the day number
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

      // ---- plane 1: the sheet behind, rotated so its corners read as a stack ----
      // *Graphite, not ember.* Two drafts tried an orange back plate, copying reference
      // ③ — but ③ stacks an orange plate against a white page, and here the background
      // is already the ember plate. Sampled, the orange sheet came out `#C26930` beside
      // a `#A45422` plate: one value apart, so it read as a muddy bloom on the plate's
      // edge rather than a plane. Dark separates from both neighbours at once — bright
      // ember, mid graphite, obsidian pad — which is what makes the stack legible.
      // Same size as the pad, not a halo around it, so its corners poke four clean
      // triangles past the pad's edges instead of a uniform outline.
      ctx.save();
      ctx.translate(PAD.cx, PAD.cy);
      ctx.rotate(-0.15 + sway * 0.012);
      ctx.translate(-PAD.cx, -PAD.cy);
      roundRectPath(ctx, PAD.x - 2, PAD.y - 2, PAD.w + 4, PAD.h + 4, PAD.r + 2);
      ctx.shadowColor = 'rgba(0, 0, 0, 0.42)';
      ctx.shadowBlur = 3.5;
      ctx.shadowOffsetY = 2;
      const sheet = ctx.createLinearGradient(PAD.x, PAD.y, PAD.x + PAD.w, PAD.y + PAD.h);
      sheet.addColorStop(0, '#3B424F');
      sheet.addColorStop(0.55, '#262B34');
      sheet.addColorStop(1, '#171B21');
      ctx.fillStyle = sheet;
      ctx.fill();

      // Its lit edge, drawn with the shadow off: warm light bouncing off the plate onto
      // the plate's own rim, which is what stops a dark plane becoming a hole.
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      ctx.lineWidth = 0.9;
      ctx.strokeStyle = 'rgba(255, 208, 165, 0.42)';
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
      const depth = 3.2 - press * 2.4;
      paintSideWall(
        ctx,
        (c) => roundRectPath(c, PAD.x, PAD.y, PAD.w, PAD.h, PAD.r),
        depth,
        '#3A2417',
        '#130B07',
        PAD.y,
        PAD.y + PAD.h,
      );

      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.42)';
      ctx.shadowBlur = 5 + hover * 3;
      ctx.shadowOffsetY = 2.4 + hover * 1.4;
      roundRectPath(ctx, PAD.x, PAD.y, PAD.w, PAD.h, PAD.r);
      const face = ctx.createLinearGradient(PAD.x, PAD.y, PAD.x, PAD.y + PAD.h);
      face.addColorStop(0, '#171A20');
      face.addColorStop(0.5, '#0A0C10');
      face.addColorStop(1, '#050608');
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

      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetY = 1.2;
      ctx.fillStyle = MARK_COLORS.type;
      ctx.font = markFont(700, showWeekday ? 27 : 30);
      ctx.fillText(today.day, PAD.cx, PAD.y + HEAD_H + (PAD.h - HEAD_H) / 2 - 0.2);
      ctx.restore();

      // Travelling specular band. Idles slowly, and hover pushes it across. Kept
      // faint: at 0.09 it lifted the whole obsidian face to charcoal.
      const sweep = reduced ? 0.34 : (t * 0.07 + hover * 0.5) % 1;
      paintGlossSweep(ctx, PAD.x, PAD.y, PAD.w, PAD.h, sweep, 0.055 + hover * 0.08);

      // Inner rim: a lit top edge and a pooled bottom, drawn over everything on the pad.
      const inner = ctx.createLinearGradient(PAD.x, PAD.y, PAD.x, PAD.y + PAD.h);
      inner.addColorStop(0, 'rgba(255, 255, 255, 0.12)');
      inner.addColorStop(0.12, 'rgba(255, 255, 255, 0)');
      inner.addColorStop(0.8, 'rgba(0, 0, 0, 0)');
      inner.addColorStop(1, 'rgba(0, 0, 0, 0.38)');
      ctx.fillStyle = inner;
      ctx.fillRect(PAD.x, PAD.y, PAD.w, PAD.h);

      roundRectPath(ctx, PAD.x + 0.5, PAD.y + 0.5, PAD.w - 1, PAD.h - 1, PAD.r - 0.5);
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.stroke();
      ctx.restore();

      // ---- plane 3: the binder posts, standing proud of the pad's top edge ----
      // Short and chunky. The first pass stood 7 units clear at 4.2 wide and read as
      // antennae; a real binder ring is a stud, so the exposed part is now shorter
      // than it is wide by less than half.
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
        post.addColorStop(0, '#FFF4E9');
        post.addColorStop(0.5, MARK_COLORS.peach);
        post.addColorStop(1, '#DF9A65');
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
