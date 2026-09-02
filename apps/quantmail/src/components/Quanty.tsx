'use client';

import { useCallback, useEffect } from 'react';
import { useLiveMark, type MarkFrame } from './marks/useLiveMark';
import {
  markSquirclePath,
  paintCornerNotch,
  paintGlossSweep,
  paintObsidianPlate,
  strokeIridescentBezel,
} from '../lib/marks/canvas-mark';

/**
 * Quanty — the mascot, rebuilt in the family's live medium.
 *
 * What this replaces was a flat SVG of a cream-and-teal helmet robot with brushed-metal
 * ear pods. It was competent SVG and it was the wrong character. The mascot sheet
 * (references ⑥⑦⑧) specifies "Color: Black + Rainbow Accent", "Material: Matte +
 * Glossy" and "Face Display: LED (Dynamic)", and the hero shows a black glossy squircle
 * with an iridescent ring and two white capsule eyes. Cream `#f6f0e2` and teal `#2cc4b2`
 * are not in the design system at all, and a beige robot head beside four obsidian-and-
 * ember app marks read as clip art from another product.
 *
 * So Quanty is now the same object as the rest of the suite — `paintObsidianPlate` under
 * `strokeIridescentBezel`, on the family's 45/22 squircle and 100-unit buffer — wearing
 * the **spectral** finish of the ring where QuantGit wears chrome. That is the one place
 * the mascot is allowed to out-shout the apps: the rainbow is its own.
 *
 * The face *is* the plate. There is no inner screen rectangle, because a card inside a
 * card is what the design engine bans and because the reference has no such box either:
 * the eyes sit on the black, a vignette gathers behind them so the black reads as glass,
 * and an edgeless scanline band over the face makes the "LED" claim true rather than
 * decorative.
 *
 * `QuantyProps` and `QuantyExpression` are unchanged — twenty call sites pass
 * `expression`, `size` and `bob`, and all eight expressions are drawn here.
 */

export type QuantyExpression =
  | 'idle'
  | 'happy'
  | 'wink'
  | 'thinking'
  | 'sad'
  | 'cry'
  | 'shock'
  | 'angry';

export interface QuantyProps {
  expression?: QuantyExpression;
  /** Rendered edge in px. Square now — the reference is a squircle, not a 260×220 bust. */
  size?: number;
  /** Gentle float. Drawn on canvas rather than in CSS so it scales with `size`. */
  bob?: boolean;
  className?: string;
  title?: string;
}

/** Half the distance between the eyes, from the plate's centre. */
const EYE_DX = 16;
/** Eye centreline. A shade above the plate's middle, because a face's eyes are not halfway down it. */
const EYE_CY = 48;
const EYE_W = 15;
const EYE_H = 27;

/**
 * The blink, derived from `time` alone — no refs, no timers, no state.
 *
 * `useLiveMark` seeds its clock with `Math.random() * 100` per instance, so anything
 * computed from `time` is already desynchronised across the twenty places Quanty appears;
 * a shared `Date.now()` would have every mascot on the page blink in lockstep, which is
 * the tell that a character is a widget. Each period gets a hashed jitter so the rhythm
 * is irregular the way `QuantMailLogo`'s `3500 + rand * 2000` is, and openness follows
 * `d²` rather than a step, so the lid accelerates shut and eases open.
 *
 * One period is ≈4.4 s and one blink ≈0.26 s of it. Returns openness in 0→1.
 */
const BLINK_PERIOD = 6.4;
function blinkOpenness(time: number): number {
  const n = Math.floor(time / BLINK_PERIOD);
  const jitter = Math.abs(Math.sin(n * 12.9898) * 43758.5453) % 1;
  const at = (0.28 + jitter * 0.62) * BLINK_PERIOD;
  const d = (time - n * BLINK_PERIOD - at) / 0.19;
  return Math.abs(d) >= 1 ? 1 : d * d;
}

