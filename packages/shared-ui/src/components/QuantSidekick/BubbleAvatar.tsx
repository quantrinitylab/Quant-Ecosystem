'use client';
// ============================================================================
// @quant/shared-ui - BubbleAvatar ("Quanty Ghost")
// ============================================================================
//
// The visual identity of Quanty AI across the whole ecosystem: a white ghost
// with a purple neon outline. This replaces the amber "Bubble Intelligence"
// droplet — same mount points, same props, same test ids, a different
// character (the same migration pattern as green-alien → amber-bubble).
//
// Design contract:
//   - 35 MEANINGFUL states, each tied to something the product actually does.
//     States map onto 6 visual modes: float (idle), thinking, working,
//     listening, happy, error.
//   - The ghost itself is always white + purple. The ambient GLOW behind it
//     adapts to the host app's theme via `--quanty-accent` (explicit `accent`
//     prop wins, then the parent's `--app-accent` CSS var, then ghost purple).
//   - "Feels. Understands. Builds with you."
//
// Rendering: DOM + CSS animations only (transform/opacity — GPU-composited,
// 60fps). Deliberately no canvas/rAF loop: the previous painter ran a
// per-instance requestAnimationFrame loop; CSS keyframes are cheaper, pause
// automatically off-screen, and respect `prefers-reduced-motion` natively.
// The mascot image is base64-inlined (5KB WebP) — zero extra HTTP requests,
// zero layout shift.
//
// Animations:
//   - idle/float: gentle vertical bob + glow pulse + eye blink every ~4.5s
//   - thinking: faster bob, rotating conic glow ring, no blink (focused)
//   - working: spinning dashed progress ring
//   - listening: expanding pulse rings + blink
//   - happy: joyful bounce + glow burst
//   - error: horizontal shake + dimmed glow
//
// Accessibility: `role="img"` with a state-aware aria-label — the label is
// the only channel a non-sighted user has for a state a sighted user reads
// off the motion. `data-state` carries the caller's raw status.

import React from 'react';
import { QUANTY_GHOST_WEBP_256 } from './quantyGhostImage';

// ---------------------------------------------------------------- palette --
const GHOST_PURPLE = '#A855F7';

// ------------------------------------------------------------ face types --
// Kept for API compatibility with the previous character sheet. Geometry
// fields are descriptive; the ghost's visual modes derive from the state name.
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

export interface BubbleSpec {
  eyes: EyeKind;
  eyeW?: number;
  eyeH?: number;
  gaze?: readonly [number, number];
  brow?: 1 | -1;
  mouth?: MouthKind;
  chip?: ChipKind;
  ring?: RingKind;
  progress?: number;
  burst?: boolean;
  confetti?: boolean;
  rays?: boolean;
  sweat?: boolean;
  amp?: number;
  speed?: number;
  noBlink?: boolean;
  /** Human label for the accessible name. */
  label: string;
}

/**
 * The 35-state sheet, in sheet order. Unchanged from the previous character —
 * every call site keeps its state vocabulary; only the rendering changed.
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
  options: { eyes: 'capsule', eyeH: 0.9, gaze: [4, 2], chip: 'stack', label: 'showing options' },
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
 * the sheet.
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

// ------------------------------------------------------- visual modes ------
type GhostMode = 'float' | 'thinking' | 'working' | 'listening' | 'happy' | 'error';

/** Every sheet state maps onto one of the six ghost visual modes. */
const MODE_FOR_STATE: Record<BubbleState, GhostMode> = {
  idle: 'float',
  wakeUp: 'float',
  lookAround: 'float',
  recognize: 'float',
  thinking: 'thinking',
  thinkingDeep: 'thinking',
  ideaSpark: 'happy',
  understanding: 'thinking',
  reading: 'thinking',
  analyzing: 'thinking',
  coding: 'working',
  refactoring: 'working',
  debugging: 'working',
  fixing: 'working',
  explaining: 'float',
  planning: 'thinking',
  organizing: 'float',
  creating: 'happy',
  improving: 'working',
  suggesting: 'happy',
  options: 'float',
  working: 'working',
  almostDone: 'working',
  completed: 'happy',
  success: 'happy',
  error: 'error',
  rethinking: 'error',
  needInfo: 'error',
  listening: 'listening',
  typing: 'listening',
  searching: 'working',
  syncing: 'working',
  saving: 'float',
  celebration: 'happy',
  goodbye: 'float',
};

function modeOf(state: QuantSidekickStatus | BubbleState): GhostMode {
  const sheetState: BubbleState =
    state in STATUS_TO_BUBBLE ? STATUS_TO_BUBBLE[state as QuantSidekickStatus] : (state as BubbleState);
  return MODE_FOR_STATE[sheetState] ?? 'float';
}

