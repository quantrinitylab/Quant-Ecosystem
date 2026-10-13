/**
 * Living-logo runtime.
 *
 * Every mounted logo is one full-screen fragment pass in ONE shared WebGL2
 * context (browsers cap live contexts at ~16, and a suite shell mounts a logo per
 * pillar); the pixels are then copied into that logo's own 2D canvas, so each
 * logo is an ordinary element that scrolls, clips and stacks like any other.
 *
 * Raw WebGL2, no three.js — the same stance as `lib/marks/gl-renderer`. What this
 * file owns:
 *  - the shared context, programs (compiled off the critical path with
 *    KHR_parallel_shader_compile where available, one per frame otherwise),
 *    distance-field textures, and context-loss → fallback
 *  - the per-logo simulation (springs, blinks, glances, reactions, the
 *    calendar page flip) and its uniform packing
 *  - one rAF loop for all logos: paused off-screen and on a hidden tab, ~30 fps
 *    while a logo is idle, full rate while it is reacting; a single static frame
 *    under `prefers-reduced-motion`
 *
 * Load it with `import()` only — it touches `document` at mount time.
 */
import { LOGOS, type LivingLogoApp, type LogoDef } from './shapes';
import { buildSDF } from './sdf';
import { VERTEX_SHADER, fragmentShader } from './shader';
import {
  EXPRESSION_NAMES,
  EyeRig,
  Spring,
  SpringVec,
  STYLE_SCALE,
  resolveExpression,
  type ExpressionName,
} from './expressions';

export type { LivingLogoApp } from './shapes';
export type { ExpressionName } from './expressions';

// ------------------------------------------------------------------ per-logo constants
const STYLE_ID: Readonly<Record<LivingLogoApp, number>> = { mail: 0, drive: 1, contacts: 2, git: 3, calendar: 4 };

type Highlight = readonly [number, number, number, number, number, number, number, number];
const NO_HIGHLIGHT: Highlight = [0, 0, 0, 0, 0, 0, 0, 0];
const HIGHLIGHTS: Readonly<Record<LivingLogoApp, readonly [Highlight, Highlight]>> = {
  mail: [
    [-0.1, 0.5, 0.07, 0.43, 0.46, 0.38, 1.0, 0.9],
    [-0.42, 0.4, -0.28, 0.5, 0.4, 0.32, 1.0, 0.85],
  ],
  drive: [
    [0.3, 0.52, 0.58, 0.12, 0.3, 0.12, 1.0, 0.9],
    [0.3, 0.52, 0.58, 0.12, 0.3, 0.12, 1.0, 0.9],
  ],
  contacts: [
    [-0.32, 0.42, 0.34, -0.38, 0.55, 0.22, 1.0, 0.35],
    [-0.32, 0.42, 0.34, -0.38, 0.55, 0.22, 1.0, 0.35],
  ],
  git: [NO_HIGHLIGHT, NO_HIGHLIGHT],
  calendar: [
    [-0.22, 0.62, 0.2, -0.6, 0.55, 0.3, 0.55, 0.15],
    [-0.22, 0.62, 0.2, -0.6, 0.55, 0.3, 0.55, 0.15],
  ],
};

const HOVER_REACTION: Readonly<Record<LivingLogoApp, ExpressionName>> = {
  mail: 'happy',
  drive: 'happy',
  contacts: 'happy',
  git: 'content',
  calendar: 'happy',
};

/** How far a flat glyph slides with the gaze, per style (frame units of eye radius). */
const FLAT_GAZE: Readonly<Record<LivingLogoApp, number>> = {
  mail: 0.035,
  drive: 0.035,
  contacts: 0.16,
  git: 0.06,
  calendar: 0.03,
};

type Vec4 = readonly [number, number, number, number];
/** QuantContacts mouth per expression: [curve (1 = reference smile, <0 frown), width, open, tilt]. */
const MOUTHS: Readonly<Record<ExpressionName, Vec4>> = {
  default: [1, 1, 0, 0],
  happy: [1.45, 1.12, 0, 0],
  excited: [1.7, 1.2, 0, 0],
  surprised: [0, 0.5, 1, 0],
  neutral: [0, 0.72, 0, 0],
  sleepy: [0.55, 0.62, 0, 0],
  content: [1.1, 0.95, 0, 0],
  dizzy: [-0.35, 0.62, 0, 0.12],
  calm: [0.75, 0.8, 0, 0],
  unimpressed: [-0.12, 0.7, 0, 0],
  skeptical: [0.25, 0.66, 0, -0.16],
  angry: [-0.9, 0.62, 0, 0],
  sad: [-0.95, 0.72, 0, 0],
  focused: [0, 0.55, 0, 0],
  smirk: [0.9, 0.78, 0, 0.2],
};

