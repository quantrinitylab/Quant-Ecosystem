/**
 * Expression presets (from the reference eye sheet) and the spring-driven eye rig.
 * Units: eye radius = 1, y up. Glyph type ids must match `shader.ts`.
 */
import type { LivingLogoApp, LogoEye } from './shapes';

export const T = { ORB: 0, RBOX: 1, ARC: 2, CROSS: 3, CHEV: 4, DOT: 5, LENS: 6 } as const;
const D = Math.PI / 180;

export const EXPRESSION_NAMES = [
  'default',
  'content',
  'surprised',
  'smirk',
  'unimpressed',
  'skeptical',
  'focused',
  'happy',
  'sleepy',
  'neutral',
  'dizzy',
  'calm',
  'excited',
  'angry',
  'sad',
] as const;
export type ExpressionName = (typeof EXPRESSION_NAMES)[number];

/**
 * One eye's target: glyph type + params, rotation, lids
 * `[top, bottom, angle, -]`, transform `[dx, dy, sx, sy]`, brow
 * `[alpha, dy, angle, kind (0 bar | 1 arch | 2 bowl), half-length, half-width, dx]`
 * and the calm-line weight.
 */
export interface EyeSpec {
  type: number;
  P: number[];
  rot: number;
  lids: number[];
  xf: number[];
  brow: number[];
  line: number;
}
type Preset = (side: number) => Partial<EyeSpec> & Pick<EyeSpec, 'type' | 'P'>;

// Sizes were measured from the reference expression sheet (eye radius 1 = 20.45 sheet px,
// base eye spacing 80 px). side = -1 (left eye) / +1 (right eye).
const EXPRESSIONS: Readonly<Record<ExpressionName, Preset | null>> = {
  default: null, // logo specific
  content: (s) => ({ type: T.ARC, P: [1.95, 39 * D, 0.29, -1], rot: s * 23 * D, xf: [s * 0.46, 0.05, 1, 1] }),
  surprised: (s) => ({
    type: T.RBOX,
    P: [0.34, 1.05, 0.15, 0],
    xf: [-s * 0.44, -0.54, 1, 1],
    brow: [1, 1.5, 0, 1, 0.66, 0.17, 0.08],
  }),
  smirk: (s) =>
    s < 0
      ? {
          type: T.RBOX,
          P: [0.64, 0.42, 0.12, 0],
          xf: [-s * 0.62, -0.44, 1, 1],
          lids: [0.45, 0, 0.36, 0],
          brow: [1, -0.1, 0.36, 0, 1.32, 0.22, 0.62],
        }
      : { type: T.RBOX, P: [1.03, 0.93, 0.32, 0], xf: [s * 0.15, 0, 1, 1] },
  unimpressed: () => ({
    type: T.RBOX,
    P: [0.94, 0.5, 0.06, 0],
    xf: [0, -0.4, 1, 1],
    brow: [1, 0.15, -0.1, 2, 1.4, 0.17, 0.1],
  }),
  skeptical: (s) =>
    s < 0
      ? {
          type: T.RBOX,
          P: [0.68, 0.56, 0.08, 0],
          xf: [-s * 0.2, -0.5, 1, 1],
          lids: [0.36, 0, -0.25, 0],
          brow: [1, -0.07, -0.25, 0, 1.42, 0.15, 0.36],
        }
      : {
          type: T.RBOX,
          P: [0.93, 0.83, 0.1, 0],
          xf: [s * 0.1, -0.27, 1, 1],
          brow: [1, 0.7, 0.15, 0, 1.42, 0.19, 0.49],
        },
  focused: () => ({ type: T.RBOX, P: [0.44, 1.32, 0.12, 0] }),
  happy: (s) => ({ type: T.ARC, P: [1.44, 51 * D, 0.22, 1], xf: [-s * 0.16, 0.51, 1, 1] }),
  sleepy: (s) => ({ type: T.ARC, P: [1.31, 53 * D, 0.21, -1], xf: [-s * 0.33, -0.98, 1, 1] }),
  neutral: (s) => ({ type: T.RBOX, P: [0.83, 0.98, 0.26, 0], xf: [-s * 0.11, 0, 1, 1] }),
  dizzy: (s) => ({ type: T.CROSS, P: [1.42, 0.27, 0, 0], xf: [s * 0.16, -0.15, 1, 1] }),
  calm: (s) => ({ type: T.DOT, P: [0.62, 0, 0, 0], xf: [s * 0.49, 0, 1, 1], line: 1 }),
  excited: (s) => ({ type: T.CHEV, P: [2.21, 22.3 * D, 0.22, -s], xf: [s * 0.64, 0, 1, 1] }),
  angry: () => ({ type: T.ORB, P: [1, 1, 0, 0], lids: [0.4, 0.08, 0.42, 0] }),
  sad: () => ({ type: T.ORB, P: [1, 1, 0, 0], lids: [0.3, 0.05, -0.38, 0], xf: [0, -0.06, 1, 1] }),
};

