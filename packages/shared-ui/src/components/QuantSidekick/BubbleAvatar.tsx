'use client';
// ============================================================================
// @quant/shared-ui - BubbleAvatar ("Bubble Intelligence")
// ============================================================================
//
// The visual identity of QuantAI across the whole ecosystem: a liquid amber
// droplet — one big blob, one small satellite bead orbiting up-right — that
// visibly reacts to what the assistant is doing. This replaces the old green
// alien: same mount points, same props, same test ids, a different character.
//
// Design contract (from the "Bubble Intelligence" character sheet):
//   - 35 MEANINGFUL states, each tied to something the product actually does
//     (not just motion for motion's sake) — idle, wake up, thinking, coding,
//     debugging, planning, listening, typing, saving, celebration, goodbye…
//   - Amber ember ramp only (`#FFD9A0 → #FF8C42 → #E8752F`): the mascot wears
//     the product's own accent, plus cream/gold for celebration. No new hues.
//   - "Feels. Understands. Builds with you." — the face is simple (dot eyes,
//     small mouth) but the *pose and props* carry the state.
//
// Rendering: Canvas 2D on a device-pixel-scaled buffer. Canvas (not WebGL) is
// deliberate: QuantSidekick can be mounted many times per page and WebGL
// contexts are a scarce browser resource (~16/page); a 2D painter gives the
// same glossy look at a fraction of the cost and works in every target
// browser. All motion is rAF-driven from refs — no per-frame React renders.
//
// Lifecycle discipline (mirrors QuantMail's useLiveMark):
//   - the loop pauses when the tab is hidden or the canvas scrolls off-screen
//   - `prefers-reduced-motion` renders one representative frame and stops
//   - each instance seeds its clock at random, so twenty mounted bubbles never
//     bob or blink in lockstep
//
// Accessibility: `role="img"` with a state-aware aria-label — the label is the
// only channel a non-sighted user has for a state a sighted user reads off the
// face. `data-state` carries the caller's raw status for styling/testing.

import React, { useEffect, useRef } from 'react';

// ---------------------------------------------------------------- palette --
const C = {
  core: '#FFD9A0',
  mid: '#FFB347',
  brand: '#FF8C42',
  deep: '#E8752F',
  rim: '#B8541C',
  ink: '#3A1C06',
  cream: '#FFF6E8',
  gold: '#FFD54A',
  hot: '#E8452F',
} as const;

// ------------------------------------------------------------ face types --
type EyeKind = 'capsule' | 'arch' | 'shut' | 'bar' | 'wide' | 'star' | 'heart';
type MouthKind = 'smile' | 'grin' | 'o' | 'gasp' | 'flat' | 'frown' | 'clench' | 'smirk' | 'wobble';
type ChipKind =
  | 'code'
  | 'search'
  | 'check'
  | 'doc'
  | 'list'
  | 'grid'
  | 'plus'
  | 'up'
  | 'bulb'
  | 'stack'
  | 'chat'
  | 'refresh'
  | 'save'
  | 'question';
type RingKind = 'orbit' | 'progress' | 'pulse' | 'spin';

/**
 * One state of the sheet. Geometry defaults to the resting pose; motion fields
 * scale the blob's idle physics. Everything optional so a state is one line.
 */
export interface BubbleSpec {
  eyes: EyeKind;
  eyeW?: number;
  eyeH?: number;
  /** Where the eyes sit, in buffer units, relative to the resting centre. */
  gaze?: readonly [number, number];
  /** Brow tilt; `1` drops the inner ends (focus/effort), `-1` raises them (worry). */
  brow?: 1 | -1;
  mouth?: MouthKind;
  chip?: ChipKind;
  ring?: RingKind;
  /** Arc sweep 0..1 for the `progress` ring (e.g. 0.88 = almost done). */
  progress?: number;
  burst?: boolean;
  confetti?: boolean;
  rays?: boolean;
  sweat?: boolean;
  /** Bob amplitude multiplier and speed multiplier. */
  amp?: number;
  speed?: number;
  /** No blink while held (states that *are* an attention state). */
  noBlink?: boolean;
  /** Human label for the accessible name. */
  label: string;
}

/**
 * The 35-state sheet, in sheet order. The first five are the canonical
 * QuantSidekick statuses (`STATUS_TO_BUBBLE` maps onto them); the rest are
 * reachable by name from any surface that wants a specific beat.
 */