const FONT =
  '"SF Pro Display","SF Pro Text",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,"Liberation Sans",sans-serif';

/** Idle logos render at ~30 fps; a reacting one renders every frame. */
const IDLE_FRAME_MS = 30;
/** Every in-app logo is <= 96 CSS px, so <= 192 device px: one 256 field covers them. */
const BASE_FIELD = 256;

function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const ease = (t: number) => t * t * (3 - 2 * t);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function set4(arr: Float32Array, index: number, a: number, b: number, c: number, d: number): void {
  const o = index * 4;
  arr[o] = a;
  arr[o + 1] = b;
  arr[o + 2] = c;
  arr[o + 3] = d;
}

// ------------------------------------------------------------------ shared WebGL2 state
const UNIFORMS = ['uSdf', 'uText', 'uRes', 'uZoom', 'uTime', 'uTilt', 'uXf', 'uShift', 'uBg', 'uTexel', 'uEye', 'uMisc'] as const;
type UniformName = (typeof UNIFORMS)[number];

interface ProgramState {
  program: WebGLProgram;
  shaders: WebGLShader[];
  status: 'queued' | 'compiling' | 'ready' | 'failed';
  error: string;
  loc: Partial<Record<UniformName, WebGLUniformLocation | null>>;
  waiters: Array<{ resolve: () => void; reject: (err: Error) => void }>;
}

interface Shared {
  canvas: HTMLCanvasElement;
  gl: WebGL2RenderingContext;
  vao: WebGLVertexArrayObject | null;
  parallel: KHR_parallel_shader_compile | null;
  programs: Map<LivingLogoApp, ProgramState>;
  fields: Map<string, WebGLTexture>;
  pending: LivingLogoApp[];
  pump: number;
}

let shared: Shared | null = null;
let failure: string | null = null;
const failureListeners = new Set<(reason: string) => void>();
const instances = new Set<LogoInstance>();

function fail(reason: string): void {
  if (failure) return;
  failure = reason;
  stopLoop();
  if (shared) {
    for (const p of shared.programs.values()) {
      for (const w of p.waiters.splice(0)) w.reject(new Error(reason));
    }
  }
  for (const listener of failureListeners) listener(reason);
}

function context(): Shared {
  if (failure) throw new Error(failure);
  if (shared) return shared;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const gl = canvas.getContext('webgl2', {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: true,
    powerPreference: 'low-power',
  });
  if (!gl) {
    fail('WebGL2 is unavailable');
    throw new Error('WebGL2 is unavailable');
  }
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    fail('WebGL context lost');
  });
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);
  gl.disable(gl.BLEND);
  gl.enable(gl.SCISSOR_TEST);
  gl.clearColor(0, 0, 0, 0);
  shared = {
    canvas,
    gl,
    vao: gl.createVertexArray(),
    parallel: gl.getExtension('KHR_parallel_shader_compile'),
    programs: new Map(),
    fields: new Map(),
    pending: [],
    pump: 0,
  };
  return shared;
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('createShader failed');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return shader;
}

function startCompile(s: Shared, app: LivingLogoApp, p: ProgramState): void {
  const { gl } = s;
  const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragmentShader(app));
  gl.attachShader(p.program, vs);
  gl.attachShader(p.program, fs);
  gl.linkProgram(p.program);
  p.shaders = [vs, fs];
  p.status = 'compiling';
}

/** Blocks on the driver unless KHR_parallel_shader_compile says the link is done. */
function finishCompile(s: Shared, app: LivingLogoApp, p: ProgramState): void {
  const { gl } = s;
  if (!gl.getProgramParameter(p.program, gl.LINK_STATUS)) {
    p.status = 'failed';
    p.error =
      gl.getProgramInfoLog(p.program) ||
      p.shaders.map((sh) => gl.getShaderInfoLog(sh) || '').join('\n') ||
      'link failed';
    fail(`living logo "${app}" shader: ${p.error}`);
    return;
  }
  for (const name of UNIFORMS) p.loc[name] = gl.getUniformLocation(p.program, name);
  gl.useProgram(p.program);
  if (p.loc.uSdf) gl.uniform1i(p.loc.uSdf, 0);
  if (p.loc.uText) gl.uniform1i(p.loc.uText, 1);
  // Build the common-size field now, so the first visible frame never pays for it.
  fieldTexture(s, app, BASE_FIELD);
  p.status = 'ready';
  for (const w of p.waiters.splice(0)) w.resolve();
}

