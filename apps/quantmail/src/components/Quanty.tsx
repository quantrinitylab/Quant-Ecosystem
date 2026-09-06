'use client';

import { useCallback, useEffect } from 'react';
import { useLiveMark, type MarkFrame } from './marks/useLiveMark';
import {
  MARK_COLORS,
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
  type FaceAccent,
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
 * **The plate is the head, and above ~56px there is a body under it.** That sentence
 * overturns nothing above it — the head is still exactly the plate described in the
 * previous paragraph, painted by exactly the same code — but the earlier build stopped
 * there, and stopping there was the defect: "एकदम वो लग रहा है जैसे एक बॉक्स बना दिया है
 * उसके अंदर आंख डाल दिया है". Two of the three reference sheets are *character* sheets
 * with limbs ("इसके पास हाथ पैर है ये सब है", "इसका पैर भी है"), and a head alone cannot
 * sit, walk or wave. So `figure` resolves to `full` at hero sizes and `badge` below, and
 * the head is run inside a `translate/scale/translate` frame rather than re-parameterised
 * — at `badge` that frame is the identity, so **every size the product actually mounts is
 * byte-identical to the head-only build by construction, not by inspection.** See
 * `FULL_FIGURE_MIN`.
 *
 * **The LEDs are no longer one colour.** The sheet's own spec block says `Face Display:
 * LED (Dynamic)`, and a dynamic display is one that changes colour; thirty-five faces in
 * one pigment was the other half of "बस एक डॉट डॉट लगा दिया है". Each face names an
 * `accent` in the sheet and every lit element on the panel takes its ramp from
 * `LED_ACCENTS` — which is one table because every lit element on this mascot, all ten eye
 * kinds and nine mouths and ten extras, routes through exactly `ledFill` and `ledStroke`.
 * None of the five accents spends a palette exception; the argument is in `faces.ts`.
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
  /**
   * Head only, or the whole character. `auto` — the default, and what all twenty-two
   * existing call sites get — resolves to `full` at `size >= FULL_FIGURE_MIN` and `badge`
   * below it, so a 22px chat avatar stays a head and a hero is a robot.
   */
  figure?: 'auto' | 'badge' | 'full';
  className?: string;
  title?: string;
}

/**
 * Where the body appears, and why it is a threshold rather than always-on.
 *
 * A full figure has to fit its head, a torso, two arms and two legs into the same
 * 100-unit buffer, so the head drops to 52 units — `52/90 = 0.578` of its badge size. At
 * a 22px mount that is a 12.7px head carrying two eyes, which is four device pixels of
 * eye at dpr 1.5: the character would be *more* detailed and *less* legible, which is the
 * wrong trade for an avatar in a message row. 56 is the crossing point measured against
 * the actual mount list — the product's Quanty is 20/22/24/26/28/34/36/40/46 nearly
 * everywhere, so **exactly one live surface crosses it** (`codehub/page.tsx` at 64) and
 * the lab hero at 104. Head in a list, character at hero, which is how every mascot in
 * this class behaves.
 */
const FULL_FIGURE_MIN = 56;

/**
 * The head's frame inside the buffer, per figure. `k` is the scale the whole head
 * pipeline runs under.
 *
 * `badge` is `{50, 50, 1}` — the identity transform — which is the point of expressing
 * this as a frame instead of threading a scale through `paintFace`, the plate, the notch
 * and the scanlines. At identity the head draws the same instructions in the same order
 * with the same numbers, so badge output is unchanged by construction. It is the same
 * discipline as `ringBloom` keeping the old expression verbatim in `canvas-mark.ts`.
 */
const HEAD_FRAME = {
  badge: { cx: 50, cy: 50, k: 1 },
  full: { cx: 50, cy: 30, k: 0.578 },
} as const;

/** Half the distance between the eyes, from the plate's centre. */
const EYE_DX = 16;
/**
 * Eye centreline. A shade above the plate's middle, because a face's eyes are not halfway
 * down it. Moved up 2 units when the eye box grew, so the extra height came off the brow
 * gap rather than out of the mouth's clearance.
 */
const EYE_CY = 46;
/**
 * The eye box: 18×32, up from 15×27.
 *
 * This is the whole of "बस एक डॉट डॉट लगा दिया है" answered in two numbers. At a 26px
 * mount, dpr 1.5, one buffer unit is 0.39 device px, so a 15×27 eye is **5.9 × 10.5
 * device pixels** — a dot, exactly as judged, and every one of the thirty-five
 * expressions was being asked to read inside it. 18×32 is 7.0 × 12.5, a 42% bigger lit
 * area, and the growth is spent where it is legible rather than everywhere: the derived
 * arches, stars, hearts and mouths below all scale with it, while `EYE_DX` holds at 16 so
 * two eyes still read as two eyes — centres 32 apart less an 18-wide capsule leaves **14
 * clear units**, and at `wide`'s widest (`shock`, `eyeW 1.2` × the kind's own 1.14 = 24.6)
 * still 7.4.
 *
 * The ceiling is not aesthetic. `alarm` wears `wide` at `eyeW 1.16`, so its right eye is
 * 18 × 1.16 × 1.14 = 23.8 wide about x 66 and ends at **77.9**; the `!` badge's bar is 6
 * wide about x 84 and starts at 81.0. **3.1 units of clearance** in the tightest pairing on
 * the sheet, and it is the binding constraint — bigger eyes than this collide with the badge.
 */
const EYE_W = 18;
const EYE_H = 32;

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
 * The five LED ramps, and the one bloom colour each spills.
 *
 * `faces.ts` argues why these five and no others; this is the pigment. Two properties are
 * worth stating because they are what keep the accents from becoming decoration:
 *
 * **Every ramp is four stops with a plateau at the top.** `core` holds from 0 to 0.26
 * before it starts falling, which is not a gradient trick — it is what a lit lens looks
 * like. A physical LED behind diffused glass has a broad flat highlight across its upper
 * third and then a fast falloff to the rim. A linear two-stop ramp reads as a painted
 * pill, and a painted pill was half of "बस एक डॉट डॉट लगा दिया है".
 *
 * **`bloom` is the ramp's own hue, not a fixed blue-white.** The spill around an eye used
 * to be `rgba(186, 226, 255, …)` for all thirty-five faces, so an ember eye would have
 * glowed cold — the one detail that would have made the whole accent axis read as a
 * filter rather than as light. Each entry carries the rgb its own edge stop implies.
 */
const LED_ACCENTS = {
  white: { core: '#FFFFFF', mid: '#F4FBFF', edge: '#C8DEEC', bloom: '186, 226, 255' },
  ember: { core: '#FFF6EE', mid: '#FFC894', edge: '#FF8C42', bloom: '255, 168, 96' },
  gold: { core: '#FFFBEC', mid: '#FFE49A', edge: '#F5B22E', bloom: '255, 206, 88' },
  hot: { core: '#FFE8D6', mid: '#FF9E58', edge: '#E8752F', bloom: '255, 132, 52' },
  cool: { core: '#F2FAFF', mid: '#CBE4F2', edge: '#9DBFD4', bloom: '150, 190, 215' },
} as const satisfies Record<FaceAccent, { core: string; mid: string; edge: string; bloom: string }>;

/** The LED's own colour: bright at the core, falling to the accent's edge at the rim. */
function ledPaint(ctx: CanvasRenderingContext2D, accent: FaceAccent): CanvasGradient {
  const led = LED_ACCENTS[accent];
  const g = ctx.createLinearGradient(0, EYE_CY - 18, 0, EYE_CY + 20);
  g.addColorStop(0, led.core);
  g.addColorStop(0.26, led.core);
  g.addColorStop(0.62, led.mid);
  g.addColorStop(1, led.edge);
  return g;
}

/**
 * Fill an eye shape as a lit LED: the white body plus a bloom around it.
 *
 * The bloom is `shadowColor`/`shadowBlur` on the fill rather than `ctx.filter`, because
 * `filter: blur()` on a 100-unit buffer costs a full-canvas pass per frame and this runs
 * on twenty mounted mascots. A shadow is one composite and it is what "emissive" actually
 * looks like on a dark plate: light spilling a short way onto the glass around the pixel.
 *
 * `glint` is the specular hit — see `glintFor`. It is drawn **clipped to the shape just
 * filled**, which is the only reason it can be a single unconditional call: a blink
 * squashes the eye body, and the clip squashes the highlight with it instead of leaving a
 * white smear floating above a shut lid.
 */
function ledFill(
  ctx: CanvasRenderingContext2D,
  build: (c: CanvasRenderingContext2D) => void,
  bloom: number,
  accent: FaceAccent,
  glint?: { x: number; y: number; r: number },
): void {
  ctx.save();
  build(ctx);
  ctx.shadowColor = `rgba(${LED_ACCENTS[accent].bloom}, ${bloom})`;
  ctx.shadowBlur = 6.5;
  ctx.fillStyle = ledPaint(ctx, accent);
  ctx.fill();
  if (glint) {
    ctx.shadowColor = 'transparent';
    ctx.clip();
    const g = ctx.createRadialGradient(glint.x, glint.y, 0.35, glint.x, glint.y, glint.r);
    g.addColorStop(0, 'rgba(255, 255, 255, 0.92)');
    g.addColorStop(0.5, 'rgba(255, 255, 255, 0.3)');
    g.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(glint.x - glint.r, glint.y - glint.r, glint.r * 2, glint.r * 2);
  }
  ctx.restore();
}

/**
 * Where the highlight sits on a filled eye.
 *
 * Up and to the left on **both** eyes, not mirrored inboard. One light source above the
 * face left is a fact about the scene; a mirrored pair of highlights is a fact about a
 * symmetry tool, and the eye reads it instantly as fake. The radius is a floor of 2.2 so
 * a `bar` eye squinting down to 10 units still gets a visible core rather than a
 * sub-pixel dot.
 */
function glintFor(
  x: number,
  cy: number,
  w: number,
  h: number,
): { x: number; y: number; r: number } {
  return { x: x - w * 0.19, y: cy - h * 0.24, r: Math.max(2.2, w * 0.36) };
}

/** The same, for the expressions whose eyes are curves rather than bodies. */
function ledStroke(
  ctx: CanvasRenderingContext2D,
  build: (c: CanvasRenderingContext2D) => void,
  width: number,
  bloom: number,
  accent: FaceAccent,
): void {
  ctx.save();
  build(ctx);
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.shadowColor = `rgba(${LED_ACCENTS[accent].bloom}, ${bloom})`;
  ctx.shadowBlur = 6.5;
  ctx.strokeStyle = ledPaint(ctx, accent);
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

/**
 * Brows: long, thin, and their own element — see `brow`.
 *
 * `BROW_CY` went 29 → 24 when the eye box grew, and the 2.5-unit gap it was tuned for is
 * preserved rather than merely approximated: the brow bar spans y 21..27 and a full-open
 * eye now tops out at 30 (29.4 for `alarm`'s `wide`), so the gap is 2.4. At the sheet's
 * hardest tilt — `angry` at 0.46 rad over a 9.5 half-length, a 4.2-unit excursion — the
 * low corner still lands on the eye, which is correct: a brow pressing onto the eye is
 * what "clenched" looks like, and that overlap predates this change.
 */
const BROW_CY = 24;
const BROW_LEN = 19;
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
  accent: FaceAccent,
): void {
  ledFill(
    ctx,
    (c) => {
      c.save();
      c.translate(x, BROW_CY);
      c.rotate(sign * tilt);
      c.translate(-x, -BROW_CY);
      bar(c, x, BROW_CY, BROW_LEN, BROW_THICK, 2.7);
      c.restore();
    },
    bloom,
    accent,
  );
}

/** A shut lid: shallow, and curving *down*, which is the difference between shut and sad. */
function shutEye(ctx: CanvasRenderingContext2D, x: number, span = 10): void {
  ctx.beginPath();
  ctx.moveTo(x - span, EYE_CY - 1);
  ctx.quadraticCurveTo(x, EYE_CY + 7, x + span, EYE_CY - 1);
}

/**
 * A tear, falling. `phase` is 0→1 down the face; it fades out over the last third so it
 * disappears into the plate's dark lower edge instead of being clipped off mid-drop.
 *
 * Sized up from a 3.1 radius, which was the only LED-visible thing separating `cry` from
 * `sorry`: both are shut eyes under a raised brow over a frown, and the tilt differs by 0.1
 * radians, so the whole distinction rested on two droplets 2.4 device px wide at 26px against
 * one sweat bead of about the same. The pair measured 16 lit pixels apart out of 110. 4.2 makes
 * the drop 3.4 device px across and 4.1 tall — still a drop, no longer a rumour. 4.6 keeps that
 * ratio against the grown eye box.
 *
 * The drop keeps its **own** gradient rather than taking the accent's, and that is deliberate
 * on the one group the accent axis is declined for (see `faces.ts` on sorrow): water is not
 * lit, it is *wet*, so it reads white-to-cool whatever the panel behind it is doing.
 */
function tear(
  ctx: CanvasRenderingContext2D,
  x: number,
  phase: number,
  bloom: number,
  accent: FaceAccent,
): void {
  const p = phase - Math.floor(phase);
  const y = EYE_CY + 15 + p * 28;
  const alpha = Math.min(1, (1 - p) * 2.4) * 0.92;
  if (alpha <= 0.02) return;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x, y - 7.4);
  ctx.quadraticCurveTo(x + 4.6, y - 2.1, x + 4.6, y + 1);
  ctx.arc(x, y + 1, 4.6, 0, Math.PI);
  ctx.quadraticCurveTo(x - 4.6, y - 2.1, x, y - 7.4);
  ctx.shadowColor = `rgba(${LED_ACCENTS[accent].bloom}, ${bloom * 0.7})`;
  ctx.shadowBlur = 5;
  const g = ctx.createLinearGradient(x - 4.4, y - 7, x + 4.4, y + 5.4);
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
const THINK_DX = [-10.5, 0, 10.5];
function thinkingDots(
  ctx: CanvasRenderingContext2D,
  t: number,
  bloom: number,
  reduced: boolean,
  accent: FaceAccent,
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
        c.arc(50 + dx, 75, 2.9 + phase * 0.9, 0, Math.PI * 2);
      },
      bloom,
      accent,
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
  accent: FaceAccent,
): void {
  const o = Math.max(0.06, open * (spec.lid ?? 1));
  const ws = spec.eyeW ?? 1;
  const hs = spec.eyeH ?? 1;
  const w = EYE_W * ws;

  switch (kind) {
    case 'arch':
      ledStroke(ctx, (c) => arcShape(c, x, EYE_CY, 14 * hs, 11 * ws), 6.8, bloom, accent);
      return;
    case 'shut':
      ledStroke(ctx, (c) => shutEye(c, x, 10 * ws), 7.2, bloom, accent);
      return;
    case 'bar': {
      const h = EYE_H * hs * o;
      ledFill(ctx, (c) => bar(c, x, EYE_CY, w, h, 3.6), bloom, accent, glintFor(x, EYE_CY, w, h));
      return;
    }
    case 'wide': {
      // The startle pulse the old `shock` arm carried, kept because a held face with no
      // motion at all reads as a frozen render rather than as a held breath.
      //
      // The 1.14 is intrinsic to the *kind*, and it is a correction. `wide` is documented as
      // "the capsule, oversized", but oversizing was left to each face's `eyeW`, and the three
      // faces that use it asked for 1.1, 1.16 and 1.2 — between 1.5 and 3 units, under one
      // device pixel at 26px. `surprised` therefore measured 25 lit pixels from `idle`, most of
      // that its mouth: the most legible expression in any face vocabulary, carried entirely by
      // a 3.4px oval. Widening the kind rather than the three records means the eye a face asks
      // for is the eye it gets, and `eyeW` goes back to being a nudge on top.
      //
      // It was 1.2 before the base eye grew to 18 and it is 1.14 now, on clearance rather than
      // taste. Two pairings bind, and both are measured in *device* pixels because that is
      // where things merge: at 26px, dpr 1.5, one unit is 0.39 px and Chrome's downscale is
      // multi-tap, so a gap under about one device pixel folds its neighbours together —
      // already observed on QuantContacts, where a 1.9-unit rim at 0.68 px was absorbed into
      // the plate beside it.
      //
      // - `alarm` (`eyeW 1.16`) against the `!` badge: 18 × 1.14 × 1.16 = 23.8 about x 66,
      //   right edge 77.9, and the bar starts at 81.0. **3.1 units = 1.2 device px.** At 1.2
      //   the edge is 78.5 and the gap falls to 2.5 units — 0.98 px, under the fold threshold.
      // - `shock` (`eyeW 1.2`), the widest on the sheet, against its own other eye: 24.6 wide
      //   on centres 32 apart leaves **7.4 units**. At 1.2 that is 6.1, and a pair of capsules
      //   2.4 device px apart is one bar.
      //
      // The eye is still 24.6 units wide at `shock` against the old build's 21.6, so nothing
      // was given back to buy this.
      //
      // Width only. Height is fixed at 32 with the brow bar sitting at y 21..27, so growing the
      // eye vertically closes a 2.4-unit gap that `alarm`'s raised brows need in order to read
      // as brows rather than as one merged smudge per side.
      const pop = reduced ? 1 : 1 + Math.sin(t * 3.4) * 0.035;
      const ww = w * 1.14;
      const h = EYE_H * hs;
      ledFill(
        ctx,
        (c) => capsule(c, x, o * pop, ww, h),
        bloom,
        accent,
        glintFor(x, EYE_CY, ww, h * o * pop),
      );
      return;
    }
    case 'droop': {
      // Two elements, for the reason `brow` is two: a heavy lid *over* a squat eye reads at
      // 26px, where one merged shape is a single smudge with no arrangement to read.
      const h = EYE_H * hs * o;
      ledFill(
        ctx,
        (c) => bar(c, x, EYE_CY + 3, w, h, 3.6),
        bloom,
        accent,
        glintFor(x, EYE_CY + 3, w, h),
      );
      ledStroke(ctx, (c) => arcShape(c, x, EYE_CY - 4, -5.8, 9.6 * ws), 3.8, bloom * 0.8, accent);
      return;
    }
    case 'star':
      ledFill(
        ctx,
        (c) => starPath(c, x, EYE_CY, 11.5 * hs, reduced ? 1 : 1 + Math.sin(t * 2.2) * 0.07),
        bloom,
        accent,
      );
      return;
    case 'heart':
      ledFill(ctx, (c) => heartPath(c, x, EYE_CY, 6.6 * ws), bloom, accent);
      return;
    case 'cross':
      ledStroke(ctx, (c) => crossPath(c, x, EYE_CY, 7.4 * ws), 5.6, bloom, accent);
      return;
    case 'spiral':
      ledStroke(
        ctx,
        (c) => spiralPath(c, x, EYE_CY, 10 * ws, reduced ? 0 : t * 1.9),
        3.6,
        bloom,
        accent,
      );
      return;
    case 'dot':
      // Small, and the face that uses it also runs `bloom` at a third — see `paintFace`. No
      // glint: a specular highlight is a claim that something is lit, and this face's whole
      // job is to say nothing is.
      ledFill(
        ctx,
        (c) => {
          c.beginPath();
          c.arc(x, EYE_CY, 3.8 * ws, 0, Math.PI * 2);
        },
        bloom,
        accent,
      );
      return;
    default: {
      const h = EYE_H * hs;
      ledFill(ctx, (c) => capsule(c, x, o, w, h), bloom, accent, glintFor(x, EYE_CY, w, h * o));
    }
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

  // Read once, here, and pass it down. The alternative — a module-level "current accent" that
  // the painters read — would work today because painting is synchronous, and would be a trap
  // the first time anything in this chain awaits.
  const accent = spec.accent ?? 'white';

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
  paintEye(ctx, left, L, open, spec, t, glow, reduced, accent);
  paintEye(ctx, right, R, open, spec, t, glow, reduced, accent);
  ctx.restore();

  if (spec.brow) {
    brow(ctx, L, spec.brow.sign, spec.brow.tilt, glow * 0.94, accent);
    brow(ctx, R, -spec.brow.sign, spec.brow.tilt, glow * 0.94, accent);
  }
  if (spec.mouth) paintMouth(ctx, spec.mouth, glow * 0.85, accent);
  if (spec.extras) paintExtras(ctx, spec.extras, t, glow, reduced, accent);
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
 *
 * Every span and weight here went up about 22% with the eye box, on the same argument: a
 * `smile` at span 8 and weight 4 is 3.1 × 1.6 device px at a 26px mount, which is not a
 * mouth, it is a mark. The mouth row's `cy` values did **not** move — the eyes came up 2
 * units instead, so the growth was paid for out of the brow gap and the eye-to-mouth
 * clearance went *up*: `frown`'s apex sits at 74 - 0.36 * 8.2 = 71.05 and its stroke reaches
 * 68.55, which is 6.55 units clear of the eye's bottom at `EYE_CY + EYE_H / 2` = 62. Measured
 * on the `sad` mount the mouth's lit box starts at y 69, so 7 units at lum >= 140.
 */
function paintMouth(
  ctx: CanvasRenderingContext2D,
  kind: MouthKind,
  bloom: number,
  accent: FaceAccent,
): void {
  const curve = (cy: number, bulge: number, span: number, width: number, x = 50) =>
    ledStroke(ctx, (c) => arcShape(c, x, cy, bulge, span), width, bloom, accent);
  const oval = (rx: number, ry: number) =>
    ledFill(
      ctx,
      (c) => {
        c.beginPath();
        c.ellipse(50, 77, rx, ry, 0, 0, Math.PI * 2);
      },
      bloom * 0.94,
      accent,
    );

  switch (kind) {
    case 'smile':
      return curve(74, -6.5, 10, 4.8);
    case 'grin':
      return curve(74, -9.5, 13.5, 6.2);
    case 'frown':
      return curve(74, 8.2, 11, 5);
    case 'smirk':
      return curve(75, -4.8, 7.5, 4.6, 53.5);
    case 'clench':
      return curve(77, 5.2, 8.5, 5.6);
    case 'wobble':
      // A squiggle: neither up nor down, which is what unease looks like.
      return ledStroke(
        ctx,
        (c) => {
          c.beginPath();
          c.moveTo(40.5, 75);
          c.quadraticCurveTo(45.5, 70.9, 50, 75);
          c.quadraticCurveTo(54.5, 79.1, 59.5, 75);
        },
        4,
        bloom,
        accent,
      );
    case 'o':
      return oval(5.2, 6.2);
    case 'gasp':
      return oval(6.6, 8.2);
    case 'flat':
    default:
      return ledFill(ctx, (c) => bar(c, 50, 75, 15.5, 3.8, 1.9), bloom, accent);
  }
}

/**
 * A sweat bead at the temple, bobbing. Built like `tear`'s droplet, but it does not fall.
 *
 * Moved out to `EYE_DX + 14` from `+ 12`, so `bx` is 80 and the teardrop spans 77.2..82.8.
 * The reason is the eye box, not the bead: at `EYE_W` 15 the right capsule ended at 73.5 and
 * the old bead at `bx` 78 started at 75.2, so it had 1.7 clear units. At 18 the capsule ends
 * at 75 and that clearance collapses to 0.2 — touching. The extra 2 units restore it to 2.2.
 * Measured on the `nervous` and `worried` mounts, a row scan at y 32 reads one run at
 * 77.5..82 (lum >= 140) against an eye run ending at 74.5, so nothing merged.
 *
 * Unlike the `!`/`?` badge column this one is nowhere near the bezel: 82.8 against the ring's
 * worst-case inner edge of 92.33 leaves 9.5 units. The badge column is the tight one.
 */
function paintSweat(
  ctx: CanvasRenderingContext2D,
  t: number,
  bloom: number,
  reduced: boolean,
  accent: FaceAccent,
): void {
  const bx = 50 + EYE_DX + 14;
  const by = EYE_CY - 14 + (reduced ? 0 : Math.sin(t * 1.6) * 1.3);
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
    accent,
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

function paintZzz(
  ctx: CanvasRenderingContext2D,
  t: number,
  bloom: number,
  reduced: boolean,
  accent: FaceAccent,
): void {
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
      accent,
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
  accent: FaceAccent,
): void {
  for (let i = 0; i < SPARKS.length; i += 1) {
    const s = SPARKS[i];
    if (!s) continue;
    const k = reduced ? 0.8 : 0.55 + (Math.sin(t * 2.1 + i * 2.2) + 1) * 0.32;
    ctx.save();
    ctx.globalAlpha = 0.35 + k * 0.65;
    ledFill(ctx, (c) => starPath(c, s.x, s.y, s.r, k), bloom * 0.8, accent);
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
 * That reasoning stands; the *count* was one short. `#FFD54A` joins the set, and it costs
 * nothing to justify: it is already a stop in the `spectral` table this comment is arguing
 * against duplicating, it sits at hue 46° inside the warm 14–60° band, and it is the exact
 * pigment `LED_ACCENTS.gold` runs — which is what `celebrate`, the **only** face carrying
 * this extra, sets its panel to. Three warm tones across nine pieces meant every third piece
 * repeated; four breaks the pattern at the size it is actually read.
 *
 * Confetti is the one thing on this panel that is **not** the display, so it does not take
 * the accent: it is drawn with flat `fillStyle`, no bloom and no ramp, because paper thrown in
 * front of a screen is lit by the room. Matching gold *by hand* to the gold the LEDs happen to
 * be running is a composition decision; taking `accent` as a parameter would make it a lighting
 * one, and then a `hot` face throwing confetti would rain orange on a red-orange panel.
 *
 * Positions are hashed off the index rather than random, so every mounted Quanty throws the
 * same pattern and none of them re-throws it on re-render.
 */
const CONFETTI_COLORS = ['#FF8C42', '#FFD54A', '#FFD9B8', '#FFFFFF'] as const;

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
 * **The measurement below is kept; its centre is not.** It read: *"Centred at 80 rather than
 * 77 because `wide` now carries its own 1.2: `alarm`'s right eye reaches x = 76.4, and a badge
 * whose bar started at 74.3 would have merged with it into one lit smudge."* That is still the
 * right test, run against an eye that has since grown — `alarm`'s right eye now ends at 77.9,
 * where a bar centred at 80 would start at 77.0 and sit **on** it. So the column moves to 84:
 * the bar spans 81.0..87.0 and the dot reaches 87.3, which clears the ring's worst-case inner
 * edge — 92.33, the capped `RING_MAX_WIDTH` case at the 20px and 24px mounts, not the hero
 * ring's 93.48 — by 5.0 units.
 *
 * 77.9 is the eye's widest point, at `EYE_CY`. At the bar's *own* row the capsule's rounded cap
 * has already turned in: a row scan at y 31 on the `alarm` mount reads the eye run ending at
 * 70.5 and the bar run at 80.5..86.5 (lum >= 140), so the real gap where they could have
 * merged is 10 units. The tight pairing is the one in `paintQuestion`, not this one.
 */
function paintExclaim(ctx: CanvasRenderingContext2D, bloom: number, accent: FaceAccent): void {
  ledFill(ctx, (c) => bar(c, 84, 31, 6, 17, 3), bloom, accent);
  ledFill(
    ctx,
    (c) => {
      c.beginPath();
      c.arc(84, 44, 3.3, 0, Math.PI * 2);
    },
    bloom,
    accent,
  );
}

/**
 * `?` beside the face. The hook runs from π to 2.5π — left, over the top, down the right and
 * round to the bottom — because with y pointing down, increasing angle is clockwise, so that
 * sweep is the top arc of a question mark and not its mirror.
 *
 * Widened for the same reason as `!`: `curious` is what `mail:newMail` shows, and at 26px a
 * 5.2-radius hook in a 3.2 stroke was 1.3 device px of line inside 4 device px of glyph —
 * measurably present, not actually readable. 6.4 in a 4.4 stroke fills the badge column.
 *
 * **This is the tightest shape on the panel and it is the one that fixes the column at 84.**
 * The hook's outer radius is 6.4 + 2.2 = 8.6, so it spans x 75.4..92.6, and both ends are
 * against something:
 *
 * - *Left*, `curious`'s own `wide` right eye — 18 × 1.14 = 20.52 about x 66, ending at 76.3.
 *   The two cross by **0.9 units**, where the previous build crossed by 3.7. The overlap is
 *   still accepted rather than eliminated (a `?` pushed fully clear would leave the plate),
 *   but it is now a touch instead of a collision.
 * - *Right*, the bezel. `ringWidthForSize` caps at 4.6 units below 26px, which puts the ring's
 *   inner edge at 92.33 at 20px and 24px — so at those two sizes the hook's outer edge sits
 *   **0.27 units inside it, which is 0.08 device px**, and at 32px and above there is real
 *   clearance (inner edge 92.55 rising to 93.48 at hero). Disclosed rather than rounded away:
 *   it is an adjacency below a tenth of a pixel, not an overlap anything can render.
 */
function paintQuestion(ctx: CanvasRenderingContext2D, bloom: number, accent: FaceAccent): void {
  ledStroke(
    ctx,
    (c) => {
      c.beginPath();
      c.arc(84, 31, 6.4, Math.PI, Math.PI * 2.5);
      c.lineTo(84, 42);
    },
    4.4,
    bloom,
    accent,
  );
  ledFill(
    ctx,
    (c) => {
      c.beginPath();
      c.arc(84, 48.5, 3.1, 0, Math.PI * 2);
    },
    bloom,
    accent,
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
 *
 * **The original's worry is kept and its numbers are re-derived**, because the eye box grew
 * underneath them: the band was `28 + p * 8` against an eye whose far corner was at r 28, and
 * `listening`'s eye is now 19.4 × 26.2 about (66, 46), whose bounding-box corner sits 29.8
 * units from the ring centre at (50, 48). So the band moves to `30 + p * 8`. The innermost
 * ring's inner edge is then 28.8 — inside that *box* corner but 2.2 units outside the capsule's
 * actual stadium outline, which is what is drawn. Outward, r tops out at 38 and the stroke
 * reaches 39.2 against the nearest plate edge at 43: **3.8 clear units**, and 1.5 even against
 * the widest bezel this mark ever strokes, so the outermost ring is never mistaken for it.
 */
function paintPulse(
  ctx: CanvasRenderingContext2D,
  t: number,
  bloom: number,
  reduced: boolean,
  accent: FaceAccent,
): void {
  for (let i = 0; i < 3; i += 1) {
    const p = reduced ? 0.08 + i * 0.34 : (t * 0.5 + i * 0.34) % 1;
    ctx.save();
    ctx.globalAlpha = (1 - p) * 0.8;
    ledStroke(
      ctx,
      (c) => {
        c.beginPath();
        c.arc(50, EYE_CY + 2, 30 + p * 8, 0, Math.PI * 2);
      },
      2.4,
      bloom,
      accent,
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
  accent: FaceAccent,
): void {
  for (const extra of extras) {
    switch (extra) {
      case 'dots':
        thinkingDots(ctx, t, bloom, reduced, accent);
        break;
      // Two beads per side, half a phase apart, so there is always a drop high on the cheek
      // *and* one near the chin. One bead per side left the face empty for the stretch after a
      // drop faded and before the next appeared, and a single bead is a leak; two in trail is
      // crying. The pair is the other half of the `sorry`/`cry` separation — `sorry`'s one
      // sweat bead sits in the badge column at (82, 32) and can now never be mistaken for it.
      case 'tears':
        tear(ctx, 50 - EYE_DX + 1, reduced ? 0.3 : t * 0.5, bloom, accent);
        tear(ctx, 50 + EYE_DX - 1, reduced ? 0.68 : t * 0.5 + 0.46, bloom, accent);
        tear(ctx, 50 - EYE_DX + 1, reduced ? 0.78 : t * 0.5 + 0.5, bloom, accent);
        tear(ctx, 50 + EYE_DX - 1, reduced ? 0.2 : t * 0.5 + 0.96, bloom, accent);
        break;
      case 'sweat':
        paintSweat(ctx, t, bloom, reduced, accent);
        break;
      case 'zzz':
        paintZzz(ctx, t, bloom, reduced, accent);
        break;
      case 'spark':
        paintSparks(ctx, t, bloom, reduced, accent);
        break;
      case 'confetti':
        paintConfetti(ctx, t, reduced);
        break;
      case 'blush':
        paintBlush(ctx);
        break;
      case 'exclaim':
        paintExclaim(ctx, bloom, accent);
        break;
      case 'question':
        paintQuestion(ctx, bloom, accent);
        break;
      case 'pulse':
        paintPulse(ctx, t, bloom, reduced, accent);
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
