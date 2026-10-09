/**
 * The QuantGit voxel-frog scene, painted on the shared Canvas 2D live-mark
 * pipeline (`useLiveMark`).
 *
 * WHY CANVAS 2D AND NOT THREE.JS. The audit found no mesh-based 3D anywhere in
 * the frontend: the ecosystem's marks are either Canvas 2D live paintings or
 * WebGL2 SDF raymarches. Voxel art is natively orthographic — every voxel is a
 * small set of flat shaded faces — so the scene is stored as genuine 3D voxel
 * data (integer x/y/z grid) and projected per frame with a slight pointer-
 * driven parallax rotation. Nothing here is a flattened image: the frog is
 * rebuilt from its voxel map on every frame, blinks by morphing its eye
 * voxels, and its smoke is animated noise.
 *
 * Coordinate space: the family's 100-unit mark space. Voxels are VOXEL units on
 * a side; x is right, y is UP, z is toward the viewer. The painter sorts runs
 * back-to-front (z ascending, y descending) so faces overlap correctly.
 */

import { markSquirclePath, paintGlossSweep } from '../../lib/marks/canvas-mark';
import type { MarkFrame } from './useLiveMark';

// ---------------------------------------------------------------------------
// Palette — the approved purple voxel identity.
// ---------------------------------------------------------------------------

const C = {
  body: '#8B46D9',
  bodyLight: '#A75FF0',
  bodyDark: '#5B21B6',
  arm: '#7C3AED',
  belly: '#DCD4FC',
  bellyLight: '#ECE8FE',
  socket: '#9D55EC',
  eyeWhite: '#F5F2FF',
  pupil: '#160B26',
  glint: '#FFFFFF',
  nostril: '#2A1545',
  laptop: '#1C1526',
  laptopEdge: '#33264A',
  laptopDark: '#120D1A',
  key: '#3A2C52',
  accent: '#CFC6F2',
  plateA: '#0F0919',
  plateB: '#070409',
} as const;

/** Multiply a hex colour by `f` (f > 1 lightens). No allocation beyond the string. */
export function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, Math.round(((n >> 16) & 255) * f)));
  const g = Math.min(255, Math.max(0, Math.round(((n >> 8) & 255) * f)));
  const b = Math.min(255, Math.max(0, Math.round((n & 255) * f)));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

// ---------------------------------------------------------------------------
// Voxel data. Boxes are the design language: each entry is deliberate.
// ---------------------------------------------------------------------------

type Role =
  | 'body'
  | 'belly'
  | 'eye-socket'
  | 'eye-white'
  | 'pupil'
  | 'glint'
  | 'detail'
  | 'laptop'
  | 'laptop-accent';

interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
  color: string;
  role: Role;
}

/**
 * The frog, as boxes on an integer grid. y is up, z toward the viewer.
 * Symmetric about x = -0.5/+0.5 (even-width centre) — the build step asserts it.
 */