/** One step of the compile queue per animation frame: never a long task. */
function pumpCompiles(): void {
  const s = shared;
  if (!s) return;
  s.pump = 0;
  if (failure) return;
  try {
    let blockingWorkDone = false;
    for (const app of [...s.pending]) {
      const p = s.programs.get(app);
      if (!p) continue;
      if (p.status === 'queued') {
        if (!s.parallel && blockingWorkDone) continue;
        startCompile(s, app, p);
        if (!s.parallel) {
          finishCompile(s, app, p);
          blockingWorkDone = true;
        }
      } else if (p.status === 'compiling') {
        const done = !s.parallel || s.gl.getProgramParameter(p.program, s.parallel.COMPLETION_STATUS_KHR);
        if (done && !blockingWorkDone) {
          finishCompile(s, app, p);
          blockingWorkDone = true; // the field build is the expensive part; one per frame
        }
      }
      if (p.status === 'ready' || p.status === 'failed') s.pending.splice(s.pending.indexOf(app), 1);
    }
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
    return;
  }
  if (s.pending.length && !failure) s.pump = requestAnimationFrame(pumpCompiles);
}

/** Compile `app`'s program (and its distance field) off the critical path. */
export function prepareLivingLogo(app: LivingLogoApp): Promise<void> {
  let s: Shared;
  try {
    s = context();
  } catch (err) {
    return Promise.reject(err instanceof Error ? err : new Error(String(err)));
  }
  let p = s.programs.get(app);
  if (!p) {
    const program = s.gl.createProgram();
    if (!program) return Promise.reject(new Error('createProgram failed'));
    p = { program, shaders: [], status: 'queued', error: '', loc: {}, waiters: [] };
    s.programs.set(app, p);
    s.pending.push(app);
  }
  if (p.status === 'ready') return Promise.resolve();
  if (p.status === 'failed') return Promise.reject(new Error(p.error));
  const state = p;
  const done = new Promise<void>((resolve, reject) => state.waiters.push({ resolve, reject }));
  if (!s.pump) s.pump = requestAnimationFrame(pumpCompiles);
  return done;
}

export function isLivingLogoReady(app: LivingLogoApp): boolean {
  return !failure && shared?.programs.get(app)?.status === 'ready';
}

/** Fires once if the shared renderer dies (shader error, context loss). */
export function onLivingLogoFailure(listener: (reason: string) => void): () => void {
  if (failure) listener(failure);
  failureListeners.add(listener);
  return () => failureListeners.delete(listener);
}

export function livingLogoFailure(): string | null {
  return failure;
}

function fieldTexture(s: Shared, app: LivingLogoApp, n: number): WebGLTexture {
  const key = `${app}:${n}`;
  const cached = s.fields.get(key);
  if (cached) return cached;
  const { gl } = s;
  const data = buildSDF(LOGOS[app], n);
  const tex = gl.createTexture();
  if (!tex) throw new Error('createTexture failed');
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, n, n, 0, gl.RGBA, gl.HALF_FLOAT, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  s.fields.set(key, tex);
  return tex;
}

// ------------------------------------------------------------------ pointer (one listener for all logos)
const pointer = { x: 0, y: 0, seq: 0 };
let pointerBound = false;
function bindPointer(): void {
  if (pointerBound) return;
  pointerBound = true;
  window.addEventListener(
    'pointermove',
    (event) => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.seq++;
    },
    { passive: true },
  );
}

// ------------------------------------------------------------------ one living logo
/** What the calendar card prints. */
export interface CalendarFace {
  weekday: string;
  day: number;
}

interface InstanceOptions {
  app: LivingLogoApp;
  zoom: number;
  interactive: boolean;
  seed: number;
  face: CalendarFace | null;
}