/** `noUncheckedIndexedAccess`-safe spec lookup (contract preserved). */
function specOf(state: QuantSidekickStatus | BubbleState): BubbleSpec {
  if (state in STATUS_TO_BUBBLE) {
    const mapped = STATUS_TO_BUBBLE[state as QuantSidekickStatus];
    return (BUBBLE_STATES[mapped] ?? BUBBLE_STATES.idle) as BubbleSpec;
  }
  return (BUBBLE_STATES[state as BubbleState] ?? BUBBLE_STATES.idle) as BubbleSpec;
}

// ------------------------------------------------------------------ css ---
const GHOST_CSS = `
.qghost-root{position:relative;display:inline-block;line-height:0;
  /* Glow accent resolution: explicit accent prop wins, then the host's
     per-app/per-route accent (--app-accent, set by QuantMail's AppShell per
     app theme), then the app's brand primary, then ghost purple.
     The ghost itself always stays white + purple. */
  --qghost-accent:var(--app-accent,var(--brand-primary,${GHOST_PURPLE}));}
.qghost-glow{position:absolute;inset:-18%;border-radius:50%;pointer-events:none;
  background:radial-gradient(circle,color-mix(in srgb,var(--qghost-accent) 38%,transparent),transparent 70%);
  filter:blur(6px);opacity:.55;animation:qghost-glow-pulse 3.4s ease-in-out infinite;}
.qghost-img{position:relative;width:100%;height:100%;border-radius:50%;object-fit:cover;display:block;
  box-shadow:0 0 0 2px color-mix(in srgb,var(--qghost-accent) 55%,transparent),0 8px 28px -6px color-mix(in srgb,var(--qghost-accent) 55%,transparent);}
.qghost-bob{width:100%;height:100%;}
.qghost-mode-float .qghost-bob{animation:qghost-float 3.4s ease-in-out infinite;}
.qghost-mode-thinking .qghost-bob{animation:qghost-think-bob 1.6s ease-in-out infinite;}
.qghost-mode-working .qghost-bob{animation:qghost-float 2.2s ease-in-out infinite;}
.qghost-mode-listening .qghost-bob{animation:qghost-float 3.4s ease-in-out infinite;}
.qghost-mode-happy .qghost-bob{animation:qghost-happy 1.8s ease-in-out infinite;}
.qghost-mode-error .qghost-bob{animation:qghost-shake .5s ease-in-out infinite;}
/* Eyelids — white covers over the ghost's dark oval eyes (measured at
   736px: L x[270,330] y[245,357], R x[405,465] y[245,357]). */
.qghost-lid{position:absolute;top:33.3%;width:8.2%;height:15.2%;background:#fdfdfd;border-radius:50%;
  transform:scaleY(0);transform-origin:center;pointer-events:none;}
.qghost-lid-l{left:36.7%;}
.qghost-lid-r{left:55%;}
.qghost-mode-float .qghost-lid,.qghost-mode-listening .qghost-lid{animation:qghost-blink 4.6s ease-in-out infinite;}
.qghost-mode-happy .qghost-lid{animation:qghost-blink 2.8s ease-in-out infinite;}
/* Thinking / working rings */
.qghost-ring{position:absolute;border-radius:50%;pointer-events:none;}
.qghost-mode-thinking .qghost-ring{inset:-7%;
  background:conic-gradient(from 0deg,transparent 0deg,var(--qghost-accent) 70deg,transparent 140deg,transparent 200deg,var(--qghost-accent) 270deg,transparent 340deg);
  -webkit-mask:radial-gradient(circle,transparent 62%,#000 63%,#000 70%,transparent 71%);
  mask:radial-gradient(circle,transparent 62%,#000 63%,#000 70%,transparent 71%);
  animation:qghost-spin 1.8s linear infinite;opacity:.9;}
.qghost-mode-working .qghost-ring{inset:-7%;border:2px dashed color-mix(in srgb,var(--qghost-accent) 75%,transparent);
  animation:qghost-spin 2.4s linear infinite;opacity:.85;}
/* Listening pulse rings */
.qghost-mode-listening .qghost-ring{inset:-4%;border:2px solid color-mix(in srgb,var(--qghost-accent) 65%,transparent);
  animation:qghost-ping 1.9s cubic-bezier(0,0,.2,1) infinite;}
.qghost-mode-listening .qghost-ring2{animation-delay:.95s;}
/* Happy burst dots */
.qghost-spark{position:absolute;width:7%;height:7%;border-radius:50%;background:var(--qghost-accent);
  opacity:0;pointer-events:none;}
.qghost-mode-happy .qghost-spark{animation:qghost-spark 1.8s ease-out infinite;}
.qghost-spark-1{left:6%;top:18%;}
.qghost-spark-2{right:4%;top:30%;animation-delay:.3s !important;}
.qghost-spark-3{left:12%;bottom:8%;animation-delay:.6s !important;}
@keyframes qghost-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-4%)}}
@keyframes qghost-think-bob{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-2.5%) scale(1.015)}}
@keyframes qghost-happy{0%,100%{transform:translateY(0) scale(1)}30%{transform:translateY(-9%) scale(1.04)}55%{transform:translateY(0) scale(.985)}75%{transform:translateY(-4%) scale(1.01)}}
@keyframes qghost-shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-3%)}75%{transform:translateX(3%)}}
@keyframes qghost-blink{0%,91%,100%{transform:scaleY(0)}94%,96%{transform:scaleY(1)}}
@keyframes qghost-glow-pulse{0%,100%{opacity:.45}50%{opacity:.75}}
@keyframes qghost-spin{to{transform:rotate(360deg)}}
@keyframes qghost-ping{0%{transform:scale(.92);opacity:.8}80%,100%{transform:scale(1.22);opacity:0}}
@keyframes qghost-spark{0%{opacity:0;transform:translateY(0) scale(.6)}25%{opacity:.95}100%{opacity:0;transform:translateY(-46%) scale(1)}}
@media (prefers-reduced-motion:reduce){
  .qghost-root *,.qghost-root{animation:none !important;}
  .qghost-glow{opacity:.5;}
}
`;