const BOXES: Box[] = [
  // ---- head (z 0..1) ----
  // A low, dark brow between the eye stalks — the valley that keeps the two
  // eyes reading as two bumps, not a visor. Nothing above it: the notch is real.
  { x0: -3, x1: 3, y0: 11, y1: 11, z0: 0, z1: 1, color: C.bodyDark, role: 'body' }, // brow valley
  { x0: -5, x1: 5, y0: 10, y1: 10, z0: 0, z1: 1, color: C.body, role: 'body' }, // forehead
  { x0: -7, x1: 7, y0: 9, y1: 9, z0: 0, z1: 1, color: C.body, role: 'body' }, // mid
  { x0: -8, x1: 8, y0: 7, y1: 8, z0: 0, z1: 1, color: C.body, role: 'body' }, // wide
  { x0: -7, x1: 7, y0: 6, y1: 6, z0: 0, z1: 1, color: C.body, role: 'body' }, // cheeks
  { x0: -5, x1: 5, y0: 5, y1: 5, z0: 0, z1: 1, color: C.body, role: 'body' }, // jaw
  // head side shading — darker voxels on the shadow-facing flanks
  { x0: -8, x1: -8, y0: 7, y1: 8, z0: 0, z1: 1, color: C.bodyDark, role: 'body' },
  { x0: 8, x1: 8, y0: 7, y1: 8, z0: 0, z1: 1, color: C.bodyDark, role: 'body' },
  // nostrils sit one layer proud of the face so they read as inlay
  { x0: -1, x1: -1, y0: 9, y1: 9, z0: 2, z1: 2, color: C.nostril, role: 'detail' },
  { x0: 1, x1: 1, y0: 9, y1: 9, z0: 2, z1: 2, color: C.nostril, role: 'detail' },

  // ---- eye assemblies: raised sockets, pale whites, dark pupils ----
  { x0: -7, x1: -4, y0: 11, y1: 13, z0: 1, z1: 2, color: C.socket, role: 'eye-socket' },
  { x0: 4, x1: 7, y0: 11, y1: 13, z0: 1, z1: 2, color: C.socket, role: 'eye-socket' },
  { x0: -6, x1: -4, y0: 11, y1: 12, z0: 2, z1: 3, color: C.eyeWhite, role: 'eye-white' },
  { x0: 4, x1: 6, y0: 11, y1: 12, z0: 2, z1: 3, color: C.eyeWhite, role: 'eye-white' },
  { x0: -5, x1: -5, y0: 11, y1: 12, z0: 3, z1: 3, color: C.pupil, role: 'pupil' },
  { x0: 5, x1: 5, y0: 11, y1: 12, z0: 3, z1: 3, color: C.pupil, role: 'pupil' },
  // pixel highlights, top-outer corner of each eye
  { x0: -6, x1: -6, y0: 12, y1: 12, z0: 3, z1: 3, color: C.glint, role: 'glint' },
  { x0: 6, x1: 6, y0: 12, y1: 12, z0: 3, z1: 3, color: C.glint, role: 'glint' },

  // ---- body (z 0..1) ----
  { x0: -5, x1: 5, y0: 4, y1: 4, z0: 0, z1: 1, color: C.body, role: 'body' },
  { x0: -6, x1: 6, y0: 3, y1: 3, z0: 0, z1: 1, color: C.body, role: 'body' },
  { x0: -7, x1: 7, y0: 2, y1: 2, z0: 0, z1: 1, color: C.body, role: 'body' },
  { x0: -6, x1: 6, y0: 1, y1: 1, z0: 0, z1: 1, color: C.bodyDark, role: 'body' },
  // belly — pale lavender, proud of the body, with a lighter centre stripe.
  // It runs up to the chin, the way the reference's pale chest meets the jaw.
  { x0: -3, x1: 3, y0: 2, y1: 5, z0: 2, z1: 2, color: C.belly, role: 'belly' },
  { x0: -1, x1: 1, y0: 2, y1: 4, z0: 2, z1: 2, color: C.bellyLight, role: 'belly' },

  // ---- arms reaching around the laptop ----
  { x0: -8, x1: -7, y0: 2, y1: 3, z0: 0, z1: 1, color: C.arm, role: 'body' },
  { x0: 7, x1: 8, y0: 2, y1: 3, z0: 0, z1: 1, color: C.arm, role: 'body' },
  { x0: -7, x1: -6, y0: 1, y1: 1, z0: 1, z1: 2, color: C.arm, role: 'body' },
  { x0: 6, x1: 7, y0: 1, y1: 1, z0: 1, z1: 2, color: C.arm, role: 'body' },

  // ---- feet ----
  { x0: -8, x1: -7, y0: 0, y1: 0, z0: 0, z1: 1, color: C.bodyDark, role: 'body' },
  { x0: 7, x1: 8, y0: 0, y1: 0, z0: 0, z1: 1, color: C.bodyDark, role: 'body' },

  // ---- laptop: dark charcoal lid in front, keyboard base below ----
  { x0: -7, x1: 7, y0: 1, y1: 3, z0: 3, z1: 4, color: C.laptop, role: 'laptop' },
  // caught light along the lid's top edge
  { x0: -7, x1: 7, y0: 3, y1: 3, z0: 3, z1: 4, color: C.laptopEdge, role: 'laptop' },
  // restrained silver pixel accents on the lid, like the reference
  { x0: -4, x1: -4, y0: 2, y1: 2, z0: 4, z1: 4, color: C.accent, role: 'laptop-accent' },
  { x0: -2, x1: -2, y0: 1, y1: 1, z0: 4, z1: 4, color: C.accent, role: 'laptop-accent' },
  { x0: 0, x1: 0, y0: 2, y1: 2, z0: 4, z1: 4, color: C.accent, role: 'laptop-accent' },
  { x0: 2, x1: 3, y0: 1, y1: 1, z0: 4, z1: 4, color: C.accent, role: 'laptop-accent' },
  // keyboard base, deeper and forward
  { x0: -7, x1: 7, y0: 0, y1: 1, z0: 3, z1: 5, color: C.laptopDark, role: 'laptop' },
  { x0: -5, x1: 5, y0: 0, y1: 0, z0: 5, z1: 5, color: C.key, role: 'laptop-accent' },
];