/**
 * How far shut each expression is allowed to blink, and this is not a nicety.
 *
 * `shock` is a *held* state. The 104px sheet caught one canvas ~0.1 s into a blink and
 * shock's two wide eyes rendered as two horizontal dashes — which reads as bored, not
 * startled. With seventeen mascots mounted on that page and a ~4% blink duty cycle, a
 * broken frame in the sheet was arithmetic rather than bad luck, and the same arithmetic
 * applies to every screenshot anyone takes of this product. A face frozen mid-gasp does
 * not blink, so shock's floor is 1.
 *
 * `thinking`'s eyes are already slits; a blink has nothing left to close and only makes
 * them disappear, so it gets a partial floor. Everything else blinks freely — sad with its
 * eyes shut under `/\` brows is *more* sad, not broken.
 */
const BLINK_FLOOR: Partial<Record<QuantyExpression, number>> = { shock: 1, thinking: 0.72 };

/** The LED's own colour: white at the core, cooling at the edge, never tinted teal. */
function ledPaint(ctx: CanvasRenderingContext2D): CanvasGradient {
  const g = ctx.createLinearGradient(0, EYE_CY - 18, 0, EYE_CY + 18);
  g.addColorStop(0, '#FFFFFF');
  g.addColorStop(0.5, '#F4FBFF');
  g.addColorStop(1, '#C8DEEC');
  return g;
}

/**
 * Fill an eye shape as a lit LED: the white body plus a bloom around it.
 *
 * The bloom is `shadowColor`/`shadowBlur` on the fill rather than `ctx.filter`, because
 * `filter: blur()` on a 100-unit buffer costs a full-canvas pass per frame and this runs
 * on twenty mounted mascots. A shadow is one composite and it is what "emissive" actually
 * looks like on a dark plate: light spilling a short way onto the glass around the pixel.
 */
function ledFill(
  ctx: CanvasRenderingContext2D,
  build: (c: CanvasRenderingContext2D) => void,
  bloom: number,
): void {
  ctx.save();
  build(ctx);
  ctx.shadowColor = `rgba(186, 226, 255, ${bloom})`;
  ctx.shadowBlur = 6.5;
  ctx.fillStyle = ledPaint(ctx);
  ctx.fill();
  ctx.restore();
}

/** The same, for the expressions whose eyes are curves rather than bodies. */
function ledStroke(
  ctx: CanvasRenderingContext2D,
  build: (c: CanvasRenderingContext2D) => void,
  width: number,
  bloom: number,
): void {
  ctx.save();
  build(ctx);
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.shadowColor = `rgba(186, 226, 255, ${bloom})`;
  ctx.shadowBlur = 6.5;
  ctx.strokeStyle = ledPaint(ctx);
  ctx.stroke();
  ctx.restore();
}

/** The default eye: a vertical capsule, squashed about its own centre as it closes. */
function capsule(
  ctx: CanvasRenderingContext2D,
  x: number,
  open: number,
  w = EYE_W,
  h = EYE_H,
): void {
  const hh = Math.max(1.1, h * open);
  ctx.beginPath();
  ctx.roundRect(x - w / 2, EYE_CY - hh / 2, w, hh, Math.min(w, hh) / 2);
}

/**
 * A curve. Serves happy's eyes and the downturned mouth that settles sad, cry and angry,
 * because they are one shape with a sign and a `cy` — and a mouth drawn separately is a
 * mouth that stops matching the eyes it belongs to.
 *
 * Positive `bulge` arches the middle *up* and pulls the ends down: `∩`, which is a smiling
 * eye and, at mouth height, a frown. Negative dips: `◡`.
 */
function arcShape(
  ctx: CanvasRenderingContext2D,
  x: number,
  cy: number,
  bulge: number,
  span: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x - span, cy + bulge * 0.28);
  ctx.quadraticCurveTo(x, cy - bulge, x + span, cy + bulge * 0.28);
}