/** How each logo's resting eye looks. */
function defaultSpec(style: LivingLogoApp, eye: LogoEye): Pick<EyeSpec, 'type' | 'P'> {
  switch (style) {
    case 'contacts':
      return { type: T.ORB, P: [0.8, 1.0, 0, 0] };
    case 'git': {
      const l = eye.lens ?? [1, 0.45, 0.45, 0];
      return { type: T.LENS, P: [l[0], l[1], l[2], l[3] * D] };
    }
    case 'calendar':
      return { type: T.RBOX, P: [0.386, 1.0, 0.386, 0] };
    default:
      return { type: T.ORB, P: [1, 1, 0, 0] };
  }
}

/** Per-style glyph scale of the generic presets. */
export const STYLE_SCALE: Readonly<Record<LivingLogoApp, number>> = {
  mail: 1.0,
  drive: 0.89,
  contacts: 1.12,
  git: 0.6,
  calendar: 0.55,
};

function scaleSpec(spec: EyeSpec, k: number, style: LivingLogoApp, eye: LogoEye): EyeSpec {
  const s: EyeSpec = { ...spec, P: spec.P.slice() };
  if (s.type === T.ORB && style !== 'mail' && style !== 'drive') {
    // angry / sad on flat styles keep the logo's own eye shape
    // (calendar: a rounded "eye" instead of the tall ring)
    if (style === 'calendar') {
      s.type = T.RBOX;
      s.P = [0.78, 0.98, 0.52, 0];
    } else {
      const d = defaultSpec(style, eye);
      s.type = d.type;
      s.P = d.P.slice();
    }
  }
  if (s.type !== T.ORB && s.type !== T.LENS) {
    s.xf = [s.xf[0] * k, s.xf[1] * k, s.xf[2], s.xf[3]];
    const b = s.brow;
    s.brow = [b[0], b[1] * k, b[2], b[3], b[4] * k, b[5] * k, b[6] * k];
  }
  switch (s.type) {
    case T.RBOX:
      s.P[0] *= k;
      s.P[1] *= k;
      s.P[2] *= k;
      break;
    case T.ARC:
      s.P[0] *= k;
      s.P[2] *= k;
      break;
    case T.CROSS:
      s.P[0] *= k;
      s.P[1] *= k;
      break;
    case T.CHEV:
      s.P[0] *= k;
      s.P[2] *= k;
      break;
    case T.DOT:
      s.P[0] *= k;
      break;
  }
  return s;
}

export function resolveExpression(name: ExpressionName, style: LivingLogoApp, eye: LogoEye, side: number): EyeSpec {
  const preset = EXPRESSIONS[name];
  const base = { lids: [0, 0, 0, 0], xf: [0, 0, 1, 1], brow: [0, 0.9, 0, 0, 1, 0.08, 0], rot: 0, line: 0 };
  if (!preset) return { ...base, ...defaultSpec(style, eye) };
  const spec: EyeSpec = { ...base, ...preset(side) };
  const s = scaleSpec(spec, STYLE_SCALE[style] ?? 1, style, eye);
  // calendar: the binder rings slide down onto the blue header to become a face
  if (style === 'calendar') {
    s.xf = [s.xf[0], s.xf[1] - 0.92, s.xf[2], s.xf[3]];
    s.brow = [s.brow[0], s.brow[1] - 0.92, ...s.brow.slice(2)];
  }
  // git: the left eye sits close to the edge of the cat's face, so its glyphs lean inward
  if (style === 'git' && side < 0 && s.type !== T.LENS) {
    s.xf = [s.xf[0] + 0.55, s.xf[1], s.xf[2], s.xf[3]];
    s.brow = [...s.brow.slice(0, 6), s.brow[6] - 0.55];
  }
  return s;
}

const FILLED: ReadonlySet<number> = new Set([T.ORB, T.RBOX, T.DOT, T.LENS]);