class LogoInstance {
  readonly ctx: CanvasRenderingContext2D;
  readonly app: LivingLogoApp;
  readonly logo: LogoDef;
  readonly rng: () => number;
  visible = true;
  reduced = false;
  /** Force a render on the next frame even when idle or static. */
  dirty = true;
  time = 0;
  lastRender = -Infinity;
  private pointerSeq = -1;
  private pointerActive = false;
  private lastMove = -Infinity;
  private readonly rigs: EyeRig[];
  private readonly gaze = new SpringVec([0, 0], 380, 0.68);
  private readonly tilt = new SpringVec([0, 0], 55, 0.9);
  private readonly scale = new SpringVec([1, 1], 210, 0.38);
  private readonly glow = new Spring(1, 60, 0.9);
  private readonly pupil = new Spring(0, 90, 0.85);
  private readonly dilate = new Spring(0.08, 120, 0.8);
  /** contacts mouth: [curve, width, open, tilt] */
  private readonly mouth = new SpringVec([1, 1, 0, 0], 220, 0.7);
  private blinkT = -1;
  private blinkAmt = 0;
  private nextBlink: number;
  private queuedBlink = -1;
  private nextSaccade = 0.6;
  private gazeTarget: [number, number] = [0, 0];
  private base: ExpressionName = 'default';
  private current: ExpressionName | null = null;
  private reaction: ExpressionName | null = null;
  private reactionUntil = 0;
  private settleUntil = 1;
  private fieldN = 0;
  private field: WebGLTexture | null = null;
  private readonly E = new Float32Array(24 * 4);
  private readonly M = new Float32Array(8 * 4);
  // calendar
  private flipT = -1;
  private textCanvas: HTMLCanvasElement | null = null;
  private textTex: WebGLTexture | null = null;
  private textDirty = false;
  private face: CalendarFace | null = null;
  private pendingFace: CalendarFace | null = null;
  private liveFace: boolean;
  private lastFaceCheck = 0;

  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly opts: InstanceOptions,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('living logo: no 2D context');
    this.ctx = ctx;
    this.app = opts.app;
    this.logo = LOGOS[opts.app];
    this.rng = mulberry32(opts.seed * 9973 + 17);
    this.nextBlink = 1.2 + this.rng() * 2.5;
    this.rigs = this.logo.eyes.map((e) => new EyeRig(this.logo.eyeStyle, e));
    this.applyExpression('default', true);
    this.liveFace = !opts.face;
    if (this.app === 'calendar') this.face = opts.face ?? localFace(new Date());
  }

  // ---- public API
  setExpression(name: ExpressionName): void {
    this.base = EXPRESSION_NAMES.includes(name) ? name : 'default';
    this.dirty = true;
  }
  react(name: ExpressionName, seconds = 1.2): void {
    if (this.reduced) return;
    this.reaction = name;
    this.reactionUntil = this.time + seconds;
    this.settleUntil = this.reactionUntil + 0.8;
  }
  bounce(k = 1): void {
    if (this.reduced) return;
    this.scale.s[1].vel -= 2.6 * k;
    this.scale.s[0].vel += 1.9 * k;
    this.settleUntil = Math.max(this.settleUntil, this.time + 1.2);
  }
  notify(): void {
    if (this.reduced) return;
    this.react('surprised', 1.4);
    this.bounce(1.2);
    this.glow.vel += 6;
  }
  tap(): void {
    this.react('excited', 0.9);
    this.bounce(1);
    if (this.app === 'calendar') this.flip(this.face);
  }
  hover(): void {
    this.react(HOVER_REACTION[this.app], 1.3);
  }
  setFace(face: CalendarFace | null): void {
    if (this.app !== 'calendar') return;
    this.liveFace = !face;
    const next = face ?? localFace(new Date());
    const shown = this.pendingFace ?? this.face;
    if (shown && faceKey(next) === faceKey(shown)) return;
    if (this.reduced || !this.textCanvas) {
      this.face = next;
      this.textCanvas = null; // redrawn at the next render
      this.dirty = true;
    } else {
      this.flip(next);
    }
  }

  // ---- internals
  private flip(face: CalendarFace | null): void {
    this.flipT = 0;
    this.pendingFace = face;
    this.dirty = true;
  }

  /** Text-mask width for the current canvas: ~2x the card's on-screen pixels. */
  private textWidth(): number {
    const px = Math.max(this.canvas.width, this.canvas.height, 32);
    return clamp(2 ** Math.ceil(Math.log2(px * 0.56 * this.opts.zoom * 2)), 128, 1024);
  }

  private drawFace(face: CalendarFace): void {
    this.face = face;
    const c = this.textCanvas ?? document.createElement('canvas');
    this.textCanvas = c;
    const width = this.textWidth();
    const height = Math.round((width * 425) / 500.5);
    if (c.width !== width || c.height !== height) {
      c.width = width;
      c.height = height;
    }
    const x = c.getContext('2d');
    if (!x) return;
    const k = c.width / 500.5;
    const cx = (625.75 - 375.5) * k;
    x.globalCompositeOperation = 'source-over';
    x.fillStyle = '#000';
    x.fillRect(0, 0, c.width, c.height);
    x.globalCompositeOperation = 'lighter';
    x.textAlign = 'center';
    x.textBaseline = 'alphabetic';
    const wd = face.weekday.replace('.', '');
    const day = String(face.day);
    let fs = 66 * k;
    x.font = `700 ${fs}px ${FONT}`;
    let w = x.measureText(wd).width;
    if (w > 300 * k) {
      fs *= (300 * k) / w;
      x.font = `700 ${fs}px ${FONT}`;
    }
    x.fillStyle = '#f00';
    x.fillText(wd, cx, (646 - 500) * k);
    fs = 184 * k;
    x.font = `700 ${fs}px ${FONT}`;
    w = x.measureText(day).width;
    if (w > 330 * k) {
      fs *= (330 * k) / w;
      x.font = `700 ${fs}px ${FONT}`;
    }
    x.fillStyle = '#0f0';
    x.fillText(day, cx, (832 - 500) * k);
    this.textDirty = true;
  }

  private applyExpression(name: ExpressionName, instant = false): void {
    this.current = name;
    const style = this.logo.eyeStyle;
    this.rigs.forEach((rig) => rig.apply(resolveExpression(name, style, rig.cfg, rig.side), instant));
    const m = MOUTHS[name] ?? MOUTHS.default;
    this.mouth.set(m);
    if (instant) this.mouth.snap(m);
  }

  /** True while something is visibly moving faster than the idle drift. */
  private lively(): boolean {
    return (
      this.blinkT >= 0 ||
      this.flipT >= 0 ||
      this.reaction !== null ||
      this.time < this.settleUntil ||
      this.time - this.lastMove < 1.2
    );
  }

  private trackPointer(): void {
    if (!this.opts.interactive || this.reduced || pointer.seq === this.pointerSeq) return;
    this.pointerSeq = pointer.seq;
    if (pointer.seq === 0) return;
    const b = this.canvas.getBoundingClientRect();
    if (!b.width || !b.height) return;
    const R = Math.max(b.width, b.height) * 1.6;
    const nx = (pointer.x - (b.left + b.width / 2)) / R;
    const ny = -(pointer.y - (b.top + b.height / 2)) / R;
    // A pointer across the screen is not attention; one within ~10 logo-widths is.
    if (Math.abs(nx) > 6 || Math.abs(ny) > 6) return;
    this.pointerActive = true;
    this.lastMove = this.time;
    this.gazeTarget = [clamp(nx, -1, 1), clamp(ny, -1, 1)];
  }

  update(dt: number): void {
    dt = Math.min(dt, 1 / 20);
    this.time += dt;
    const t = this.time;
    const reduced = this.reduced;
    this.trackPointer();
    // expression selection
    let want = this.base;
    if (this.reaction) {
      if (t < this.reactionUntil) want = this.reaction;
      else this.reaction = null;
    }
    if (want !== this.current) {
      this.applyExpression(want);
      this.settleUntil = Math.max(this.settleUntil, t + 0.9);
    }
    // blinking
    const canBlink = this.rigs.every((r) => r.filled) && !reduced;
    if (t >= this.nextBlink) {
      if (canBlink) {
        this.blinkT = 0;
        if (this.rng() < 0.16) this.queuedBlink = t + 0.34;
      }
      this.nextBlink = t + 2.4 + this.rng() * 3.6;
    }
    if (this.queuedBlink > 0 && t >= this.queuedBlink) {
      this.queuedBlink = -1;
      if (canBlink) this.blinkT = 0;
    }
    let blink = 0;
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      const b = this.blinkT;
      blink = b < 0.075 ? ease(b / 0.075) : b < 0.105 ? 1 : b < 0.25 ? 1 - ease((b - 0.105) / 0.145) : 0;
      if (b >= 0.25) this.blinkT = -1;
    }
    this.blinkAmt = canBlink ? blink : 0;
    // gaze: pointer tracking or idle saccades
    const idle = t - this.lastMove;
    if (this.pointerActive && idle < 5) {
      // gazeTarget already follows the pointer
    } else if (t > this.nextSaccade && !reduced) {
      this.pointerActive = false;
      const a = this.rng() * Math.PI * 2;
      const m = this.rng() < 0.3 ? 0 : 0.2 + this.rng() * 0.45;
      this.gazeTarget = [Math.cos(a) * m, Math.sin(a) * m * 0.7];
      this.nextSaccade = t + 0.9 + this.rng() * 2.6;
    }
    if (this.current === 'sleepy' || this.current === 'dizzy') this.gaze.set([0, 0]);
    else this.gaze.set(this.gazeTarget);
    this.gaze.step(dt);
    const g = this.gaze.v;
    this.tilt.set([g[0] * 0.9, g[1] * 0.9]);
    this.tilt.step(dt);
    this.rigs.forEach((r) => r.step(dt));
    this.scale.step(dt);
    this.glow.step(dt);
    const tracking = this.pointerActive && idle < 5;
    this.pupil.set(
      this.logo.eyeStyle === 'git' && (tracking || this.current === 'surprised' || this.current === 'excited') ? 1 : 0,
    );
    this.pupil.step(dt);
    this.dilate.set(this.current === 'excited' || this.current === 'surprised' ? 0.2 : 0.075);
    this.dilate.step(dt);
    this.mouth.step(dt);
    if (this.flipT >= 0) this.flipT += dt;
    // a live (unpinned) calendar follows the local date
    if (this.app === 'calendar' && this.liveFace && t - this.lastFaceCheck > 1) {
      this.lastFaceCheck = t;
      const today = localFace(new Date());
      if (this.face && faceKey(today) !== faceKey(this.face) && this.flipT < 0) this.flip(today);
    }
  }

  /** Has the next frame got anything new to show? */
  wants(now: number): boolean {
    return this.dirty || this.lively() || now - this.lastRender >= IDLE_FRAME_MS;
  }

  private calendarPhase(): number {
    if (this.flipT < 0) return 0;
    const ph = Math.min(1, this.flipT / 0.6);
    if (ph >= 0.5 && this.pendingFace) {
      this.drawFace(this.pendingFace);
      this.pendingFace = null;
    }
    if (ph >= 1) this.flipT = -1;
    return ph;
  }

  private ensureField(s: Shared): void {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const want = Math.min(1024, Math.max(BASE_FIELD, 2 ** Math.ceil(Math.log2(Math.min(w, h) * this.opts.zoom * 1.05))));
    if (want !== this.fieldN || !this.field) {
      this.fieldN = want;
      this.field = fieldTexture(s, this.app, want);
    }
  }

  private uploadText(gl: WebGL2RenderingContext): void {
    if (!this.textCanvas) return;
    if (!this.textTex) this.textTex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.textTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, this.textCanvas);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.textDirty = false;
  }

  /** Render into the shared GL canvas, then copy into this logo's own canvas. */
  render(now: number): void {
    const s = shared;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const p = s?.programs.get(this.app);
    if (!s || failure || !p || p.status !== 'ready' || !w || !h) return;
    const { gl } = s;
    this.ensureField(s);
    if (s.canvas.width < w || s.canvas.height < h) {
      s.canvas.width = Math.max(s.canvas.width, w);
      s.canvas.height = Math.max(s.canvas.height, h);
    }
    const fullH = s.canvas.height;
    const L = this.logo;
    const F = L.frame;
    const style = L.eyeStyle;
    const t = this.time;
    const reduced = this.reduced;
    const E = this.E;
    const M = this.M;
    const g = this.gaze.v;
    const flatGaze = FLAT_GAZE[style];
    const git = style === 'git';
    this.rigs.forEach((rig, i) => {
      const e = L.eyes[i];
      const b = i * 12;
      set4(E, b, (e.x - F.x0) / F.size, 1 - (e.y - F.y0) / F.size, e.r / F.size, e.side);
      set4(E, b + 1, rig.A.type, rig.B.type, ease(rig.t), STYLE_ID[style]);
      const PA = rig.A.P.slice();
      const PB = rig.B.P.v;
      const bl = this.blinkAmt;
      if (git) {
        const k = 1 - 0.9 * bl;
        if (rig.A.type === 6) {
          PA[1] *= k;
          PA[2] *= k;
        }
        if (rig.B.type === 6) {
          PB[1] *= k;
          PB[2] *= k;
        }
      }
      set4(E, b + 2, PA[0], PA[1], PA[2], PA[3]);
      set4(E, b + 3, PB[0], PB[1], PB[2], PB[3]);
      const lids = rig.lids.v;
      const xf = rig.xf.v;
      const lidBlink = L.blink === 'lid';
      const lidMode = lidBlink || git;
      set4(
        E,
        b + 4,
        lidBlink ? Math.max(lids[0], 0.56 * bl) : lids[0],
        lidBlink ? Math.max(lids[1], 0.46 * bl) : lids[1],
        lids[2],
        lids[3],
      );
      const squash = lidMode ? 1 : 1 - 0.88 * bl;
      set4(
        E,
        b + 5,
        xf[0] + g[0] * flatGaze,
        xf[1] + g[1] * flatGaze - (lidMode ? 0 : 0.08 * bl),
        Math.max(0.05, xf[2]),
        Math.max(0.04, xf[3] * squash),
      );
      set4(E, b + 6, g[0], g[1], git ? this.pupil.v : 0, git ? this.dilate.v : this.glow.v);
      const br = rig.brow.v;
      set4(E, b + 7, Math.max(0, br[0]), br[1], br[2], rig.browKind);
      set4(E, b + 11, Math.max(0.01, br[3]), Math.max(0.005, br[4]), br[5], 0);
      const H = HIGHLIGHTS[style][i];
      set4(E, b + 8, H[0], H[1], H[2], H[3]);
      set4(E, b + 9, H[4], H[5], H[6], H[7]);
      set4(E, b + 10, rig.A.rot, rig.B.rot.v, 0, 0);
    });
    set4(M, 0, Math.max(0, this.rigs[0].line.v), (0.11 * (STYLE_SCALE[style] ?? 1) * L.eyes[0].r) / F.size, 0, 0);
    set4(M, 1, this.glow.v * (reduced ? 1 : 0.94 + 0.06 * Math.sin(t * 2.1)), 0, 0, 0);
    const mo = this.mouth.v;
    set4(M, 2, mo[0], Math.max(0.05, mo[1]), clamp(mo[2], 0, 1), mo[3]);
    if (this.app === 'calendar') set4(M, 3, this.calendarPhase(), 0, 0, 0);

    const breathe = reduced ? 0 : Math.sin(t * 1.7) * 0.006;
    const sc = this.scale.v;
    const tl = this.tilt.v;
    const loc = p.loc;
    gl.viewport(0, fullH - h, w, h);
    gl.scissor(0, fullH - h, w, h);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(p.program);
    gl.uniform2f(loc.uRes ?? null, w, h);
    gl.uniform1f(loc.uZoom ?? null, this.opts.zoom);
    gl.uniform1f(loc.uTime ?? null, t);
    gl.uniform2f(loc.uTilt ?? null, tl[0], tl[1]);
    gl.uniform4f(loc.uXf ?? null, 0.5, 0.26, sc[0] * (1 - breathe * 0.5), sc[1] * (1 + breathe));
    gl.uniform2f(loc.uShift ?? null, 0, reduced ? 0 : Math.sin(t * 1.1) * 0.0025);
    gl.uniform1f(loc.uBg ?? null, 0);
    gl.uniform1f(loc.uTexel ?? null, 1 / this.fieldN);
    gl.uniform4fv(loc.uEye ?? null, E);
    gl.uniform4fv(loc.uMisc ?? null, M);
    if (this.app === 'calendar') {
      if (!this.textCanvas || this.textCanvas.width !== this.textWidth()) {
        this.drawFace(this.face ?? localFace(new Date()));
      }
      if (this.textDirty || !this.textTex) this.uploadText(gl);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.textTex);
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.field);
    gl.bindVertexArray(s.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.ctx.clearRect(0, 0, w, h);
    this.ctx.drawImage(s.canvas, 0, 0, w, h, 0, 0, w, h);
    this.lastRender = now;
    this.dirty = false;
  }

  dispose(): void {
    if (shared && this.textTex) shared.gl.deleteTexture(this.textTex);
    this.textTex = null;
    this.textCanvas = null;
  }
}