/**
 * A rounded bar with an **honest** corner radius, and the reason it exists is a bug that
 * survived a whole render cycle.
 *
 * `capsule` derives its radius as `min(w, hh) / 2`, which is exactly right for a vertical
 * pill and catastrophic for a horizontal one: a 15×12.4 rect at radius 6.2 is a circle with
 * the corners barely clipped. So the brows drawn through `capsule` came out as two small
 * dots, the tilt that was supposed to separate a plea from a threat became invisible, and
 * `sad`, `cry` and `angry` collapsed into one reading at every size — the eyes contributed
 * nothing and the mouth carried all three.
 *
 * Taking `r` as an argument instead of computing it is the whole fix.
 */
function bar(
  ctx: CanvasRenderingContext2D,
  x: number,
  cy: number,
  w: number,
  h: number,
  r: number,
): void {
  const hh = Math.max(1.1, h);
  ctx.beginPath();
  ctx.roundRect(x - w / 2, cy - hh / 2, w, hh, Math.min(r, Math.min(w, hh) / 2));
}

/** Brows: long, thin, and their own element — see `brow`. */
const BROW_CY = 29;
const BROW_LEN = 17;
const BROW_THICK = 6;

/**
 * A brow, above an eye rather than instead of one.
 *
 * The first pass tried to make one tilted shape serve as both, on the theory that a brow
 * pasted over an LED face is a sticker. That objection is wrong on its own terms: on a
 * display *everything* drawn is the display doing it, and a lit bar above a lit eye is how
 * every LED-face robot and every emoji has ever signed anger. What the single-shape version
 * actually bought was ambiguity — one blob per side, no arrangement for the eye to read.
 *
 * Two elements survive downsampling in a way one cannot, because at 26px each is a smudge
 * and it is the *pattern* of smudges that carries the meaning: `/\` between the eyes is a
 * plea, `\/` is a threat. `sign` +1 drops the inner end, −1 raises it.
 */
function brow(
  ctx: CanvasRenderingContext2D,
  x: number,
  sign: number,
  tilt: number,
  bloom: number,
): void {
  ledFill(
    ctx,
    (c) => {
      c.save();
      c.translate(x, BROW_CY);
      c.rotate(sign * tilt);
      c.translate(-x, -BROW_CY);
      bar(c, x, BROW_CY, BROW_LEN, BROW_THICK, 2.4);
      c.restore();
    },
    bloom,
  );
}

/** A shut lid: shallow, and curving *down*, which is the difference between shut and sad. */
function shutEye(ctx: CanvasRenderingContext2D, x: number, span = 8.5): void {
  ctx.beginPath();
  ctx.moveTo(x - span, EYE_CY - 1);
  ctx.quadraticCurveTo(x, EYE_CY + 6, x + span, EYE_CY - 1);
}

/**
 * A tear, falling. `phase` is 0→1 down the face; it fades out over the last third so it
 * disappears into the plate's dark lower edge instead of being clipped off mid-drop.
 */
function tear(ctx: CanvasRenderingContext2D, x: number, phase: number, bloom: number): void {
  const p = phase - Math.floor(phase);
  const y = EYE_CY + 15 + p * 28;
  const alpha = Math.min(1, (1 - p) * 2.4) * 0.92;
  if (alpha <= 0.02) return;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x, y - 5.2);
  ctx.quadraticCurveTo(x + 3.1, y - 1.4, x + 3.1, y + 1);
  ctx.arc(x, y + 1, 3.1, 0, Math.PI);
  ctx.quadraticCurveTo(x - 3.1, y - 1.4, x, y - 5.2);
  ctx.shadowColor = `rgba(186, 226, 255, ${bloom * 0.7})`;
  ctx.shadowBlur = 5;
  const g = ctx.createLinearGradient(x - 3, y - 5, x + 3, y + 4);
  g.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
  g.addColorStop(1, `rgba(178, 214, 236, ${alpha * 0.8})`);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
}

/**
 * The three-dot ellipsis, lighting in sequence — `thinking`'s real payload.
 *
 * `thinking` used to be idle with the eyes nudged 5 units right, and in the 104px and 26px
 * sheets it was *indistinguishable* from idle: narrowing an eye by 24% is invisible, and
 * translating both eyes together reads as the mark being off-centre rather than as a gaze.
 * An expression that only exists in motion has failed anyway, because a screenshot is how
 * most people meet a mascot.
 *
 * A loading ellipsis at mouth height is unambiguous, needs no motion to read, and is the
 * one "emotion" a machine can display literally rather than by analogy — it is not a mouth
 * pretending to think, it is a process indicator. Under reduced motion the middle dot is
 * held lit, so the still frame still says *working*.
 */
