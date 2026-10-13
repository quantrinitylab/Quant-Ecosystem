/**
 * Living-logo geometry. Coordinates are "design px" — the pixel space of the
 * approved reference artwork — so every mark can be compared 1:1 against its
 * reference. y grows downward here; the SDF builder flips rows for GL.
 */
import { TRACED } from './traced';

export type LivingLogoApp = 'mail' | 'drive' | 'contacts' | 'git' | 'calendar';

export const LIVING_LOGO_APPS: readonly LivingLogoApp[] = ['mail', 'calendar', 'drive', 'contacts', 'git'];

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface LogoFrame {
  x0: number;
  y0: number;
  size: number;
}

export interface LogoEye {
  x: number;
  y: number;
  r: number;
  side: -1 | 1;
  /** QuantGit almond eyes: half-length, half-thickness top/bottom, angle (deg, y-up). */
  lens?: readonly [number, number, number, number];
}

export interface LogoLayer {
  name: string;
  draw: (ctx: Ctx2D) => void;
}

export interface LogoDef {
  title: string;
  frame: LogoFrame;
  /** Up to four layers — one per RGBA channel of the distance-field texture. */
  layers: readonly LogoLayer[];
  eyes: readonly LogoEye[];
  eyeStyle: LivingLogoApp;
  /** `lid`: eyelids close over the eye; `squash`: the eye squashes flat. */
  blink: 'lid' | 'squash';
}

function poly(ctx: Ctx2D, pts: readonly number[], smooth: boolean): void {
  const n = pts.length / 2;
  if (!smooth) {
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 1; i < n; i++) ctx.lineTo(pts[i * 2], pts[i * 2 + 1]);
    ctx.closePath();
    return;
  }
  // Closed quadratic B-spline through edge midpoints: removes the polygon facets
  // of the traced outline.
  const mx = (i: number) => (pts[(i % n) * 2] + pts[((i + 1) % n) * 2]) / 2;
  const my = (i: number) => (pts[(i % n) * 2 + 1] + pts[((i + 1) % n) * 2 + 1]) / 2;
  ctx.moveTo(mx(0), my(0));
  for (let i = 1; i <= n; i++) ctx.quadraticCurveTo(pts[(i % n) * 2], pts[(i % n) * 2 + 1], mx(i), my(i));
  ctx.closePath();
}

type Radii = number | readonly [number, number, number, number];

function rrect(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: Radii): void {
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, typeof r === 'number' ? r : [...r]);
    return;
  }
  // roundRect predates nothing we otherwise need, but keep a path for old engines.
  const [tl, tr, br, bl] = typeof r === 'number' ? [r, r, r, r] : r;
  ctx.moveTo(x + tl, y);
  ctx.arcTo(x + w, y, x + w, y + h, tr);
  ctx.arcTo(x + w, y + h, x, y + h, br);
  ctx.arcTo(x, y + h, x, y, bl);
  ctx.arcTo(x, y, x + w, y, tl);
  ctx.closePath();
}

export const LOGOS: Readonly<Record<LivingLogoApp, LogoDef>> = {
  mail: {
    title: 'QuantMail',
    frame: { x0: 76, y0: -191, size: 1384 },
    layers: [
      {
        name: 'envelope',
        draw: (c) => {
          c.beginPath();
          poly(c, TRACED.mail.env, true);
          c.fill();
        },
      },
      {
        name: 'flap',
        draw: (c) => {
          c.beginPath();
          poly(c, TRACED.mail.flap, true);
          c.fill();
        },
      },
      {
        name: 'panel',
        draw: (c) => {
          c.save();
          c.beginPath();
          poly(c, TRACED.mail.flap, true);
          c.clip();
          c.beginPath();
          rrect(c, 300, 372, 860, 471, [44, 0, 0, 62]);
          c.fill();
          c.restore();
        },
      },
    ],
    eyes: [
      { x: 523.5, y: 622, r: 99, side: -1 },
      { x: 911, y: 622, r: 99, side: 1 },
    ],
    eyeStyle: 'mail',
    blink: 'lid',
  },
  drive: {
    title: 'QuantDrive',
    frame: { x0: 29.5, y0: -195, size: 1432 },
    layers: [
      {
        name: 'back',
        draw: (c) => {
          c.beginPath();
          poly(c, TRACED.drive.back, true);
          c.fill();
        },
      },
      {
        name: 'front',
        draw: (c) => {
          c.beginPath();
          poly(c, TRACED.drive.front, true);
          c.fill();
        },
      },
    ],
    eyes: [
      { x: 634, y: 590, r: 76.5, side: -1 },
      { x: 900.2, y: 590.3, r: 76.5, side: 1 },
    ],
    eyeStyle: 'drive',
    blink: 'lid',
  },
  contacts: {
    title: 'QuantContacts',
    frame: { x0: 309, y0: 128, size: 824 },
    layers: [
      {
        name: 'back',
        draw: (c) => {
          c.beginPath();
          c.arc(802.6, 472.0, 106.6, 0, Math.PI * 2);
          c.fill();
          c.beginPath();
          rrect(c, 626, 596, 355, 164, [105, 105, 56, 56]);
          c.fill();
        },
      },
      {
        name: 'front',
        draw: (c) => {
          c.beginPath();
          c.arc(688.5, 425.2, 136.5, 0, Math.PI * 2);
          c.fill();
          c.beginPath();
          rrect(c, 461, 583, 449, 208, [135, 135, 74, 74]);
          c.fill();
        },
      },
    ],
    eyes: [
      { x: 647, y: 404, r: 19, side: -1 },
      { x: 730, y: 404, r: 19, side: 1 },
    ],
    eyeStyle: 'contacts',
    blink: 'squash',
  },
  git: {
    title: 'QuantGit',
    frame: { x0: 95, y0: 85, size: 1079 },
    layers: [
      {
        name: 'hex',
        draw: (c) => {
          c.beginPath();
          poly(c, TRACED.git.hex, false);
          c.fill();
        },
      },
      {
        name: 'cat',
        draw: (c) => {
          c.beginPath();
          poly(c, TRACED.git.cat, false);
          c.fill();
        },
      },
    ],
    // Almond eyes fitted to the reference eye holes.
    eyes: [
      { x: 517.5, y: 724, r: 30, side: -1, lens: [0.93, 0.47, 0.42, -54] },
      { x: 616.5, y: 722, r: 44, side: 1, lens: [0.99, 0.43, 0.42, 33.3] },
    ],
    eyeStyle: 'git',
    blink: 'squash',
  },
  calendar: {
    title: 'QuantCalendar',
    frame: { x0: 178, y0: 170.5, size: 895 },
    layers: [
      {
        name: 'header',
        draw: (c) => {
          c.beginPath();
          rrect(c, 376, 364, 500, 330, 78);
          c.fill();
        },
      },
      {
        name: 'card',
        draw: (c) => {
          c.beginPath();
          rrect(c, 375.5, 500, 500.5, 425, 81);
          c.fill();
        },
      },
    ],
    // The two binder rings double as the calendar's eyes.
    eyes: [
      { x: 520.5, y: 374.5, r: 63.5, side: -1 },
      { x: 731.5, y: 374.5, r: 63.5, side: 1 },
    ],
    eyeStyle: 'calendar',
    blink: 'squash',
  },
};