function localFace(d: Date): CalendarFace {
  return { weekday: d.toLocaleDateString('en-US', { weekday: 'short' }), day: d.getDate() };
}
function faceKey(f: CalendarFace): string {
  return `${f.weekday}|${f.day}`;
}

// ------------------------------------------------------------------ the loop
let raf = 0;
let lastNow = 0;
let reducedQuery: MediaQueryList | null = null;
const perf = { frames: 0, renders: 0, ms: 0 };

function frame(now: number): void {
  raf = 0;
  if (failure) return;
  const dt = lastNow ? (now - lastNow) / 1000 : 1 / 60;
  lastNow = now;
  let animating = false;
  const t0 = performance.now();
  try {
    for (const inst of instances) {
      if (!inst.visible) continue;
      if (inst.reduced) {
        if (inst.dirty) {
          inst.render(now);
          perf.renders++;
        }
        continue;
      }
      animating = true;
      inst.update(dt);
      if (inst.wants(now)) {
        inst.render(now);
        perf.renders++;
      }
    }
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
    return;
  }
  perf.frames++;
  perf.ms += performance.now() - t0;
  if (animating && !document.hidden) raf = requestAnimationFrame(frame);
  else lastNow = 0;
}

function kick(): void {
  if (!raf && !failure && typeof requestAnimationFrame === 'function') {
    raf = requestAnimationFrame(frame);
  }
}

