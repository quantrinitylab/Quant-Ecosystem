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
import {
  eyePair,
  faceSpec,
  type EyeKind,
  type ExtraKind,
  type FaceSpec,
  type MouthKind,
  type QuantyExpression,
} from '../lib/quanty/faces';

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
 * **What this file no longer holds is the expression list.** It used to draw eight faces
 * as eight arms of a `switch`. The sheet specifies thirty-five, and thirty-five switch
 * arms is a guarantee that the fourteenth face written will not match the third: each arm
 * re-declares its own eyes, its own brow arithmetic, its own mouth. So the sheet moved to
 * `lib/quanty/faces.ts` as data — which eyes, how open, which mouth, what else is on the
 * panel — and everything below is the *one* painter that interprets a record. Adding a
 * face is now a line of data; changing what a `capsule` eye looks like changes all of
 * them. `lib/quanty/reactions.ts` maps product events onto those names, so the mascot
 * reacts to sends and failures instead of wearing whatever literal a call site passed.
 *
 * `QuantyProps` is unchanged and `QuantyExpression` is re-exported from the sheet, so all
 * twenty-two call sites keep working — the union simply got twenty-seven wider.
 */

export type { QuantyExpression };

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
 *
 * Sized up from a 3.1 radius, which was the only LED-visible thing separating `cry` from
 * `sorry`: both are shut eyes under a raised brow over a frown, and the tilt differs by 0.1
 * radians, so the whole distinction rested on two droplets 2.4 device px wide at 26px against
 * one sweat bead of about the same. The pair measured 16 lit pixels apart out of 110. 4.2 makes
 * the drop 3.4 device px across and 4.1 tall — still a drop, no longer a rumour.
 */
function tear(ctx: CanvasRenderingContext2D, x: number, phase: number, bloom: number): void {
  const p = phase - Math.floor(phase);
  const y = EYE_CY + 15 + p * 28;
  const alpha = Math.min(1, (1 - p) * 2.4) * 0.92;
  if (alpha <= 0.02) return;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x, y - 6.8);
  ctx.quadraticCurveTo(x + 4.2, y - 1.9, x + 4.2, y + 1);
  ctx.arc(x, y + 1, 4.2, 0, Math.PI);
  ctx.quadraticCurveTo(x - 4.2, y - 1.9, x, y - 6.8);
  ctx.shadowColor = `rgba(186, 226, 255, ${bloom * 0.7})`;
  ctx.shadowBlur = 5;
  const g = ctx.createLinearGradient(x - 4, y - 6.5, x + 4, y + 5);
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
 * A four-point twinkle, for the two faces that are impressed rather than merely pleased.
 *
 * Four points and not five: a five-pointed star is a *symbol* and it would be the only
 * literal pictogram anywhere on the mark, whereas a four-point sparkle with concave sides
 * is what a specular highlight actually looks like through a lens. `k` scales it about its
 * own centre so the whole shape can pulse without moving.
 */
function starPath(ctx: CanvasRenderingContext2D, x: number, cy: number, r: number, k = 1): void {
  const R = r * k;
  const i = R * 0.26;
  ctx.beginPath();
  ctx.moveTo(x, cy - R);
  ctx.quadraticCurveTo(x + i, cy - i, x + R, cy);
  ctx.quadraticCurveTo(x + i, cy + i, x, cy + R);
  ctx.quadraticCurveTo(x - i, cy + i, x - R, cy);
  ctx.quadraticCurveTo(x - i, cy - i, x, cy - R);
  ctx.closePath();
}

/** Two lobes and a point. `s` is the half-width, so the box is about 2s × 2.5s. */
function heartPath(ctx: CanvasRenderingContext2D, x: number, cy: number, s: number): void {
  ctx.beginPath();
  ctx.moveTo(x, cy + s * 1.15);
  ctx.bezierCurveTo(x - s * 1.9, cy - s * 0.3, x - s * 0.95, cy - s * 1.4, x, cy - s * 0.34);
  ctx.bezierCurveTo(x + s * 0.95, cy - s * 1.4, x + s * 1.9, cy - s * 0.3, x, cy + s * 1.15);
  ctx.closePath();
}