const THINK_DX = [-9, 0, 9];
function thinkingDots(
  ctx: CanvasRenderingContext2D,
  t: number,
  bloom: number,
  reduced: boolean,
): void {
  for (let i = 0; i < THINK_DX.length; i += 1) {
    const dx = THINK_DX[i] ?? 0;
    const phase = reduced ? (i === 1 ? 1 : 0.22) : (Math.sin(t * 2.6 - i * 0.85) + 1) / 2;
    ctx.save();
    // The brightness swing is `globalAlpha` rather than a dimmer paint, because `ledPaint`
    // is opaque by design — an LED that is off is dark, not grey.
    ctx.globalAlpha = 0.3 + phase * 0.7;
    ledFill(
      ctx,
      (c) => {
        c.beginPath();
        c.arc(50 + dx, 74, 2.5 + phase * 0.8, 0, Math.PI * 2);
      },
      bloom,
    );
    ctx.restore();
  }
}

/**
 * The eight expressions, all of them, sharing four builders.
 *
 * `open` already carries the blink and the press-squint, so an expression never has to
 * know about either — which is what keeps `expression` the caller's property and the
 * liveliness ours.
 */
function paintFace(
  ctx: CanvasRenderingContext2D,
  expression: QuantyExpression,
  t: number,
  open: number,
  bloom: number,
  reduced: boolean,
): void {
  const L = 50 - EYE_DX;
  const R = 50 + EYE_DX;
  /**
   * The mouth, and the reason there is one at all: the first pass tried to carry sentiment
   * on eye curvature alone. `◡ ◡` was drawn for sad and it read as *smiling*, because a cup
   * opening upward is the universal happy-closed eye. A mouth is unambiguous.
   *
   * Sad and angry take different ones. Given identical mouths and (once the brow bug is
   * fixed) similar brow bars, the two still landed a shade too close at 26px, and the
   * difference between grief and rage in every drawn face is that grief is *slack* and rage
   * is *clenched* — so sad gets a wide, deep, soft curve and angry a short, shallow, heavy
   * one set lower. idle, happy and wink stay eyes-only, which is what the hero sheet shows.
   */
  const mouth = (cy: number, bulge: number, span: number, width: number) =>
    ledStroke(ctx, (c) => arcShape(c, 50, cy, bulge, span), width, bloom * 0.85);

  switch (expression) {
    case 'happy':
      ledStroke(ctx, (c) => arcShape(c, L, EYE_CY, 12, 10.5), 6, bloom);
      ledStroke(ctx, (c) => arcShape(c, R, EYE_CY, 12, 10.5), 6, bloom);
      break;

    case 'wink':
      ledFill(ctx, (c) => capsule(c, L, open), bloom);
      ledStroke(ctx, (c) => shutEye(c, R), 6.4, bloom);
      break;

    case 'thinking': {
      // Narrowed slits, lifted and looking up-and-away — it is attending to something that
      // is not you — plus the ellipsis, which is what actually makes this frame legible when
      // it is a screenshot. `bar` rather than `capsule` because a squat shape needs a small
      // radius or it is a dot.
      const scan = reduced ? 5.5 : 4 + Math.sin(t * 1.15) * 4.4;
      ledFill(ctx, (c) => bar(c, L + scan, EYE_CY - 5, 14, 9.5 * open, 3.2), bloom);
      ledFill(ctx, (c) => bar(c, R + scan, EYE_CY - 5, 14, 9.5 * open, 3.2), bloom);
      thinkingDots(ctx, t, bloom, reduced);
      break;
    }

    case 'sad':
      // Soft, rounded eyes under `/\` brows: grief is slack.
      ledFill(ctx, (c) => capsule(c, L, open * 0.66), bloom);
      ledFill(ctx, (c) => capsule(c, R, open * 0.66), bloom);
      brow(ctx, L, -1, 0.34, bloom * 0.94);
      brow(ctx, R, 1, 0.34, bloom * 0.94);
      mouth(74, 7, 9, 4.2);
      break;

    case 'cry':
      ledFill(ctx, (c) => capsule(c, L, open * 0.66), bloom);
      ledFill(ctx, (c) => capsule(c, R, open * 0.66), bloom);
      brow(ctx, L, -1, 0.34, bloom * 0.94);
      brow(ctx, R, 1, 0.34, bloom * 0.94);
      mouth(74, 7, 9, 4.2);
      tear(ctx, L + 1, reduced ? 0.3 : t * 0.5, bloom);
      tear(ctx, R - 1, reduced ? 0.68 : t * 0.5 + 0.46, bloom);
      break;

    case 'shock': {
      const pop = reduced ? 1 : 1 + Math.sin(t * 3.4) * 0.035;
      ledFill(ctx, (c) => capsule(c, L, open * pop, EYE_W * 1.2, EYE_H * 1.06), bloom);
      ledFill(ctx, (c) => capsule(c, R, open * pop, EYE_W * 1.2, EYE_H * 1.06), bloom);
      // The open mouth. One dot: two eyes and a dot is a face, and anything more on an LED
      // panel is a cartoon drawn on top of a robot.
      ledFill(
        ctx,
        (c) => {
          c.beginPath();
          c.ellipse(50, 77, 4.4, 5.2, 0, 0, Math.PI * 2);
        },
        bloom * 0.8,
      );
      break;
    }

    case 'angry':
      // Flattened, hooded eyes under `\/` brows driven down onto them, and a short heavy
      // mouth: rage is clenched. The brows tilt harder than sad's and sit at the same height,
      // so the inner ends come down to the eye line — which is the whole gesture.
      ledFill(ctx, (c) => bar(c, L, EYE_CY + 2, EYE_W, 11 * open, 3.6), bloom);
      ledFill(ctx, (c) => bar(c, R, EYE_CY + 2, EYE_W, 11 * open, 3.6), bloom);
      brow(ctx, L, 1, 0.46, bloom);
      brow(ctx, R, -1, 0.46, bloom);
      mouth(77, 4.4, 7, 4.8);
      break;

    case 'idle':
    default:
      ledFill(ctx, (c) => capsule(c, L, open), bloom);
      ledFill(ctx, (c) => capsule(c, R, open), bloom);
  }
}