function stopLoop(): void {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  lastNow = 0;
}

let globalsBound = false;
function bindGlobals(): void {
  if (globalsBound) return;
  globalsBound = true;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopLoop();
    else kick();
  });
  reducedQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)') ?? null;
  reducedQuery?.addEventListener?.('change', () => {
    const reduced = !!reducedQuery?.matches;
    for (const inst of instances) {
      inst.reduced = reduced;
      inst.dirty = true;
    }
    kick();
  });
  // Diagnostics for support/QA: `__quantLivingLogos.status()` in the console.
  Object.defineProperty(window, '__quantLivingLogos', {
    configurable: true,
    value: {
      status: () => ({
        failure,
        ready: shared ? [...shared.programs].filter(([, p]) => p.status === 'ready').map(([a]) => a) : [],
        instances: instances.size,
        visible: [...instances].filter((i) => i.visible).length,
        parallelCompile: !!shared?.parallel,
        avgFrameMs: perf.frames ? +(perf.ms / perf.frames).toFixed(3) : 0,
        frames: perf.frames,
        renders: perf.renders,
      }),
    },
  });
}

// ------------------------------------------------------------------ public mount API
export interface LivingLogoOptions {
  app: LivingLogoApp;
  /** Calendar only: what the card shows. Omit for the browser's local date. */
  face?: CalendarFace | null;
  /** Scale inside the box (default 1). */
  zoom?: number;
  /** Hover, tap and pointer-follow reactions (default true). */
  interactive?: boolean;
}