/** An X. Stroked, so it stays two strokes rather than becoming a filled bowtie. */
function crossPath(ctx: CanvasRenderingContext2D, x: number, cy: number, s: number): void {
  ctx.beginPath();
  ctx.moveTo(x - s, cy - s);
  ctx.lineTo(x + s, cy + s);
  ctx.moveTo(x + s, cy - s);
  ctx.lineTo(x - s, cy + s);
}

/**
 * An Archimedean spiral, 2.3 turns over 26 segments — the one eye that spins, because
 * `dizzy` is the only face whose meaning *is* the motion. Under reduced motion `phase` is
 * pinned to 0 and it stands still, which still reads as a spiral and therefore still reads
 * as dizzy; a static X or a static dot would not.
 */
function spiralPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  cy: number,
  R: number,
  phase: number,
): void {
  ctx.beginPath();
  for (let i = 0; i <= 26; i += 1) {
    const p = i / 26;
    const a = phase + p * 2.3 * Math.PI * 2;
    const px = x + Math.cos(a) * p * R;
    const py = cy + Math.sin(a) * p * R;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
}

/**
 * One eye, whichever kind the record asked for.
 *
 * `open` arrives already carrying the blink and the press-squint; `spec.lid` is the face's
 * own multiplier on top. The kinds that are *curves* rather than bodies — `arch`, `shut`,
 * and `droop`'s lid — ignore openness entirely, because a shape that is already a closed
 * lid has nothing left to close, and squashing it would only make it vanish mid-blink.
 */
function paintEye(
  ctx: CanvasRenderingContext2D,
  kind: EyeKind,
  x: number,
  open: number,
  spec: FaceSpec,
  t: number,
  bloom: number,
  reduced: boolean,
): void {
  const o = Math.max(0.06, open * (spec.lid ?? 1));
  const ws = spec.eyeW ?? 1;
  const hs = spec.eyeH ?? 1;
  const w = EYE_W * ws;

  switch (kind) {
    case 'arch':
      ledStroke(ctx, (c) => arcShape(c, x, EYE_CY, 12 * hs, 10.5 * ws), 6, bloom);
      return;
    case 'shut':
      ledStroke(ctx, (c) => shutEye(c, x, 8.5 * ws), 6.4, bloom);
      return;
    case 'bar':
      ledFill(ctx, (c) => bar(c, x, EYE_CY, w, EYE_H * hs * o, 3.2), bloom);
      return;
    case 'wide': {
      // The startle pulse the old `shock` arm carried, kept because a held face with no
      // motion at all reads as a frozen render rather than as a held breath.
      //
      // The 1.2 is intrinsic to the *kind*, and it is a correction. `wide` is documented as
      // "the capsule, oversized", but oversizing was left to each face's `eyeW`, and the three
      // faces that use it asked for 1.1, 1.16 and 1.2 — between 1.5 and 3 units, under one
      // device pixel at 26px. `surprised` therefore measured 25 lit pixels from `idle`, most of
      // that its mouth: the most legible expression in any face vocabulary, carried entirely by
      // a 3.4px oval. Widening the kind rather than the three records means the eye a face asks
      // for is the eye it gets, and `eyeW` goes back to being a nudge on top.
      //
      // Width only. Height is fixed at 27 with the brow bar sitting at y 26..32, so growing the
      // eye vertically closes a 2.5-unit gap that `alarm`'s raised brows need in order to read
      // as brows rather than as one merged smudge per side.
      const pop = reduced ? 1 : 1 + Math.sin(t * 3.4) * 0.035;
      ledFill(ctx, (c) => capsule(c, x, o * pop, w * 1.2, EYE_H * hs), bloom);
      return;
    }
    case 'droop':
      // Two elements, for the reason `brow` is two: a heavy lid *over* a squat eye reads at
      // 26px, where one merged shape is a single smudge with no arrangement to read.
      ledFill(ctx, (c) => bar(c, x, EYE_CY + 3, w, EYE_H * hs * o, 3.2), bloom);
      ledStroke(ctx, (c) => arcShape(c, x, EYE_CY - 4, -5, 8.2 * ws), 3.4, bloom * 0.8);
      return;
    case 'star':
      ledFill(
        ctx,
        (c) => starPath(c, x, EYE_CY, 10 * hs, reduced ? 1 : 1 + Math.sin(t * 2.2) * 0.07),
        bloom,
      );
      return;
    case 'heart':
      ledFill(ctx, (c) => heartPath(c, x, EYE_CY, 5.6 * ws), bloom);
      return;
    case 'cross':
      ledStroke(ctx, (c) => crossPath(c, x, EYE_CY, 6.4 * ws), 5, bloom);
      return;
    case 'spiral':
      ledStroke(ctx, (c) => spiralPath(c, x, EYE_CY, 8.8 * ws, reduced ? 0 : t * 1.9), 3.2, bloom);
      return;
    case 'dot':
      // Small, and the face that uses it also runs `bloom` at a third — see `paintFace`.
      ledFill(
        ctx,
        (c) => {
          c.beginPath();
          c.arc(x, EYE_CY, 3.2 * ws, 0, Math.PI * 2);
        },
        bloom,
      );
      return;
    default:
      ledFill(ctx, (c) => capsule(c, x, o, w, EYE_H * hs), bloom);
  }
}

/**
 * One painter, thirty-five faces.
 *
 * `open` already carries the blink and the press-squint, so a face never has to know about
 * either — it only declares, through `lid` and `blinkFloor`, how far shut it is willing to
 * go. Everything else is read straight off the record: which eyes and how big, where they
 * look, whether there are brows, which mouth, what else is on the panel, how hot the LEDs
 * run. Nothing here knows the *name* of a single expression, which is the point: `joy` and
 * `grateful` differ by two fields, and under the old switch they would have been two
 * independently drifting blocks of geometry.
 */
function paintFace(
  ctx: CanvasRenderingContext2D,
  spec: FaceSpec,
  t: number,
  open: number,
  bloom: number,
  reduced: boolean,
): void {
  const [left, right] = eyePair(spec);
  const L = 50 - EYE_DX;
  const R = 50 + EYE_DX;

  // A face's own brightness. `bloom` is only the shadow's alpha, and it cannot dim the body
  // because `ledPaint` is opaque on purpose — an LED that is off is dark, not grey. So a
  // face declaring `bloom` below 1 loses body alpha too, which is the only way `offline` can
  // be two nearly-invisible dots rather than two bright ones on a dead panel.
  const heat = spec.bloom ?? 1;
  const glow = Math.min(1, bloom * heat);
  ctx.save();
  if (heat < 1) ctx.globalAlpha = 0.35 + heat * 0.65;

  // Gaze moves the eyes within the face, and a *declared* gaze drifts: a face looking away
  // is attending to something, whereas a still off-centre stare reads as a mark that is
  // merely mis-centred — which is exactly how the old `thinking` failed. Brows stay put;
  // they belong to the expression, not to where it happens to be looking.
  const [gx, gy] = spec.gaze ?? [0, 0];
  const drift = reduced || !spec.gaze ? 0 : Math.sin(t * 1.15) * 3.2;
  ctx.save();
  ctx.translate(gx + drift, gy);
  paintEye(ctx, left, L, open, spec, t, glow, reduced);
  paintEye(ctx, right, R, open, spec, t, glow, reduced);
  ctx.restore();

  if (spec.brow) {
    brow(ctx, L, spec.brow.sign, spec.brow.tilt, glow * 0.94);
    brow(ctx, R, -spec.brow.sign, spec.brow.tilt, glow * 0.94);
  }
  if (spec.mouth) paintMouth(ctx, spec.mouth, glow * 0.85);
  if (spec.extras) paintExtras(ctx, spec.extras, t, glow, reduced);
  ctx.restore();
}

/**
 * The mouth, and the reason there is one at all: the first pass tried to carry sentiment on
 * eye curvature alone. `◡ ◡` was drawn for sad and it read as *smiling*, because a cup
 * opening upward is the universal happy-closed eye. A mouth is unambiguous.
 *
 * The nine kinds are one `arcShape` with a sign, a span and a weight, plus two filled ovals
 * for the open ones — which is deliberate, because a mouth built from its own bespoke path
 * per expression is exactly how `sad`, `cry` and `angry` drifted apart. The pairs that matter:
 * `frown` is wide, deep and soft where `clench` is short, shallow, heavy and lower, because
 * the difference between grief and rage in every drawn face is that **grief is slack and rage
 * is clenched**. `smirk` is the only asymmetric one — offset right, so it is a half-smile
 * rather than a small smile. `smile`/`grin` and `o`/`gasp` differ only in scale, which is
 * what makes them read as the same face turned up.
 */
function paintMouth(ctx: CanvasRenderingContext2D, kind: MouthKind, bloom: number): void {
  const curve = (cy: number, bulge: number, span: number, width: number, x = 50) =>
    ledStroke(ctx, (c) => arcShape(c, x, cy, bulge, span), width, bloom);
  const oval = (rx: number, ry: number) =>
    ledFill(
      ctx,
      (c) => {
        c.beginPath();
        c.ellipse(50, 77, rx, ry, 0, 0, Math.PI * 2);
      },
      bloom * 0.94,
    );

  switch (kind) {
    case 'smile':
      return curve(74, -5.5, 8, 4);
    case 'grin':
      return curve(74, -8, 11, 5.2);
    case 'frown':
      return curve(74, 7, 9, 4.2);
    case 'smirk':
      return curve(75, -4, 6, 3.8, 53);
    case 'clench':
      return curve(77, 4.4, 7, 4.8);
    case 'wobble':
      // A squiggle: neither up nor down, which is what unease looks like.
      return ledStroke(
        ctx,
        (c) => {
          c.beginPath();
          c.moveTo(42, 75);
          c.quadraticCurveTo(46, 71.6, 50, 75);
          c.quadraticCurveTo(54, 78.4, 58, 75);
        },
        3.4,
        bloom,
      );
    case 'o':
      return oval(4.4, 5.2);
    case 'gasp':
      return oval(5.6, 7);
    case 'flat':
    default:
      return ledFill(ctx, (c) => bar(c, 50, 75, 13, 3.2, 1.6), bloom);
  }
}

/** A sweat bead at the temple, bobbing. Built like `tear`'s droplet, but it does not fall. */
function paintSweat(
  ctx: CanvasRenderingContext2D,
  t: number,
  bloom: number,
  reduced: boolean,
): void {
  const bx = 50 + EYE_DX + 12;
  const by = EYE_CY - 15 + (reduced ? 0 : Math.sin(t * 1.6) * 1.3);
  ledFill(
    ctx,
    (c) => {
      c.beginPath();
      c.moveTo(bx, by - 4.6);
      c.quadraticCurveTo(bx + 2.8, by - 1.2, bx + 2.8, by + 0.7);
      c.arc(bx, by + 0.7, 2.8, 0, Math.PI);
      c.quadraticCurveTo(bx - 2.8, by - 1.2, bx, by - 4.6);
    },
    bloom * 0.85,
  );
}

/**
 * Three `Z`s climbing away from the face, lighting in sequence.
 *
 * Each is a four-point polyline rather than glyph text, because `fillText('Z')` on a
 * 100-unit buffer picks up the system font's own weight and hinting and stops matching the
 * LED stroke beside it. Placed up-and-right and verified inside the squircle: at y = 20 the
 * corner arc still allows x out to ≈93.8, and the largest `Z` ends at 89.6.
 */
const ZZZ = [
  { x: 68, y: 39, s: 3.4 },
  { x: 76, y: 30, s: 4.5 },
  { x: 84, y: 21, s: 5.6 },
] as const;

function paintZzz(ctx: CanvasRenderingContext2D, t: number, bloom: number, reduced: boolean): void {
  for (let i = 0; i < ZZZ.length; i += 1) {
    const z = ZZZ[i];
    if (!z) continue;
    const phase = reduced ? (i === 0 ? 1 : 0.3) : (Math.sin(t * 1.1 - i * 0.9) + 1) / 2;
    const h = z.s;
    ctx.save();
    ctx.globalAlpha = 0.22 + phase * 0.78;
    ledStroke(
      ctx,
      (c) => {
        c.beginPath();
        c.moveTo(z.x - h, z.y - h * 0.7);
        c.lineTo(z.x + h, z.y - h * 0.7);
        c.lineTo(z.x - h, z.y + h * 0.7);
        c.lineTo(z.x + h, z.y + h * 0.7);
      },
      2.2,
      bloom * 0.75,
    );
    ctx.restore();
  }
}

/**
 * Sparkles on the panel, off to the sides of the face so they never sit on an eye.
 *
 * Three, at different sizes, breathing out of phase — because three identical dots pulsing
 * together is a loading indicator, and `dots` already owns that reading.
 */
const SPARKS = [
  { x: 27, y: 31, r: 4.2 },
  { x: 74, y: 64, r: 3.4 },
  { x: 71, y: 25, r: 2.8 },
] as const;

function paintSparks(
  ctx: CanvasRenderingContext2D,
  t: number,
  bloom: number,
  reduced: boolean,
): void {
  for (let i = 0; i < SPARKS.length; i += 1) {
    const s = SPARKS[i];
    if (!s) continue;
    const k = reduced ? 0.8 : 0.55 + (Math.sin(t * 2.1 + i * 2.2) + 1) * 0.32;
    ctx.save();
    ctx.globalAlpha = 0.35 + k * 0.65;
    ledFill(ctx, (c) => starPath(c, s.x, s.y, s.r, k), bloom * 0.8);
    ctx.restore();
  }
}

/**
 * Confetti, and the colours are the one place this file had to argue with its own reference.
 *
 * Real confetti is a rainbow, and the mascot already carries one — the `spectral` bezel. A
 * second rainbow inside the plate competes with it and, worse, the design system has no red,
 * no blue and no green at all, so a literal rainbow here would be the only off-palette thing
 * in the suite. Ember, peach and white are what the product owns, they read as *celebration*
 * against black perfectly well, and they leave the ring as the only spectrum on the mark.
 *
 * Positions are hashed off the index rather than random, so every mounted Quanty throws the
 * same pattern and none of them re-throws it on re-render.
 */
const CONFETTI_COLORS = ['#FF8C42', '#FFD9B8', '#FFFFFF'] as const;

function paintConfetti(ctx: CanvasRenderingContext2D, t: number, reduced: boolean): void {
  for (let i = 0; i < 9; i += 1) {
    const seed = Math.abs(Math.sin((i + 1) * 12.9898) * 43758.5453) % 1;
    const p = reduced ? seed * 0.7 + 0.1 : (t * (0.22 + seed * 0.16) + seed) % 1;
    const alpha = Math.min(1, (1 - p) * 2.2) * 0.9;
    if (alpha <= 0.02) continue;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(14 + seed * 72, 10 + p * 78);
    ctx.rotate(seed * 6.28 + (reduced ? 0 : t * 2.4 * (seed > 0.5 ? 1 : -1)));
    ctx.fillStyle = CONFETTI_COLORS[i % CONFETTI_COLORS.length] ?? '#FFFFFF';
    ctx.fillRect(-1.7, -1, 3.4, 2);
    ctx.restore();
  }
}

/**
 * Blush, in ember rather than pink — which is not a compromise, it is the correct colour.
 * `paintObsidianPlate` already lays a warm `rgba(255,140,66,0.22)` pass along the bottom
 * right, so a warm bloom low on the panel belongs to the material; pink would be the only
 * hue on the mascot that exists nowhere else in the product.
 */
function paintBlush(ctx: CanvasRenderingContext2D): void {
  for (const x of [50 - EYE_DX, 50 + EYE_DX]) {
    const g = ctx.createRadialGradient(x, EYE_CY + 15, 0.5, x, EYE_CY + 15, 9.5);
    g.addColorStop(0, 'rgba(255, 140, 66, 0.28)');
    g.addColorStop(1, 'rgba(255, 140, 66, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - 10, EYE_CY + 5, 20, 20);
  }
}

/**
 * `!` beside the face: a bar and a dot, both lit.
 *
 * Sized off the 26px raster rather than the 104px one. The badge column has clear plate from
 * x ≈ 66 to x ≈ 92 — at y = 32 the squircle's corner arc still allows x out to 94.4 — and the
 * first pass used barely half of it, which at 26px left `alarm` and `error` announcing
 * themselves with a mark 1.6 device px wide. Nothing about the composition wanted it small.
 *
 * Centred at 80 rather than 77 because `wide` now carries its own 1.2: `alarm`'s right eye
 * reaches x = 76.4, and a badge whose bar started at 74.3 would have merged with it into one
 * lit smudge. 80 puts the bar at 77.3..82.7 — clear of the eye, and 88.7 at the dot's widest
 * still leaves five units before the bezel.
 */
function paintExclaim(ctx: CanvasRenderingContext2D, bloom: number): void {
  ledFill(ctx, (c) => bar(c, 80, 31, 5.4, 15.5, 2.7), bloom);
  ledFill(
    ctx,
    (c) => {
      c.beginPath();
      c.arc(80, 43.5, 3, 0, Math.PI * 2);
    },
    bloom,
  );
}

/**
 * `?` beside the face. The hook runs from π to 2.5π — left, over the top, down the right and
 * round to the bottom — because with y pointing down, increasing angle is clockwise, so that
 * sweep is the top arc of a question mark and not its mirror.
 *
 * Widened for the same reason as `!`: `curious` is what `mail:newMail` shows, and at 26px a
 * 5.2-radius hook in a 3.2 stroke was 1.3 device px of line inside 4 device px of glyph —
 * measurably present, not actually readable. 6.6 and 4.2 fill the badge column properly, and
 * the move to 80 pulls the hook off `curious`'s own `wide` right eye: the two shapes still
 * overlap, but by 3.7 units instead of 6.4, so the mark reads beside the eye rather than on it.
 */
function paintQuestion(ctx: CanvasRenderingContext2D, bloom: number): void {
  ledStroke(
    ctx,
    (c) => {
      c.beginPath();
      c.arc(80, 31, 6.6, Math.PI, Math.PI * 2.5);
      c.lineTo(80, 41);
    },
    4.2,
    bloom,
  );
  ledFill(
    ctx,
    (c) => {
      c.beginPath();
      c.arc(80, 47.5, 2.9, 0, Math.PI * 2);
    },
    bloom,
  );
}

/**
 * Rings breathing outward from the face — `listening`, and the one extra that is a
 * *microphone* rather than an emotion.
 *
 * The first draft was two rings at `19 + p * 17` units, 1.6 wide, peaking at `alpha 0.5`,
 * and rasterising the sheet at 26px measured it invisible: `listening` differed from `idle`
 * by **4 lit pixels out of 1089** — the same face, for a state that latches for fifteen
 * seconds. Two geometric causes, neither a matter of taste:
 *
 * - **The brightest phase was hidden.** `p` starts at 0, so the ring was most opaque at
 *   r = 19, and an eye at x = 34 reaches r = 28 at its far corner. The one frame worth
 *   seeing was drawn under the eyes; by the time the ring reached clear plate it had faded
 *   to nothing.
 * - **Two rings half a cycle apart leaves a hole.** At `p` and `p + 0.5` there is no
 *   instant where either is near its peak — the pair spends the whole cycle mid-fade.
 *
 * So: three rings a third of a cycle apart, which guarantees one is always above
 * `alpha 0.53`; a band starting outside the eye corners rather than inside them; and 2.4
 * units of width, which is 0.62 device px at 26 — thin, but a line rather than a rumour.
 * The original's worry was right and is kept: r tops out at 36 of the plate's 45, so nine
 * clear units separate the outermost ring from the bezel it must not be mistaken for.
 */
function paintPulse(
  ctx: CanvasRenderingContext2D,
  t: number,
  bloom: number,
  reduced: boolean,
): void {
  for (let i = 0; i < 3; i += 1) {
    const p = reduced ? 0.08 + i * 0.34 : (t * 0.5 + i * 0.34) % 1;
    ctx.save();
    ctx.globalAlpha = (1 - p) * 0.8;
    ledStroke(
      ctx,
      (c) => {
        c.beginPath();
        c.arc(50, EYE_CY + 2, 28 + p * 8, 0, Math.PI * 2);
      },
      2.4,
      bloom,
    );
    ctx.restore();
  }
}

/**
 * Everything else on the panel, drawn over the face in the order the record lists it — so a
 * face wanting confetti behind its sparks writes them in that order rather than arguing with
 * a hardcoded z-stack here.
 */
function paintExtras(
  ctx: CanvasRenderingContext2D,
  extras: readonly ExtraKind[],
  t: number,
  bloom: number,
  reduced: boolean,
): void {
  for (const extra of extras) {
    switch (extra) {
      case 'dots':
        thinkingDots(ctx, t, bloom, reduced);
        break;
      // Two beads per side, half a phase apart, so there is always a drop high on the cheek
      // *and* one near the chin. One bead per side left the face empty for the stretch after a
      // drop faded and before the next appeared, and a single bead is a leak; two in trail is
      // crying. The pair is the other half of the `sorry`/`cry` separation — `sorry`'s one
      // sweat bead sits in the badge column at (78, 33) and can now never be mistaken for it.
      case 'tears':
        tear(ctx, 50 - EYE_DX + 1, reduced ? 0.3 : t * 0.5, bloom);
        tear(ctx, 50 + EYE_DX - 1, reduced ? 0.68 : t * 0.5 + 0.46, bloom);
        tear(ctx, 50 - EYE_DX + 1, reduced ? 0.78 : t * 0.5 + 0.5, bloom);
        tear(ctx, 50 + EYE_DX - 1, reduced ? 0.2 : t * 0.5 + 0.96, bloom);
        break;
      case 'sweat':
        paintSweat(ctx, t, bloom, reduced);
        break;
      case 'zzz':
        paintZzz(ctx, t, bloom, reduced);
        break;
      case 'spark':
        paintSparks(ctx, t, bloom, reduced);
        break;
      case 'confetti':
        paintConfetti(ctx, t, reduced);
        break;
      case 'blush':
        paintBlush(ctx);
        break;
      case 'exclaim':
        paintExclaim(ctx, bloom);
        break;
      case 'question':
        paintQuestion(ctx, bloom);
        break;
      case 'pulse':
        paintPulse(ctx, t, bloom, reduced);
        break;
    }
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
      const spec = faceSpec(expression);

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

      // Blink and squint fold into one number, so no face has to know about either — it only
      // declares, through `lid` and `blinkFloor`, how far shut it is willing to go.
      //
      // `blinkFloor` is not a nicety. `shock` is a *held* state, and the 104px expression
      // sheet caught one canvas about 0.1 s into a blink: its two wide eyes rendered as two
      // horizontal dashes, which reads as bored, not startled. With seventeen mascots mounted
      // on that page and a ~6% blink duty cycle, a broken frame in the sheet was arithmetic
      // rather than bad luck — and the same arithmetic applies to every screenshot anyone
      // ever takes of this product. So a face frozen mid-gasp declares a floor of 1 and does
      // not blink at all. `thinking`'s eyes are already slits, where a blink has nothing left
      // to close and only makes them vanish, so it declares a partial floor. Everything else
      // blinks freely: `sad`, eyes shut under `/\` brows, is *more* sad, not broken.
      const lid = Math.max(spec.blinkFloor ?? 0, reduced ? 1 : blinkOpenness(t));
      const open = Math.max(0.06, lid * (1 - press * 0.5));
      paintFace(ctx, spec, t, open, 0.72 + hover * 0.22, reduced);
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
      strokeIridescentBezel(ctx, cx, cy, t, 'spectral', size);
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

  // The accessible name carries the expression, because `role="img"` is the *only* channel a
  // non-sighted user has for a state a sighted one reads straight off the panel: "Quanty —
  // thinking" is information, not decoration. `title` stays the bare product name so the
  // tooltip does not turn into a running commentary on hover.
  const face = faceSpec(expression);

  return (
    <span
      role="img"
      aria-label={`${title} — ${face.label}`}
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