// ------------------------------------------------------------ component ---

export interface BubbleAvatarProps {
  /** A QuantSidekick status or any of the 35 sheet names. */
  state?: QuantSidekickStatus | BubbleState;
  /** Rendered square size in px. */
  size?: number;
  /** Accessible label override; a state-aware default is used otherwise. */
  label?: string;
  /**
   * Native tooltip on the root span (the old Quanty contract). Independent of
   * the accessible name.
   */
  title?: string;
  /**
   * Glow accent color override. When omitted, the parent's `--app-accent` CSS
   * variable applies (QuantMail sets it per app theme: mail orange, calendar
   * blue, drive green, contacts teal, quantgit purple); otherwise ghost
   * purple. The ghost itself always stays white + purple.
   */
  accent?: string;
  className?: string;
}

/**
 * The Quanty ghost avatar. Presentational only — the caller drives `state`.
 * Pure CSS animations (transform/opacity); no canvas, no rAF loops.
 */
export const BubbleAvatar: React.FC<BubbleAvatarProps> = ({
  state = 'idle',
  size = 56,
  label,
  title,
  accent,
  className = '',
}) => {
  const mode = modeOf(state);
  const spec = specOf(state);
  const statusWord =
    state in STATUS_TO_BUBBLE ? STATE_WORD[state as QuantSidekickStatus] : spec.label;

  return (
    <span
      className={`qghost-root qghost-mode-${mode} ${className}`}
      data-state={state}
      data-testid="quant-alien-avatar"
      role="img"
      aria-label={label ?? `Quanty AI assistant, ${statusWord}`}
      title={title}
      style={{
        width: size,
        height: size,
        ...(accent ? ({ '--qghost-accent': accent } as React.CSSProperties) : {}),
      }}
    >
      <style>{GHOST_CSS}</style>
      <span aria-hidden="true" className="qghost-glow" />
      {(mode === 'thinking' || mode === 'working') && (
        <span aria-hidden="true" className="qghost-ring" />
      )}
      {mode === 'listening' && (
        <>
          <span aria-hidden="true" className="qghost-ring" />
          <span aria-hidden="true" className="qghost-ring qghost-ring2" />
        </>
      )}
      <span className="qghost-bob">
        <img
          src={QUANTY_GHOST_WEBP_256}
          alt=""
          aria-hidden="true"
          draggable={false}
          className="qghost-img"
        />
        <span aria-hidden="true" className="qghost-lid qghost-lid-l" />
        <span aria-hidden="true" className="qghost-lid qghost-lid-r" />
      </span>
      {mode === 'happy' && (
        <>
          <span aria-hidden="true" className="qghost-spark qghost-spark-1" />
          <span aria-hidden="true" className="qghost-spark qghost-spark-2" />
          <span aria-hidden="true" className="qghost-spark qghost-spark-3" />
        </>
      )}
    </span>
  );
};

BubbleAvatar.displayName = 'BubbleAvatar';