export interface LivingLogoHandle {
  setFace(face: CalendarFace | null): void;
  setExpression(name: ExpressionName): void;
  react(name: ExpressionName, seconds?: number): void;
  /** Attention: surprised + bounce + glow (new mail, upload done...). */
  notify(): void;
  dispose(): void;
}

let seedCounter = 0;

/**
 * Attach a living logo to `canvas`. The program for `app` must be ready
 * (`prepareLivingLogo`); the canvas backing store tracks its CSS box x DPR (max 2).
 */
export function mountLivingLogo(canvas: HTMLCanvasElement, options: LivingLogoOptions): LivingLogoHandle {
  if (!isLivingLogoReady(options.app)) throw new Error(failure ?? `living logo "${options.app}" is not ready`);
  bindGlobals();
  const inst = new LogoInstance(canvas, {
    app: options.app,
    zoom: options.zoom ?? 1,
    interactive: options.interactive ?? true,
    seed: ++seedCounter,
    face: options.face ?? null,
  });
  inst.reduced = !!reducedQuery?.matches;
  if (inst.opts.interactive) bindPointer();

  const resize = (entry?: ResizeObserverEntry) => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let w: number;
    let h: number;
    const device = entry?.devicePixelContentBoxSize?.[0];
    if (device && dpr === (window.devicePixelRatio || 1)) {
      w = device.inlineSize;
      h = device.blockSize;
    } else {
      const box = entry ? entry.contentRect : { width: canvas.clientWidth, height: canvas.clientHeight };
      w = box.width * dpr;
      h = box.height * dpr;
    }
    w = Math.max(1, Math.round(w));
    h = Math.max(1, Math.round(h));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      inst.dirty = true;
      kick();
    }
  };
  resize();
  const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver((entries) => resize(entries[0]));
  ro?.observe(canvas);
  const io =
    typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver((entries) => {
          const entry = entries[entries.length - 1];
          if (!entry) return;
          inst.visible = entry.isIntersecting;
          if (inst.visible) {
            inst.dirty = true;
            kick();
          }
        });
  io?.observe(canvas);

  const onEnter = () => inst.hover();
  const onTap = () => inst.tap();
  if (inst.opts.interactive) {
    canvas.addEventListener('pointerenter', onEnter);
    canvas.addEventListener('click', onTap);
  }

  instances.add(inst);
  // Paint now rather than at the next frame: the classic mark this replaces is
  // already gone, so waiting would show one empty frame.
  try {
    inst.render(performance.now());
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
  kick();

  let disposed = false;
  const poke = () => {
    inst.dirty = true;
    kick();
  };
  return {
    setFace(face) {
      inst.setFace(face);
      poke();
    },
    setExpression(name) {
      inst.setExpression(name);
      poke();
    },
    react(name, seconds) {
      inst.react(name, seconds);
      poke();
    },
    notify() {
      inst.notify();
      poke();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      instances.delete(inst);
      ro?.disconnect();
      io?.disconnect();
      canvas.removeEventListener('pointerenter', onEnter);
      canvas.removeEventListener('click', onTap);
      inst.dispose();
    },
  };
}