export interface VoxelRun {
  x0: number;
  x1: number;
  y: number;
  z: number;
  color: string;
  role: Role;
}

/** Expand boxes to cells; later boxes overwrite earlier ones (inlay semantics). Exported for tests. */
export function getFrogCells(): Map<string, { color: string; role: Role }> {
  const cells = new Map<string, { color: string; role: Role }>();
  for (const b of BOXES) {
    for (let x = b.x0; x <= b.x1; x++) {
      for (let y = b.y0; y <= b.y1; y++) {
        for (let z = b.z0; z <= b.z1; z++) {
          cells.set(`${x},${y},${z}`, { color: b.color, role: b.role });
        }
      }
    }
  }
  return cells;
}

/**
 * Expand boxes into per-row runs, merging adjacent same-color voxels so one
 * `fillRect` covers a whole row. Sorted back-to-front (z asc, y desc); x order
 * is irrelevant inside a layer. Built once at module load.
 */
function buildRuns(): VoxelRun[] {
  const cells = getFrogCells();
  // Group by (y, z, color, role), then merge x runs.
  const rows = new Map<string, number[]>();
  for (const [key, v] of cells) {
    const [x, y, z] = key.split(',').map(Number);
    const rowKey = `${y},${z},${v.color},${v.role}`;
    const xs = rows.get(rowKey);
    if (xs) xs.push(x!);
    else rows.set(rowKey, [x!]);
  }
  const runs: VoxelRun[] = [];
  for (const [rowKey, xs] of rows) {
    const [y, z, color, role] = rowKey.split(',');
    xs.sort((a, b) => a - b);
    let start = xs[0]!;
    let prev = xs[0]!;
    const flush = (end: number): void => {
      runs.push({ x0: start, x1: end, y: Number(y), z: Number(z), color, role: role as Role });
    };
    for (let i = 1; i < xs.length; i++) {
      if (xs[i]! === prev + 1) {
        prev = xs[i]!;
      } else {
        flush(prev);
        start = xs[i]!;
        prev = xs[i]!;
      }
    }
    flush(prev);
  }
  runs.sort((a, b) => a.z - b.z || b.y - a.y || a.x0 - b.x0);
  return runs;
}

export const FROG_RUNS: VoxelRun[] = buildRuns();

/**
 * The frog (everything but the deliberately scattered laptop pixel accents) is
 * symmetric about the vertical centre line x = 0. The accents are scattered on
 * purpose — like the reference — so they are excluded from the check.
 */