export const BUBBLE_STATES = {
  // 01–05 ---------------------------------------------------------------
  idle: { eyes: 'capsule', amp: 1, speed: 1, label: 'idle' },
  wakeUp: { eyes: 'wide', eyeH: 1.1, amp: 1.5, speed: 2.2, label: 'waking up' },
  lookAround: { eyes: 'capsule', gaze: [6, -2], amp: 0.8, speed: 0.8, label: 'looking around' },
  recognize: { eyes: 'arch', mouth: 'smile', amp: 1.1, speed: 1.2, label: 'recognizes you' },
  thinking: {
    eyes: 'bar',
    eyeH: 0.42,
    gaze: [3, -5],
    mouth: 'o',
    ring: 'orbit',
    noBlink: true,
    label: 'thinking',
  },
  // 06–10 ---------------------------------------------------------------
  thinkingDeep: {
    eyes: 'bar',
    eyeH: 0.36,
    gaze: [4, -7],
    brow: 1,
    mouth: 'flat',
    ring: 'orbit',
    amp: 0.6,
    noBlink: true,
    label: 'thinking hard',
  },
  ideaSpark: { eyes: 'star', mouth: 'o', burst: true, label: 'got an idea' },
  understanding: { eyes: 'arch', ring: 'orbit', mouth: 'smile', label: 'understanding' },
  reading: { eyes: 'bar', eyeH: 0.5, gaze: [-4, 0], chip: 'doc', noBlink: true, label: 'reading' },
  analyzing: {
    eyes: 'bar',
    eyeH: 0.45,
    ring: 'spin',
    chip: 'search',
    noBlink: true,
    label: 'analyzing',
  },
  // 11–15 ---------------------------------------------------------------
  coding: { eyes: 'bar', eyeH: 0.48, mouth: 'flat', chip: 'code', noBlink: true, label: 'coding' },
  refactoring: { eyes: 'capsule', eyeH: 0.85, chip: 'refresh', label: 'refactoring' },
  debugging: { eyes: 'wide', eyeW: 0.9, gaze: [5, -3], chip: 'search', label: 'debugging' },
  fixing: { eyes: 'capsule', eyeH: 0.9, chip: 'check', label: 'fixing' },
  explaining: { eyes: 'capsule', eyeH: 0.95, chip: 'chat', label: 'speaking' },
  // 16–20 ---------------------------------------------------------------
  planning: { eyes: 'capsule', eyeH: 0.9, gaze: [-3, -3], chip: 'list', label: 'planning' },
  organizing: { eyes: 'capsule', eyeH: 0.85, chip: 'grid', label: 'organizing' },
  creating: { eyes: 'arch', chip: 'plus', label: 'creating' },
  improving: { eyes: 'capsule', eyeH: 0.9, gaze: [0, -4], chip: 'up', label: 'improving' },
  suggesting: { eyes: 'star', eyeW: 0.8, chip: 'bulb', label: 'has a suggestion' },
  // 21–25 ---------------------------------------------------------------
  options: { eyes: 'capsule', eyeH: 0.9, gaze: [4, -2], chip: 'stack', label: 'showing options' },
  working: { eyes: 'bar', eyeH: 0.45, ring: 'spin', noBlink: true, label: 'working' },
  almostDone: {
    eyes: 'capsule',
    eyeH: 0.9,
    ring: 'progress',
    progress: 0.88,
    label: 'almost done',
  },
  completed: { eyes: 'arch', mouth: 'grin', burst: true, rays: true, label: 'completed' },
  success: { eyes: 'arch', eyeW: 1.15, eyeH: 1.2, mouth: 'grin', rays: true, label: 'success' },
  // 26–30 ---------------------------------------------------------------
  error: { eyes: 'shut', brow: -1, mouth: 'frown', sweat: true, label: 'something went wrong' },
  rethinking: { eyes: 'capsule', eyeH: 0.8, gaze: [-4, -5], mouth: 'flat', label: 'reassessing' },
  needInfo: {
    eyes: 'capsule',
    eyeH: 0.9,
    chip: 'question',
    mouth: 'flat',
    label: 'needs more info',
  },
  listening: {
    eyes: 'capsule',
    eyeW: 1.05,
    eyeH: 0.85,
    ring: 'pulse',
    noBlink: true,
    label: 'listening',
  },
  typing: { eyes: 'bar', eyeH: 0.55, gaze: [-2, 2], mouth: 'flat', noBlink: true, label: 'typing' },
  // 31–35 ---------------------------------------------------------------
  searching: {
    eyes: 'bar',
    eyeH: 0.5,
    gaze: [5, -2],
    chip: 'search',
    noBlink: true,
    label: 'searching',
  },
  syncing: {
    eyes: 'capsule',
    eyeH: 0.85,
    ring: 'spin',
    chip: 'refresh',
    noBlink: true,
    label: 'syncing',
  },
  saving: { eyes: 'capsule', eyeH: 0.85, chip: 'save', label: 'saving' },
  celebration: {
    eyes: 'star',
    mouth: 'grin',
    confetti: true,
    rays: true,
    amp: 1.4,
    speed: 1.6,
    label: 'celebrating',
  },
  goodbye: { eyes: 'shut', mouth: 'smile', amp: 0.7, speed: 0.7, label: 'see you soon' },
} as const satisfies Record<string, BubbleSpec>;