export function Quanty({
  expression = 'idle',
  size = 32,
  bob = false,
  className = '',
  title = 'Quanty',
}: QuantyProps) {
  const paint = useCallback(
    ({ ctx, cx, cy, time, tiltX, tiltY, hover, press, reduced }: MarkFrame) => {
      const t = reduced ? 0 : time;

      ctx.save();
      markSquirclePath(ctx, cx, cy);
      ctx.clip();
      paintObsidianPlate(ctx, cx, cy, t, tiltX, tiltY);

      // The display's own light, pooled behind the eyes. Cool, because the LEDs are cool
      // white and a warm bloom under a white eye reads as a smudge; `paintObsidianPlate`
      // already lays a warm pass along the bottom-right, and that is what keeps the mascot
      // inside an ember product instead of merely next to one.
      const wake = 0.1 + hover * 0.15;
      const glass = ctx.createRadialGradient(50, EYE_CY + 3, 3, 50, EYE_CY + 3, 42);
      glass.addColorStop(0, `rgba(152, 206, 246, ${wake})`);
      glass.addColorStop(0.55, `rgba(96, 150, 200, ${wake * 0.34})`);
      glass.addColorStop(1, 'rgba(70, 120, 170, 0)');
      ctx.fillStyle = glass;
      ctx.fillRect(cx - 45, cy - 45, 90, 90);

      paintCornerNotch(ctx, cx, cy, 0.66);

      // ---- the face, as one group, so the whole display parallaxes together ----
      ctx.save();
      // Bob is drawn here rather than left to the `.qty-bob` CSS class. That class moved
      // the old SVG by a flat 5px — a quarter of the mark at size 20 and a twentieth of it
      // at 104 — whereas a buffer-space offset is the same gesture at every size. It also
      // stops for `prefers-reduced-motion` for free, because `t` is pinned to 0.
      const float = bob && !reduced ? Math.sin(t * 1.32) * 2.1 : 0;
      const lean = hover * 1.4 - press * 0.9;
      ctx.translate(tiltX * 2.6, tiltY * 2.4 + float - lean);

      // Blink and squint fold into one number, so no expression has to know about either —
      // beyond declaring, in `BLINK_FLOOR`, how far shut it is willing to go.
      const lid = Math.max(BLINK_FLOOR[expression] ?? 0, reduced ? 1 : blinkOpenness(t));
      const open = Math.max(0.06, lid * (1 - press * 0.5));
      paintFace(ctx, expression, t, open, 0.72 + hover * 0.22, reduced);
      ctx.restore();

      // The scanline grid, and the numbers here are the ones two renders forced.
      //
      // The first pass claimed a plate-wide grid was "invisible on black" and drew it at a
      // 2.6-unit pitch with 1-unit lines at 0.15 alpha. That is a 38%-dark duty cycle, and
      // at 192px it resolves to roughly 5-device-pixel banding: the obsidian plate read as
      // corduroy and the white LEDs read as striped grey, so beside QuantGit's glossy black
      // the mascot looked *matte and dusty*. A panel's scanlines are a hairline artefact you
      // notice on the lit pixels, not a weave over the whole object — so the pitch is halved,
      // the line is thinned to well under it, and the alpha is dropped.
      //
      // It is also confined to the face's own neighbourhood, because the plate's corners are
      // moulding and moulding has no scanlines. That confinement was first written as a
      // `ctx.rect` clip, which is wrong for the same reason the whole mark has no inner
      // screen rectangle: a hard-edged striped region *is* a card inside a card, whatever
      // the alpha. So the band has no edges — one gradient fades it out left and right, and
      // a quartic on the row index fades it out top and bottom, giving a flat plateau over
      // the eyes and no boundary anywhere.
      //
      // Gated at 64px: below that the 1.5-unit pitch is under one device pixel, where a grid
      // stops being a grid and simply greys the eyes down.
      if (size >= 64) {
        const top = cy - 30;
        const band = 62;
        const fade = ctx.createLinearGradient(cx - 34, 0, cx + 34, 0);
        fade.addColorStop(0, 'rgba(6, 10, 16, 0)');
        fade.addColorStop(0.2, 'rgba(6, 10, 16, 0.1)');
        fade.addColorStop(0.8, 'rgba(6, 10, 16, 0.1)');
        fade.addColorStop(1, 'rgba(6, 10, 16, 0)');
        ctx.save();
        ctx.fillStyle = fade;
        for (let y = top; y < top + band; y += 1.5) {
          const d = ((y - top) / band) * 2 - 1;
          ctx.globalAlpha = Math.max(0, 1 - d * d * d * d);
          ctx.fillRect(cx - 34, y, 68, 0.7);
        }
        ctx.restore();
      }

      // The glossy half of the sheet's "Matte + Glossy": one band travelling the plate.
      const sweep = reduced ? 0.32 : (t * 0.055 + hover * 0.45) % 1;
      paintGlossSweep(ctx, cx - 45, cy - 45, 90, 90, sweep, 0.055 + hover * 0.06);

      ctx.restore(); // plate clip
      strokeIridescentBezel(ctx, cx, cy, t, 'spectral');
    },
    [bob, expression, size],
  );

  const { canvasRef, pointerProps, repaint } = useLiveMark(paint, size);

  // Under `prefers-reduced-motion` the loop paints one frame and stops, so without this a
  // changed `expression` would leave the previous face frozen on the plate. `repaint` is
  // stable, and on a moving mark this is a single redundant frame.
  useEffect(() => {
    repaint();
  }, [expression, bob, repaint]);

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

export default Quanty;