export function isSymmetric(): boolean {
  const cells = getFrogCells();
  for (const [key, v] of cells) {
    if (v.role === 'laptop-accent') continue;
    const [x, y, z] = key.split(',').map(Number);
    const mirror = cells.get(`${-x!},${y},${z}`);
    // The scattered accents are excluded on both sides: an accent overwrites
    // whatever was beneath it, so its mirror keeps the base colour.
    if (mirror?.role === 'laptop-accent') continue;
    if (!mirror || mirror.color !== v.color) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Blink state machine — genuine animated eyes, never a flash.
// ---------------------------------------------------------------------------

export interface BlinkState {
  /** Monotonic seconds at which the next blink starts. */
  nextBlinkAt: number;
  /** Monotonic seconds at which the current blink started, or -1. */
  blinkStart: number;
}

export const BLINK_CLOSE_S = 0.09;
export const BLINK_HOLD_S = 0.05;
export const BLINK_OPEN_S = 0.14;
const BLINK_IDLE_MIN_S = 2.2;
const BLINK_IDLE_MAX_S = 5.2;

export function createBlinkState(nowS: number, random: () => number = Math.random): BlinkState {
  return {
    nextBlinkAt: nowS + BLINK_IDLE_MIN_S + random() * (BLINK_IDLE_MAX_S - BLINK_IDLE_MIN_S),
    blinkStart: -1,
  };
}

function smooth(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

/**
 * Advance the blink machine to `nowS` and return the lid amount 0 (open) → 1
 * (closed). Mutates `state`. Deterministic for a given (nowS, random) sequence,
 * so tests can drive it exactly.
 */
export function blinkAmount(
  state: BlinkState,
  nowS: number,
  random: () => number = Math.random,
): number {
  if (state.blinkStart >= 0) {
    const age = nowS - state.blinkStart;
    const total = BLINK_CLOSE_S + BLINK_HOLD_S + BLINK_OPEN_S;
    if (age >= total) {
      state.blinkStart = -1;
      state.nextBlinkAt = nowS + BLINK_IDLE_MIN_S + random() * (BLINK_IDLE_MAX_S - BLINK_IDLE_MIN_S);
      return 0;
    }
    if (age < BLINK_CLOSE_S) return smooth(age / BLINK_CLOSE_S);
    if (age < BLINK_CLOSE_S + BLINK_HOLD_S) return 1;
    return 1 - smooth((age - BLINK_CLOSE_S - BLINK_HOLD_S) / BLINK_OPEN_S);
  }
  if (nowS >= state.nextBlinkAt) {
    state.blinkStart = nowS;
    return 0;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Smoke — precomputed value-noise blobs, drifted per frame. No per-frame
// allocation: two canvases built once, drawn with offsets.
// ---------------------------------------------------------------------------

let smokeA: HTMLCanvasElement | null = null;
let smokeB: HTMLCanvasElement | null = null;

function makeSmoke(tintTop: string, tintBottom: string, seed: number): HTMLCanvasElement {
  const S = 180;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  // Low-res random field, blurred up — organic blobs, not circles.
  let s = seed;
  const rand = (): number => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  const N = 14;
  const field = document.createElement('canvas');
  field.width = N;
  field.height = N;
  const fctx = field.getContext('2d');
  if (fctx) {
    const img = fctx.createImageData(N, N);
    for (let i = 0; i < N * N; i++) {
      const v = rand();
      img.data[i * 4] = 255;
      img.data[i * 4 + 1] = 255;
      img.data[i * 4 + 2] = 255;
      img.data[i * 4 + 3] = Math.round(40 + v * 160);
    }
    fctx.putImageData(img, 0, 0);
  }
  ctx.filter = 'blur(10px)';
  ctx.drawImage(field, 0, 0, S, S);
  ctx.filter = 'none';
  // Tint through the noise alpha; fade the edges so layers tile invisibly.
  ctx.globalCompositeOperation = 'source-in';
  const g = ctx.createLinearGradient(0, 0, 0, S);
  g.addColorStop(0, tintTop);
  g.addColorStop(1, tintBottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return canvas;
}

function smokeCanvases(): { a: HTMLCanvasElement; b: HTMLCanvasElement } | null {
  if (typeof document === 'undefined') return null;
  if (!smokeA) smokeA = makeSmoke('rgba(139,92,246,0.85)', 'rgba(76,29,149,0.55)', 1234567);
  if (!smokeB) smokeB = makeSmoke('rgba(109,40,217,0.7)', 'rgba(46,16,101,0.5)', 7654321);
  return { a: smokeA, b: smokeB };
}

// ---------------------------------------------------------------------------
// Projection + painting.
// ---------------------------------------------------------------------------

const VOXEL = 4.1; // mark units per voxel
const EYE_CENTER_Y = 11.5; // vertical centre of the eye rows (11..12)

function project(
  ix: number,
  iy: number,
  iz: number,
  tiltX: number,
  tiltY: number,
  ox: number,
  oy: number,
): [number, number] {
  // Gentle parallax: the scene turns a few degrees with the pointer, which is
  // what sells the voxels as 3D rather than a flat drawing.
  const x = ix + iz * tiltX * 0.55;
  const y = iy - iz * tiltY * 0.35;
  return [ox + x * VOXEL, oy - (y + 1) * VOXEL];
}

interface SceneParams {
  tiltX: number;
  tiltY: number;
  hover: number;
  press: number;
  /** 0 = eyes open, 1 = fully shut. */
  lid: number;
  /** 0..1 progress of a success acknowledgement, 0 = none. */
  ackT: number;
  ox: number;
  oy: number;
}

function drawRun(
  ctx: CanvasRenderingContext2D,
  run: VoxelRun,
  p: SceneParams,
): void {
  let { y } = run;
  let h = 1;
  // Eyes compress toward their vertical centre — a real lid motion, not a flash.
  if (run.role === 'eye-white' || run.role === 'pupil' || run.role === 'glint') {
    const k = 1 - 0.88 * p.lid;
    const yc = EYE_CENTER_Y;
    y = yc + (run.y + 0.5 - yc) * k - 0.5 * k;
    h = k;
    if (h < 0.06) return; // fully shut: nothing to draw
  }
  const [sx, sy] = project(run.x0, y, run.z, p.tiltX, p.tiltY, p.ox, p.oy);
  const w = (run.x1 - run.x0 + 1) * VOXEL;
  const vh = h * VOXEL;

  // Front face.
  ctx.fillStyle = run.color;
  ctx.fillRect(sx, sy, w, vh);

  // Top face — lighter, offset up-back. One strip per run.
  const tx = VOXEL * (0.3 + p.tiltX * 0.55);
  const ty = -VOXEL * (0.3 + p.tiltY * 0.3);
  ctx.fillStyle = shade(run.color, 1.22);
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(sx + w, sy);
  ctx.lineTo(sx + w + tx, sy + ty);
  ctx.lineTo(sx + tx, sy + ty);
  ctx.closePath();
  ctx.fill();

  // Right face — darker. (tilt range is small; the right face stays visible.)
  ctx.fillStyle = shade(run.color, 0.72);
  ctx.beginPath();
  ctx.moveTo(sx + w, sy);
  ctx.lineTo(sx + w + tx, sy + ty);
  ctx.lineTo(sx + w + tx, sy + ty + vh);
  ctx.lineTo(sx + w, sy + vh);
  ctx.closePath();
  ctx.fill();

  // Voxel seams: without them a merged row reads as a slab, not as cubes.
  // One thin dark line per voxel boundary, front face only.
  if (run.x1 > run.x0) {
    ctx.fillStyle = 'rgba(8,3,18,0.28)';
    for (let ix = run.x0 + 1; ix <= run.x1; ix++) {
      const [bx] = project(ix, y, run.z, p.tiltX, p.tiltY, p.ox, p.oy);
      ctx.fillRect(bx - 0.15, sy, 0.3, vh);
    }
  }
}

function paintPlate(ctx: CanvasRenderingContext2D, cx: number, cy: number, smokeT: number): void {
  markSquirclePath(ctx, cx, cy);
  ctx.save();
  ctx.clip();
  const g = ctx.createLinearGradient(0, 5, 0, 95);
  g.addColorStop(0, C.plateA);
  g.addColorStop(1, C.plateB);
  ctx.fillStyle = g;
  ctx.fillRect(5, 5, 90, 90);

  // Animated smoke, two layers at different speeds and directions.
  const smoke = smokeCanvases();
  if (smoke) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.3;
    const ax = 50 - 90 + Math.sin(smokeT * 0.1) * 16 + Math.sin(smokeT * 0.043 + 1.7) * 8;
    const ay = 50 - 90 + Math.cos(smokeT * 0.083) * 12;
    ctx.drawImage(smoke.a, ax, ay, 180, 180);
    ctx.globalAlpha = 0.2;
    const bx = 50 - 90 + Math.cos(smokeT * 0.071 + 0.6) * 18;
    const by = 50 - 90 + Math.sin(smokeT * 0.052 + 2.9) * 14;
    ctx.drawImage(smoke.b, bx, by, 180, 180);
    ctx.restore();
  }

  // Vignette keeps the smoke dark at the edges — the frog stays the focus.
  const v = ctx.createRadialGradient(50, 52, 18, 50, 52, 62);
  v.addColorStop(0, 'rgba(4,2,8,0)');
  v.addColorStop(1, 'rgba(4,2,8,0.6)');
  ctx.fillStyle = v;
  ctx.fillRect(5, 5, 90, 90);
  ctx.restore();

  // Restrained violet rim — the reference's glass edge, not a neon border.
  markSquirclePath(ctx, cx, cy);
  const rim = ctx.createLinearGradient(10, 10, 90, 90);
  rim.addColorStop(0, 'rgba(167,139,250,0.55)');
  rim.addColorStop(0.4, 'rgba(139,92,246,0.16)');
  rim.addColorStop(1, 'rgba(76,29,149,0.4)');
  ctx.strokeStyle = rim;
  ctx.lineWidth = 1.6;
  ctx.stroke();
}

/**
 * Paint one frame of the frog. `blink` is this instance's blink state;
 * `ackT` is the 0..1 progress of a success acknowledgement, 0 when idle.
 */
export function paintFrog(frame: MarkFrame, blink: BlinkState, ackT: number): void {
  const { ctx, cx, cy, time, tiltX, tiltY, hover, press, reduced } = frame;
  const t = reduced ? 0 : time;

  ctx.save();
  paintPlate(ctx, cx, cy, t);

  // The scene lives inside the plate.
  ctx.save();
  markSquirclePath(ctx, cx, cy);
  ctx.clip();

  // Success acknowledgement: a short lift, a contented squint, a soft glow.
  // Restrained — the frog notices the win, it does not celebrate it.
  const lift = ackT > 0 ? Math.sin(Math.min(1, ackT) * Math.PI) * 2.4 : 0;
  if (ackT > 0) {
    const glow = ctx.createRadialGradient(50, 56, 6, 50, 56, 46);
    const a = Math.sin(Math.min(1, ackT) * Math.PI) * 0.22;
    glow.addColorStop(0, `rgba(167,139,250,${a.toFixed(3)})`);
    glow.addColorStop(1, 'rgba(167,139,250,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(5, 5, 90, 90);
  }

  const lid = reduced ? 0 : blinkAmount(blink, t);
  // The ack squint composes with blinking — both are lid motions.
  const squint = ackT > 0 ? Math.sin(Math.min(1, ackT) * Math.PI) * 0.45 : 0;
  const ox = cx;
  // Press dips the scene a touch, the way the other marks yield under a tap.
  const oy = cy + 6.2 * VOXEL - lift - press * 1.2;

  const params: SceneParams = {
    tiltX,
    tiltY,
    hover,
    press,
    lid: Math.min(1, lid + squint),
    ackT,
    ox,
    oy,
  };

  // Subtle idle: the whole frog breathes by a fraction of a voxel. Frozen
  // under reduced motion (t = 0 there, so this is a constant).
  const breathe = reduced ? 0 : Math.sin(t * 1.4) * 0.35;
  const p0 = { ...params, oy: params.oy - breathe };

  for (const run of FROG_RUNS) drawRun(ctx, run, p0);

  // Hover warmth, on the family's shared curve weight.
  if (hover > 0.01 && !reduced) {
    const hg = ctx.createRadialGradient(50, 55, 8, 50, 55, 48);
    hg.addColorStop(0, `rgba(139,92,246,${(0.14 * hover).toFixed(3)})`);
    hg.addColorStop(1, 'rgba(139,92,246,0)');
    ctx.fillStyle = hg;
    ctx.fillRect(5, 5, 90, 90);
  }

  // A whisper of gloss over the glass, shared with the other marks.
  const sweep = reduced ? 0.34 : (t * 0.05) % 1;
  paintGlossSweep(ctx, 5, 5, 90, 90, sweep, 0.05);

  ctx.restore(); // plate clip
  ctx.restore(); // entry save
}