// ------------------------------------------------------------------ springs
export class Spring {
  v: number;
  t: number;
  vel = 0;
  constructor(
    v = 0,
    private readonly k = 170,
    private readonly z = 0.78,
  ) {
    this.v = v;
    this.t = v;
  }
  set(t: number): this {
    this.t = t;
    return this;
  }
  snap(v: number): this {
    this.v = this.t = v;
    this.vel = 0;
    return this;
  }
  step(dt: number): number {
    const w = Math.sqrt(this.k);
    const c = 2 * this.z * w;
    const a = this.k * (this.t - this.v) - c * this.vel;
    this.vel += a * dt;
    this.v += this.vel * dt;
    return this.v;
  }
}

export class SpringVec {
  readonly s: Spring[];
  constructor(vals: readonly number[], k: number, z: number) {
    this.s = vals.map((v) => new Spring(v, k, z));
  }
  set(vals: readonly number[]): this {
    vals.forEach((v, i) => this.s[i].set(v));
    return this;
  }
  snap(vals: readonly number[]): this {
    vals.forEach((v, i) => this.s[i].snap(v));
    return this;
  }
  step(dt: number): number[] {
    return this.s.map((s) => s.step(dt));
  }
  get v(): number[] {
    return this.s.map((s) => s.v);
  }
}

// ------------------------------------------------------------------ eye rig (one per eye)
interface GlyphFrom {
  type: number;
  P: number[];
  rot: number;
}
interface GlyphTo {
  type: number;
  P: SpringVec;
  rot: Spring;
}

export class EyeRig {
  readonly side: number;
  /** Glyph being morphed away from (A) and towards (B); `t` is the morph phase. */
  A: GlyphFrom;
  B: GlyphTo;
  t = 1;
  readonly lids = new SpringVec([0, 0, 0, 0], 300, 0.85);
  readonly xf = new SpringVec([0, 0, 1, 1], 220, 0.62);
  /** alpha, dy, angle, size, width, dx */
  readonly brow = new SpringVec([0, 0.9, 0, 1, 0.08, 0], 240, 0.8);
  browKind = 0;
  readonly line = new Spring(0, 200, 0.9);

  constructor(
    style: LivingLogoApp,
    readonly cfg: LogoEye,
  ) {
    this.side = cfg.side;
    const d = resolveExpression('default', style, cfg, cfg.side);
    this.A = { type: d.type, P: d.P.slice(), rot: 0 };
    this.B = { type: d.type, P: new SpringVec(d.P, 260, 0.82), rot: new Spring(0, 260, 0.82) };
  }

  apply(spec: EyeSpec, instant = false): void {
    if (spec.type !== this.B.type) {
      if (this.t >= 0.5 || instant) this.A = { type: this.B.type, P: this.B.P.v, rot: this.B.rot.v };
      this.B = {
        type: spec.type,
        P: new SpringVec(spec.P, 260, 0.82),
        rot: new Spring(spec.rot || 0, 260, 0.82),
      };
      this.t = instant ? 1 : 0;
    } else {
      this.B.P.set(spec.P);
      this.B.rot.set(spec.rot || 0);
      if (instant) {
        this.B.P.snap(spec.P);
        this.B.rot.snap(spec.rot || 0);
      }
    }
    this.lids.set(spec.lids);
    this.xf.set(spec.xf);
    const b = spec.brow;
    if (b[0] > 0.01) this.browKind = b[3];
    const bv = b[0] > 0.01 ? [b[0], b[1], b[2], b[4], b[5], b[6]] : [0, ...this.brow.v.slice(1)];
    this.brow.set(bv);
    this.line.set(spec.line || 0);
    if (instant) {
      this.lids.snap(spec.lids);
      this.xf.snap(spec.xf);
      this.brow.snap(bv);
      this.line.snap(spec.line || 0);
    }
  }

  step(dt: number): void {
    if (this.t < 1) {
      this.t = Math.min(1, this.t + dt / 0.24);
      if (this.t >= 1) this.A = { type: this.B.type, P: this.B.P.v, rot: this.B.rot.v };
    }
    this.B.P.step(dt);
    this.B.rot.step(dt);
    this.lids.step(dt);
    this.xf.step(dt);
    this.brow.step(dt);
    this.line.step(dt);
  }

  get filled(): boolean {
    return FILLED.has(this.B.type) && (this.t > 0.5 || FILLED.has(this.A.type));
  }
}
