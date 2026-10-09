import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  FROG_RUNS,
  getFrogCells,
  isSymmetric,
  shade,
  createBlinkState,
  blinkAmount,
  paintFrog,
  BLINK_CLOSE_S,
  BLINK_HOLD_S,
  BLINK_OPEN_S,
} from '../quantgit-frog';
import {
  emitQuantGitMascotEvent,
  onQuantGitMascotEvent,
  type QuantGitMascotEventKind,
} from '../quantgit-mascot-events';
import type { MarkFrame } from '../useLiveMark';

// QuantGit voxel frog — the official mascot. These tests pin the design
// invariants (symmetry, eye alignment, no fake geometry) and the animation
// state machines (blink, event bridge) without needing a real canvas.

describe('quantgit-frog voxel data', () => {
  it('builds a non-trivial run list', () => {
    expect(FROG_RUNS.length).toBeGreaterThan(40);
  });

  it('stays inside the mark plate', () => {
    for (const r of FROG_RUNS) {
      expect(r.x0).toBeGreaterThanOrEqual(-9);
      expect(r.x1).toBeLessThanOrEqual(9);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeLessThanOrEqual(13);
      expect(r.z).toBeGreaterThanOrEqual(0);
      expect(r.z).toBeLessThanOrEqual(5);
      expect(r.x0).toBeLessThanOrEqual(r.x1);
    }
  });

  it('is sorted back-to-front so faces overlap correctly', () => {
    for (let i = 1; i < FROG_RUNS.length; i++) {
      const a = FROG_RUNS[i - 1]!;
      const b = FROG_RUNS[i]!;
      expect(a.z < b.z || (a.z === b.z && a.y >= b.y)).toBe(true);
    }
  });

  it('is symmetric about the vertical centre (frog body; accents deliberately scattered)', () => {
    expect(isSymmetric()).toBe(true);
  });

  it('has two aligned eyes with pupils inside the whites', () => {
    const cells = getFrogCells();
    const at = (x: number, y: number, z: number) => cells.get(`${x},${y},${z}`);
    // Eye whites: 3×2 at z 2..3 on both sides, same rows, mirrored.
    for (const sx of [-1, 1]) {
      for (let y = 11; y <= 12; y++) {
        for (let x = 4; x <= 6; x++) {
          const c = at(sx * x, y, 2);
          expect(c?.role, `white cell (${sx * x},${y},2)`).toBe('eye-white');
        }
      }
      // Pupil: 1×2, centred in the white, one layer proud.
      for (let y = 11; y <= 12; y++) {
        expect(at(sx * 5, y, 3)?.role, `pupil cell (${sx * 5},${y},3)`).toBe('pupil');
      }
      // Dark pupil against pale white — the contrast the reference needs.
      expect(at(sx * 5, 11, 3)?.color).toBe('#160B26');
      expect(at(sx * 4, 11, 2)?.color).toBe('#F5F2FF');
    }
  });

  it('keeps the laptop dark and in front of the frog', () => {
    const laptop = FROG_RUNS.filter((r) => r.role === 'laptop');
    expect(laptop.length).toBeGreaterThan(0);
    const maxFrogZ = Math.max(...FROG_RUNS.filter((r) => r.role === 'body').map((r) => r.z));
    const minLaptopZ = Math.min(...laptop.map((r) => r.z));
    expect(minLaptopZ).toBeGreaterThan(maxFrogZ);
  });

  it('has a pale belly proud of the body', () => {
    const belly = FROG_RUNS.filter((r) => r.role === 'belly');
    expect(belly.length).toBeGreaterThan(0);
    for (const b of belly) expect(b.color).toMatch(/^#D|#E/);
  });
});

describe('shade()', () => {
  it('lightens and darkens hex colours', () => {
    expect(shade('#808080', 2)).toBe('#ffffff');
    expect(shade('#808080', 0.5)).toBe('#404040');
    expect(shade('#8B46D9', 1)).toBe('#8b46d9');
  });
});

describe('blink state machine', () => {
  // Deterministic random: always the midpoint of the idle range.
  const mid = () => 0.5;

  it('starts open and stays open until the scheduled blink', () => {
    const s = createBlinkState(100, mid);
    expect(s.nextBlinkAt).toBe(100 + 2.2 + 0.5 * 3);
    expect(blinkAmount(s, 100, mid)).toBe(0);
    expect(blinkAmount(s, s.nextBlinkAt - 0.001, mid)).toBe(0);
  });

  it('closes, holds, and reopens through the full timeline', () => {
    const s = createBlinkState(0, mid);
    const t0 = s.nextBlinkAt;
    expect(blinkAmount(s, t0, mid)).toBe(0); // blink starts
    const closing = blinkAmount(s, t0 + BLINK_CLOSE_S / 2, mid);
    expect(closing).toBeGreaterThan(0);
    expect(closing).toBeLessThan(1);
    expect(blinkAmount(s, t0 + BLINK_CLOSE_S + BLINK_HOLD_S / 2, mid)).toBe(1);
    const opening = blinkAmount(s, t0 + BLINK_CLOSE_S + BLINK_HOLD_S + BLINK_OPEN_S / 2, mid);
    expect(opening).toBeGreaterThan(0);
    expect(opening).toBeLessThan(1);
    // After the full cycle the eyes are open and the next blink is rescheduled.
    const total = BLINK_CLOSE_S + BLINK_HOLD_S + BLINK_OPEN_S;
    expect(blinkAmount(s, t0 + total + 0.001, mid)).toBe(0);
    expect(s.blinkStart).toBe(-1);
    expect(s.nextBlinkAt).toBeGreaterThan(t0 + total);
  });

  it('never double-books a blink while one is in flight', () => {
    const s = createBlinkState(0, mid);
    const t0 = s.nextBlinkAt;
    blinkAmount(s, t0, mid);
    const firstStart = s.blinkStart;
    blinkAmount(s, t0 + 0.01, mid);
    expect(s.blinkStart).toBe(firstStart);
  });

  it('randomises the idle interval (no robotic fixed rhythm)', () => {
    const seq = [0, 0.999, 0.25];
    let i = 0;
    const rand = () => seq[i++ % seq.length]!;
    const a = createBlinkState(0, rand);
    const b = createBlinkState(0, rand);
    const c = createBlinkState(0, rand);
    expect(new Set([a.nextBlinkAt, b.nextBlinkAt, c.nextBlinkAt]).size).toBe(3);
  });
});

describe('mascot event bridge', () => {
  const listeners = new Map<string, Array<(e: { type: string; detail: unknown }) => void>>();
  const fakeWindow = {
    dispatchEvent(e: { type: string; detail: unknown }) {
      for (const fn of listeners.get(e.type) ?? []) fn(e);
      return true;
    },
    addEventListener(type: string, fn: (e: { type: string; detail: unknown }) => void) {
      const arr = listeners.get(type) ?? [];
      arr.push(fn);
      listeners.set(type, arr);
    },
    removeEventListener(type: string, fn: (e: { type: string; detail: unknown }) => void) {
      listeners.set(type, (listeners.get(type) ?? []).filter((f) => f !== fn));
    },
  };

  beforeEach(() => {
    listeners.clear();
    (globalThis as Record<string, unknown>).window = fakeWindow;
  });

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).window;
  });

  it('delivers confirmed git events to subscribers', () => {
    const seen: QuantGitMascotEventKind[] = [];
    const off = onQuantGitMascotEvent((k) => seen.push(k));
    emitQuantGitMascotEvent('commit');
    emitQuantGitMascotEvent('branch');
    expect(seen).toEqual(['commit', 'branch']);
    off();
    emitQuantGitMascotEvent('push');
    expect(seen).toEqual(['commit', 'branch']);
  });

  it('is a no-op without a window (SSR safety)', () => {
    delete (globalThis as Record<string, unknown>).window;
    expect(() => emitQuantGitMascotEvent('commit')).not.toThrow();
    expect(() => onQuantGitMascotEvent(() => {})()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// paintFrog against a mock 2D context (node has no canvas).
// ---------------------------------------------------------------------------

interface FillCall {
  style: string;
  w: number;
  h: number;
}

function createMockContext() {
  const fills: FillCall[] = [];
  let fillStyle = '#000000';
  const gradient = { addColorStop: () => {} };
  const ctx = new Proxy(
    {},
    {
      get(_t, prop: string | symbol) {
        if (prop === 'fillStyle') return fillStyle;
        if (prop === 'createLinearGradient' || prop === 'createRadialGradient')
          return () => gradient;
        if (prop === 'createImageData')
          return (w: number, h: number) => ({
            data: new Uint8ClampedArray(w * h * 4),
            width: w,
            height: h,
          });
        if (typeof prop === 'string') {
          return (...args: unknown[]) => {
            if (prop === 'fillRect') {
              fills.push({ style: fillStyle, w: args[2] as number, h: args[3] as number });
            }
          };
        }
        return undefined;
      },
      set(_t, prop: string | symbol, value: unknown) {
        if (prop === 'fillStyle') fillStyle = String(value);
        return true;
      },
    },
  );
  return { ctx: ctx as unknown as CanvasRenderingContext2D, fills };
}

function stubDocument(ctx: CanvasRenderingContext2D) {
  const fakeCanvas = {
    width: 0,
    height: 0,
    getContext: () => ctx,
  };
  (globalThis as Record<string, unknown>).document = {
    createElement: () => fakeCanvas,
  };
}

function baseFrame(ctx: CanvasRenderingContext2D, time: number): MarkFrame {
  return {
    ctx,
    res: 100,
    cx: 50,
    cy: 50,
    time,
    tiltX: 0,
    tiltY: 0,
    hover: 0,
    press: 0,
    reduced: false,
  };
}

describe('paintFrog rendering', () => {
  let unstub: () => void;

  beforeEach(() => {
    const { ctx } = createMockContext();
    stubDocument(ctx);
    unstub = () => {
      delete (globalThis as Record<string, unknown>).document;
    };
  });

  afterEach(() => unstub());

  it('paints the scene without throwing and draws every voxel run', () => {
    const { ctx, fills } = createMockContext();
    stubDocument(ctx);
    const blink = { nextBlinkAt: 9999, blinkStart: -1 };
    expect(() => paintFrog(baseFrame(ctx, 10), blink, 0)).not.toThrow();
    // One fillRect per voxel run (front faces) plus plate/vignette rects.
    expect(fills.length).toBeGreaterThan(FROG_RUNS.length);
  });

  it('draws open eyes normally and compresses them to a slit at full lid', () => {
    const open = createMockContext();
    stubDocument(open.ctx);
    paintFrog(baseFrame(open.ctx, 10), { nextBlinkAt: 9999, blinkStart: -1 }, 0);
    const openEyeFills = open.fills.filter((f) => f.style === '#F5F2FF');
    expect(openEyeFills.length).toBeGreaterThan(0);
    const openArea = openEyeFills.reduce((a, f) => a + f.w * f.h, 0);

    const shut = createMockContext();
    stubDocument(shut.ctx);
    // Mid-hold: age 0.1s into the blink (close 0.09 + hold 0.05).
    paintFrog(baseFrame(shut.ctx, 10), { nextBlinkAt: 9999, blinkStart: 9.9 }, 0);
    const shutEyeFills = shut.fills.filter((f) => f.style === '#F5F2FF');
    const shutArea = shutEyeFills.reduce((a, f) => a + f.w * f.h, 0);
    // A genuine lid motion: the eye compresses to a slit, it does not flash off.
    expect(shutArea).toBeLessThan(openArea * 0.2);
  });

  it('renders a frozen frame under reduced motion', () => {
    const { ctx, fills } = createMockContext();
    stubDocument(ctx);
    const frame = { ...baseFrame(ctx, 10), reduced: true };
    expect(() => paintFrog(frame, { nextBlinkAt: 9999, blinkStart: -1 }, 0)).not.toThrow();
    expect(fills.length).toBeGreaterThan(FROG_RUNS.length);
  });

  it('renders the acknowledgement lift-and-squint without throwing', () => {
    const { ctx } = createMockContext();
    stubDocument(ctx);
    // ackT = 0.5 mid-acknowledgement: no glow is painted anymore (clean pass),
    // just the lift + squint motion.
    expect(() => paintFrog(baseFrame(ctx, 10), { nextBlinkAt: 9999, blinkStart: -1 }, 0.5)).not.toThrow();
  });
});