export type BubbleState = keyof typeof BUBBLE_STATES;

/** Sheet order, so galleries and docs can present 01…35 by index. */
export const BUBBLE_ORDER = Object.keys(BUBBLE_STATES) as readonly BubbleState[];

/**
 * The five QuantSidekick statuses every existing call site uses, mapped onto
 * the sheet. `speaking` and `acting` are product words for `explaining` and
 * `working` — same face, the caller's vocabulary preserved.
 */
export const STATUS_TO_BUBBLE = {
  idle: 'idle',
  listening: 'listening',
  thinking: 'thinking',
  speaking: 'explaining',
  acting: 'working',
} as const satisfies Record<string, BubbleState>;

export type QuantSidekickStatus = keyof typeof STATUS_TO_BUBBLE;

const STATE_WORD: Record<QuantSidekickStatus, string> = {
  idle: 'idle',
  listening: 'listening',
  thinking: 'thinking',
  speaking: 'speaking',
  acting: 'working',
};

export interface BubbleAvatarProps {
  /** A QuantSidekick status or any of the 35 sheet names. */
  state?: QuantSidekickStatus | BubbleState;
  /** Rendered square size in px. */
  size?: number;
  /** Accessible label override; a state-aware default is used otherwise. */
  label?: string;
  /**
   * Native tooltip on the root span (the old Quanty contract). Independent of
   * the accessible name — a tooltip is a hover affordance, an aria-label is
   * the img role's entire channel.
   */
  title?: string;
  className?: string;
}

// --------------------------------------------------------- face geometry --
const CX = 46;
const CY = 55;
const R = 26;
const EYE_DX = 8.5;
const EYE_CY = 50;
const EYE_W = 6.8;
const EYE_H = 10.5;
const MOUTH_CY = 63.5;

/** `noUncheckedIndexedAccess`-safe spec lookup. */
function specOf(state: QuantSidekickStatus | BubbleState): BubbleSpec {
  if (state in STATUS_TO_BUBBLE) {
    const mapped = STATUS_TO_BUBBLE[state as QuantSidekickStatus];
    return (BUBBLE_STATES[mapped] ?? BUBBLE_STATES.idle) as BubbleSpec;
  }
  return (BUBBLE_STATES[state as BubbleState] ?? BUBBLE_STATES.idle) as BubbleSpec;
}

// ------------------------------------------------------------ painters ----

/** The liquid body: a circle breathing through three slow sine lobes. */
function blobPath(ctx: CanvasRenderingContext2D, t: number, wob: number): void {
  ctx.beginPath();
  const N = 30;
  for (let i = 0; i <= N; i += 1) {
    const a = (i / N) * Math.PI * 2;
    const w =
      1 + 0.05 * wob * Math.sin(a * 3 + t * 1.05) + 0.028 * wob * Math.sin(a * 5 - t * 0.75);
    const x = CX + Math.cos(a) * R * w;
    const y = CY + Math.sin(a) * R * w * 0.97;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/** Body + satellite: gradients, bloom, gloss. Called before the face. */
function paintBody(ctx: CanvasRenderingContext2D, t: number, amp: number): void {
  // Soft outer bloom — one shadow pass, no full-canvas blur filter.
  ctx.save();
  ctx.shadowColor = 'rgba(255, 140, 66, 0.55)';
  ctx.shadowBlur = 10;
  blobPath(ctx, t, amp);
  const body = ctx.createRadialGradient(CX - 8, CY - 10, 3, CX, CY + 4, R * 1.25);
  body.addColorStop(0, C.core);
  body.addColorStop(0.35, C.mid);
  body.addColorStop(0.75, C.brand);
  body.addColorStop(1, C.deep);
  ctx.fillStyle = body;
  ctx.fill();
  ctx.restore();

  // Rim light bottom-right (translucent light on a wet surface).
  ctx.save();
  blobPath(ctx, t, amp);
  ctx.clip();
  const rimGrad = ctx.createRadialGradient(CX + 14, CY + 16, 2, CX + 10, CY + 12, R);
  rimGrad.addColorStop(0, 'rgba(255, 213, 74, 0.5)');
  rimGrad.addColorStop(1, 'rgba(255, 213, 74, 0)');
  ctx.fillStyle = rimGrad;
  ctx.fillRect(0, 0, 100, 100);

  // Specular gloss, top-left — the "liquid" tell.
  ctx.beginPath();
  ctx.ellipse(CX - 9, CY - 13, 9.5, 5.5, -0.6, 0, Math.PI * 2);
  const gloss = ctx.createRadialGradient(CX - 9, CY - 13, 0.5, CX - 9, CY - 13, 10);
  gloss.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
  gloss.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = gloss;
  ctx.fill();

  // A second, smaller sparkle that drifts with the bob.
  const sx = CX + 6 + Math.sin(t * 0.9) * 2;
  const sy = CY - 15 - Math.sin(t * 0.7) * 1.5;
  ctx.beginPath();
  ctx.arc(sx, sy, 1.6, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.fill();
  ctx.restore();

  // Satellite bead, up-right, gently orbiting its anchor.
  const bx = 76 + Math.sin(t * 0.8) * 1.8;
  const by = 24 + Math.cos(t * 0.65) * 1.6;
  ctx.save();
  ctx.shadowColor = 'rgba(255, 140, 66, 0.5)';
  ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.arc(bx, by, 6.2, 0, Math.PI * 2);
  const bead = ctx.createRadialGradient(bx - 2, by - 2, 0.5, bx, by, 6.5);
  bead.addColorStop(0, C.core);
  bead.addColorStop(0.6, C.mid);
  bead.addColorStop(1, C.brand);
  ctx.fillStyle = bead;
  ctx.fill();
  ctx.restore();
  ctx.beginPath();
  ctx.arc(bx - 1.8, by - 1.8, 1.5, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.fill();
}

/** LED paint for the face: espresso ink so it reads as printed on amber. */
function ink(ctx: CanvasRenderingContext2D, bloom: number): void {
  ctx.shadowColor = `rgba(58, 28, 6, ${0.25 * bloom})`;
  ctx.shadowBlur = 2;
  ctx.fillStyle = C.ink;
  ctx.strokeStyle = C.ink;
}

function capsuleEye(ctx: CanvasRenderingContext2D, x: number, w: number, h: number): void {
  const hh = Math.max(1.4, h);
  ctx.beginPath();
  ctx.roundRect(x - w / 2, EYE_CY - hh / 2, w, hh, Math.min(w, hh) / 2);
}

function archEye(ctx: CanvasRenderingContext2D, x: number, bulge: number, span: number): void {
  ctx.beginPath();
  ctx.moveTo(x - span, EYE_CY + 2);
  ctx.quadraticCurveTo(x, EYE_CY - bulge, x + span, EYE_CY + 2);
}

function starEye(ctx: CanvasRenderingContext2D, x: number, r: number): void {
  const i = r * 0.28;
  ctx.beginPath();
  ctx.moveTo(x, EYE_CY - r);
  ctx.quadraticCurveTo(x + i, EYE_CY - i, x + r, EYE_CY);
  ctx.quadraticCurveTo(x + i, EYE_CY + i, x, EYE_CY + r);
  ctx.quadraticCurveTo(x - i, EYE_CY + i, x - r, EYE_CY);
  ctx.quadraticCurveTo(x - i, EYE_CY - i, x, EYE_CY - r);
  ctx.closePath();
}

function heartEye(ctx: CanvasRenderingContext2D, x: number, s: number): void {
  ctx.beginPath();
  ctx.moveTo(x, EYE_CY + s * 1.1);
  ctx.bezierCurveTo(
    x - s * 1.8,
    EYE_CY - s * 0.2,
    x - s * 0.9,
    EYE_CY - s * 1.3,
    x,
    EYE_CY - s * 0.3,
  );
  ctx.bezierCurveTo(
    x + s * 0.9,
    EYE_CY - s * 1.3,
    x + s * 1.8,
    EYE_CY - s * 0.2,
    x,
    EYE_CY + s * 1.1,
  );
  ctx.closePath();
}

function paintEye(
  ctx: CanvasRenderingContext2D,
  x: number,
  spec: BubbleSpec,
  open: number,
  t: number,
): void {
  const w = EYE_W * (spec.eyeW ?? 1);
  const h = EYE_H * (spec.eyeH ?? 1);
  ink(ctx, 1);
  switch (spec.eyes) {
    case 'arch':
      ctx.lineWidth = 2.6;
      ctx.lineCap = 'round';
      archEye(ctx, x, 5, 5.5);
      ctx.stroke();
      return;
    case 'shut':
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x - 4.5, EYE_CY - 1);
      ctx.quadraticCurveTo(x, EYE_CY + 3.4, x + 4.5, EYE_CY - 1);
      ctx.stroke();
      return;
    case 'bar':
      capsuleEye(ctx, x, w + 1.5, Math.max(2.6, h * 0.36) * open);
      ctx.fill();
      return;
    case 'wide': {
      const pop = 1 + Math.sin(t * 3.2) * 0.04;
      capsuleEye(ctx, x, w * 1.22, h * 1.08 * open * pop);
      ctx.fill();
      return;
    }
    case 'star':
      starEye(ctx, x, 5.4);
      ctx.fill();
      return;
    case 'heart':
      heartEye(ctx, x, 3.2);
      ctx.fill();
      return;
    default:
      capsuleEye(ctx, x, w, h * open);
      ctx.fill();
  }
  // Specular dot on filled eyes.
  ctx.beginPath();
  ctx.arc(x - w * 0.2, EYE_CY - h * 0.22, 1.1, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.fill();
}

function paintBrow(ctx: CanvasRenderingContext2D, x: number, sign: number): void {
  ink(ctx, 0.8);
  ctx.save();
  ctx.translate(x, EYE_CY - 9);
  ctx.rotate(sign * 0.32);
  ctx.beginPath();
  ctx.roundRect(-4.5, -1.1, 9, 2.2, 1.1);
  ctx.fill();
  ctx.restore();
}

function paintMouth(
  ctx: CanvasRenderingContext2D,
  kind: MouthKind,
  t: number,
  reduced: boolean,
): void {
  ink(ctx, 0.9);
  ctx.lineCap = 'round';
  switch (kind) {
    case 'smile':
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(CX - 5, MOUTH_CY - 1.5);
      ctx.quadraticCurveTo(CX, MOUTH_CY + 3, CX + 5, MOUTH_CY - 1.5);
      ctx.stroke();
      return;
    case 'grin': {
      ctx.beginPath();
      ctx.moveTo(CX - 6, MOUTH_CY - 2);
      ctx.quadraticCurveTo(CX, MOUTH_CY + 7, CX + 6, MOUTH_CY - 2);
      ctx.closePath();
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.beginPath();
      ctx.roundRect(CX - 6, MOUTH_CY - 2, 12, 2.2, 1);
      ctx.fillStyle = C.cream;
      ctx.fill();
      ctx.restore();
      return;
    }
    case 'o':
      ctx.beginPath();
      ctx.arc(CX, MOUTH_CY + 0.5, 2.6, 0, Math.PI * 2);
      ctx.fill();
      return;
    case 'gasp':
      ctx.beginPath();
      ctx.arc(CX, MOUTH_CY + 1, 3.6, 0, Math.PI * 2);
      ctx.fill();
      return;
    case 'flat':
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(CX - 4.5, MOUTH_CY);
      ctx.lineTo(CX + 4.5, MOUTH_CY);
      ctx.stroke();
      return;
    case 'frown':
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(CX - 4.5, MOUTH_CY + 2);
      ctx.quadraticCurveTo(CX, MOUTH_CY - 2.6, CX + 4.5, MOUTH_CY + 2);
      ctx.stroke();
      return;
    case 'clench':
      ctx.beginPath();
      ctx.roundRect(CX - 5, MOUTH_CY - 1.4, 10, 3, 1.4);
      ctx.fill();
      ctx.strokeStyle = C.mid;
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(CX - 5, MOUTH_CY);
      ctx.lineTo(CX + 5, MOUTH_CY);
      ctx.stroke();
      return;
    case 'smirk':
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(CX - 3.5, MOUTH_CY);
      ctx.quadraticCurveTo(CX + 1.5, MOUTH_CY + 3.4, CX + 5.5, MOUTH_CY - 1.6);
      ctx.stroke();
      return;
    case 'wobble': {
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      const swing = reduced ? 0 : Math.sin(t * 6) * 1.4;
      ctx.moveTo(CX - 5, MOUTH_CY + swing);
      ctx.quadraticCurveTo(CX - 2.5, MOUTH_CY - 2.4, CX, MOUTH_CY + swing * 0.4);
      ctx.quadraticCurveTo(CX + 2.5, MOUTH_CY + 2.4, CX + 5, MOUTH_CY + swing * 0.4);
      ctx.stroke();
      return;
    }
  }
}

/** The typing ellipsis: three ink dots under the eyes, lighting in sequence. */
function paintTyping(ctx: CanvasRenderingContext2D, t: number, reduced: boolean): void {
  for (let i = 0; i < 3; i += 1) {
    const phase = reduced ? (i === 1 ? 1 : 0.3) : (Math.sin(t * 3 - i * 0.9) + 1) / 2;
    ctx.globalAlpha = 0.25 + phase * 0.75;
    ctx.beginPath();
    ctx.arc(CX - 6 + i * 6, MOUTH_CY + 1, 1.7 + phase * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function paintSweat(ctx: CanvasRenderingContext2D, t: number, reduced: boolean): void {
  const p = reduced ? 0.5 : (Math.sin(t * 1.6) + 1) / 2;
  const x = CX + 13;
  const y = EYE_CY - 6 + p * 8;
  ctx.save();
  ctx.fillStyle = C.cream;
  ctx.beginPath();
  ctx.moveTo(x, y - 3.4);
  ctx.quadraticCurveTo(x + 2.2, y + 0.6, x, y + 2.2);
  ctx.quadraticCurveTo(x - 2.2, y + 0.6, x, y - 3.4);
  ctx.fill();
  ctx.restore();
}

function paintRays(ctx: CanvasRenderingContext2D, t: number, reduced: boolean): void {
  ctx.save();
  ctx.strokeStyle = C.gold;
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  const spin = reduced ? 0 : t * 0.5;
  for (let i = 0; i < 8; i += 1) {
    const a = spin + (i / 8) * Math.PI * 2;
    const r1 = R + 4;
    const r2 = R + 9;
    ctx.beginPath();
    ctx.moveTo(CX + Math.cos(a) * r1, CY + Math.sin(a) * r1 * 0.95);
    ctx.lineTo(CX + Math.cos(a) * r2, CY + Math.sin(a) * r2 * 0.95);
    ctx.stroke();
  }
  ctx.restore();
}

function paintBurst(ctx: CanvasRenderingContext2D, t: number, reduced: boolean): void {
  const p = reduced ? 0.6 : (t % 1.4) / 1.4;
  ctx.save();
  for (let i = 0; i < 7; i += 1) {
    const a = (i / 7) * Math.PI * 2 - Math.PI / 2;
    const d = 8 + p * 22;
    const x = CX + Math.cos(a) * d;
    const y = CY - 6 + Math.sin(a) * d * 0.85;
    ctx.globalAlpha = Math.max(0, 1 - p) * 0.9;
    ctx.beginPath();
    ctx.arc(x, y, 2.1 * (1 - p * 0.5), 0, Math.PI * 2);
    ctx.fillStyle = i % 2 === 0 ? C.cream : C.gold;
    ctx.fill();
  }
  ctx.restore();
}

function paintConfetti(ctx: CanvasRenderingContext2D, t: number, reduced: boolean): void {
  const colors: readonly string[] = [C.gold, C.cream, C.brand];
  ctx.save();
  for (let i = 0; i < 12; i += 1) {
    const seed = i * 2.399;
    const p = reduced ? (i * 0.13) % 1 : (t * 0.7 + i * 0.13) % 1;
    const x = 16 + ((seed * 7.3) % 68);
    const y = 6 + p * 88;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(seed + (reduced ? 0 : t * 2));
    ctx.globalAlpha = 0.5 + 0.5 * Math.sin(seed * 3);
    ctx.fillStyle = colors[i % colors.length] ?? C.gold;
    ctx.fillRect(-1.6, -2.6, 3.2, 5.2);
    ctx.restore();
  }
  ctx.restore();
}

/** Rings: understanding orbit, progress arc, listening pulse, working spin. */
function paintRing(
  ctx: CanvasRenderingContext2D,
  kind: RingKind,
  t: number,
  progress: number,
  reduced: boolean,
): void {
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 179, 71, 0.75)';
  ctx.lineCap = 'round';
  switch (kind) {
    case 'orbit': {
      ctx.lineWidth = 1.6;
      ctx.setLineDash([4, 5]);
      ctx.lineDashOffset = reduced ? 0 : -t * 14;
      ctx.beginPath();
      ctx.ellipse(CX, CY, R + 8, R + 4, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'progress': {
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.arc(CX, CY, R + 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
      ctx.stroke();
      ctx.globalAlpha = 0.25;
      ctx.beginPath();
      ctx.arc(CX, CY, R + 7, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'pulse': {
      for (let i = 0; i < 2; i += 1) {
        const p = reduced ? i * 0.5 : (t * 0.6 + i * 0.5) % 1;
        ctx.globalAlpha = (1 - p) * 0.7;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(CX, CY, R + 2 + p * 12, 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    }
    case 'spin': {
      ctx.lineWidth = 2.6;
      const a0 = reduced ? 0.4 : t * 2.4;
      ctx.beginPath();
      ctx.arc(CX, CY, R + 7, a0, a0 + Math.PI * 1.35);
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

/** The floating prop card that names a concrete verb (code, search, save…). */
function paintChip(
  ctx: CanvasRenderingContext2D,
  kind: ChipKind,
  t: number,
  reduced: boolean,
): void {
  const x = 74;
  const y = 26 + (reduced ? 0 : Math.sin(t * 1.4) * 1.8);
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.roundRect(-11, -9, 22, 18, 5);
  ctx.fillStyle = 'rgba(26, 12, 3, 0.72)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 214, 160, 0.5)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.strokeStyle = C.cream;
  ctx.fillStyle = C.cream;
  ctx.lineWidth = 1.7;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  switch (kind) {
    case 'code':
      ctx.beginPath();
      ctx.moveTo(-5.5, -3);
      ctx.lineTo(-8.5, 0);
      ctx.lineTo(-5.5, 3);
      ctx.moveTo(5.5, -3);
      ctx.lineTo(8.5, 0);
      ctx.lineTo(5.5, 3);
      ctx.moveTo(-1.8, -4);
      ctx.lineTo(1.8, 4);
      ctx.stroke();
      break;
    case 'search':
      ctx.beginPath();
      ctx.arc(-1.5, -1.5, 3.6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(1.2, 1.2);
      ctx.lineTo(5.5, 5.5);
      ctx.stroke();
      break;
    case 'check':
      ctx.beginPath();
      ctx.moveTo(-5, 0.5);
      ctx.lineTo(-1.5, 4);
      ctx.lineTo(5.5, -4);
      ctx.stroke();
      break;
    case 'doc':
      ctx.beginPath();
      ctx.roundRect(-5, -6.5, 10, 13, 1.6);
      ctx.stroke();
      for (let i = 0; i < 3; i += 1) {
        ctx.beginPath();
        ctx.moveTo(-2.8, -3 + i * 3);
        ctx.lineTo(2.8, -3 + i * 3);
        ctx.stroke();
      }
      break;
    case 'list':
      for (let i = 0; i < 3; i += 1) {
        const y0 = -4.5 + i * 4.5;
        ctx.beginPath();
        ctx.arc(-4.6, y0, 1.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-1.6, y0);
        ctx.lineTo(6, y0);
        ctx.stroke();
      }
      break;
    case 'grid':
      for (let i = 0; i < 4; i += 1) {
        ctx.beginPath();
        ctx.roundRect(-5.5 + (i % 2) * 6.5, -5.5 + Math.floor(i / 2) * 6.5, 4.5, 4.5, 1.2);
        ctx.fill();
      }
      break;
    case 'plus':
      ctx.beginPath();
      ctx.moveTo(0, -5.5);
      ctx.lineTo(0, 5.5);
      ctx.moveTo(-5.5, 0);
      ctx.lineTo(5.5, 0);
      ctx.stroke();
      break;
    case 'up':
      ctx.beginPath();
      ctx.moveTo(0, 5.5);
      ctx.lineTo(0, -5);
      ctx.moveTo(-4, -1);
      ctx.lineTo(0, -5.5);
      ctx.lineTo(4, -1);
      ctx.stroke();
      break;
    case 'bulb':
      ctx.beginPath();
      ctx.arc(0, -1.8, 3.8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-2, 3.4);
      ctx.lineTo(2, 3.4);
      ctx.moveTo(-1.4, 5.6);
      ctx.lineTo(1.4, 5.6);
      ctx.stroke();
      break;
    case 'stack':
      for (let i = 0; i < 3; i += 1) {
        ctx.globalAlpha = 1 - i * 0.28;
        ctx.beginPath();
        ctx.roundRect(-5 + i * 1.6, -6 + i * 4, 10, 4.4, 1.4);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      break;
    case 'chat':
      ctx.beginPath();
      ctx.roundRect(-6, -5.5, 12, 8.5, 2.6);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-2.5, 3);
      ctx.lineTo(-4, 6);
      ctx.lineTo(0.5, 3.2);
      ctx.stroke();
      for (let i = 0; i < 3; i += 1) {
        ctx.beginPath();
        ctx.arc(-3 + i * 3, -1.2, 0.9, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'refresh':
      ctx.beginPath();
      ctx.arc(0, 0, 4.6, 0.6, Math.PI * 1.9);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(3.4, -4.4);
      ctx.lineTo(5.6, -1.6);
      ctx.lineTo(1.8, -1.2);
      ctx.stroke();
      break;
    case 'save':
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.lineTo(0, 2);
      ctx.moveTo(-3.6, -1);
      ctx.lineTo(0, 2.4);
      ctx.lineTo(3.6, -1);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-5, 5);
      ctx.lineTo(5, 5);
      ctx.stroke();
      break;
    case 'question':
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-3, -3.4);
      ctx.quadraticCurveTo(0, -6.4, 3, -3.6);
      ctx.quadraticCurveTo(3, -1, 0, -0.4);
      ctx.moveTo(0, 2.2);
      ctx.lineTo(0, 2.6);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 5.4, 1.1, 0, Math.PI * 2);
      ctx.fill();
      break;
  }
  ctx.restore();
}

// -------------------------------------------------------------- component --

/**
 * The Bubble Intelligence avatar. Presentational only — the caller drives
 * `state` (see {@link QuantSidekick} and `useQuantSidekick`). One canvas, one
 * rAF loop, zero React renders per frame.
 */
export const BubbleAvatar: React.FC<BubbleAvatarProps> = ({
  state = 'idle',
  size = 56,
  label,
  title,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // The painter reads the live state through a ref so a changed prop can never
  // restart the loop; a pop eases the transition between faces.
  const stateRef = useRef(state);
  stateRef.current = state;
  const popRef = useRef(0);
  const prevRef = useRef(state);
  if (prevRef.current !== state) {
    prevRef.current = state;
    popRef.current = 1;
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return; // jsdom / test environments: attributes still verify.

    const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2);
    const buffer = Math.max(100, Math.ceil(size)) * dpr;
    canvas.width = buffer;
    canvas.height = buffer;
    const k = buffer / 100;

    const media =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null;
    let reduced = media?.matches ?? false;
    let onScreen = true;
    let raf: number | null = null;
    let last = 0;
    let t = Math.random() * 100; // desynced clocks across mounted bubbles

    // Peripherals (the floating prop card, rays, confetti) are the state's
    // *sentence*; the face is its word. Below ~32px there are only room for
    // words — the chip is ~5 device px of ink at a 22px mount, which reads as
    // noise beside the eyes rather than as an object. The body, bead and face
    // still render at every size.
    const detail = size >= 32;

    const draw = () => {
      const spec = specOf(stateRef.current);
      const speed = spec.speed ?? 1;
      const amp = spec.amp ?? 1;
      popRef.current = Math.max(0, popRef.current - 0.06);
      const pop = popRef.current;

      ctx.setTransform(k, 0, 0, k, 0, 0);
      ctx.clearRect(0, 0, 100, 100);

      ctx.save();
      // The whole character eases in on a state change and breathes on idle.
      const breathe = reduced ? 0 : Math.sin(t * 1.3 * speed) * 1.1 * amp;
      ctx.translate(CX, CY);
      ctx.scale(1 + pop * 0.09, 1 - pop * 0.09 + breathe * 0.004);
      ctx.translate(-CX, -CY);
      ctx.translate(0, breathe);

      if (spec.ring) paintRing(ctx, spec.ring, t, spec.progress ?? 1, reduced);
      if (spec.rays && detail) paintRays(ctx, t, reduced);
      if (spec.confetti && detail) paintConfetti(ctx, t, reduced);
      paintBody(ctx, t, amp);

      // Blink: fast d^2 shut, irregular rhythm — unless the state holds gaze.
      let open = 1;
      if (!reduced && !spec.noBlink) {
        const period = 6.4;
        const n = Math.floor(t / period);
        const jitter = Math.abs(Math.sin(n * 12.9898) * 43758.5453) % 1;
        const at = (0.3 + jitter * 0.55) * period;
        const d = (t - n * period - at) / 0.16;
        open = Math.abs(d) >= 1 ? 1 : d * d;
      }

      const [gx, gy] = spec.gaze ?? [0, 0];
      const drift = reduced || !spec.gaze ? 0 : Math.sin(t * 1.1) * 1.6;
      const L = CX - EYE_DX;
      const Rr = CX + EYE_DX;
      ctx.save();
      ctx.translate(gx + drift, gy);
      paintEye(ctx, L, spec, open, t);
      paintEye(ctx, Rr, spec, open, t);
      ctx.restore();
      if (spec.brow) {
        paintBrow(ctx, L, spec.brow);
        paintBrow(ctx, Rr, -spec.brow);
      }
      if (stateRef.current === 'typing') paintTyping(ctx, t, reduced);
      else if (spec.mouth) paintMouth(ctx, spec.mouth, t, reduced);
      if (spec.sweat) paintSweat(ctx, t, reduced);
      if (spec.burst) paintBurst(ctx, t, reduced);
      if (spec.chip && detail) paintChip(ctx, spec.chip, t, reduced);
      ctx.restore();
    };

    const step = (ts: number) => {
      const raw = last === 0 ? 16.667 : ts - last;
      last = ts;
      t += (Math.min(Math.max(raw, 1), 50) / 16.667) * 0.024;
      draw();
      raf = requestAnimationFrame(step);
    };
    const start = () => {
      if (reduced || raf !== null || !onScreen || document.hidden) return;
      last = 0;
      raf = requestAnimationFrame(step);
    };
    const stop = () => {
      if (raf === null) return;
      cancelAnimationFrame(raf);
      raf = null;
    };

    draw();
    start();

    const onMedia = () => {
      reduced = media?.matches ?? false;
      stop();
      draw();
      if (!reduced) start();
    };
    media?.addEventListener('change', onMedia);
    const onVis = () => {
      if (document.hidden) stop();
      else start();
    };
    document.addEventListener('visibilitychange', onVis);
    const io =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver((entries) => {
            const entry = entries[entries.length - 1];
            if (!entry) return;
            onScreen = entry.isIntersecting;
            if (onScreen) start();
            else stop();
          });
    io?.observe(canvas);

    return () => {
      stop();
      io?.disconnect();
      media?.removeEventListener('change', onMedia);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [size]);

  const spec = specOf(state);
  const statusWord =
    state in STATUS_TO_BUBBLE ? STATE_WORD[state as QuantSidekickStatus] : spec.label;

  return (
    <span
      className={`qbubble-root inline-block ${className}`}
      data-state={state}
      data-testid="quant-alien-avatar"
      role="img"
      aria-label={label ?? `QuantAI assistant, ${statusWord}`}
      title={title}
      style={{ width: size, height: size, lineHeight: 0 }}
    >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        style={{ width: size, height: size, display: 'block' }}
      />
    </span>
  );
};

BubbleAvatar.displayName = 'BubbleAvatar';
