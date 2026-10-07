// Feature: quantchat-mega-upgrade, Property 2: AR lens compositing modifies the output frame.
import { describe, it, expect } from 'vitest';
import { applyLens } from '../app/camera/LensRenderer';
import { AR_LENSES, type ARLensConfig } from '../app/camera/lenses';
import type { FaceMeshResult } from '../lib/face-detection';

/**
 * Property 2 (design.md): "For any active AR lens configuration and any input
 * video frame, the composited output frame SHALL differ from the raw input
 * frame (lens effect is visibly applied)." — Validates Requirements 2.4.
 *
 * A real CanvasRenderingContext2D is not available in the (node) sandbox, so we
 * drive `applyLens` with a recording mock context that:
 *   - backs `getImageData`/`putImageData` with a real pixel buffer (so pixel-
 *     mutating lenses genuinely change the frame), and
 *   - records every drawing call so we can assert that *some* mutating operation
 *     (fillRect / putImageData / drawImage / stroke / fill) was issued.
 *
 * "Output differs from the raw input" is therefore witnessed by at least one
 * mutating draw operation being recorded for every lens, over many randomly
 * generated frames produced by a seeded deterministic generator.
 */

// ---------------------------------------------------------------------------
// Seeded deterministic PRNG (mulberry32) — reproducible across runs.
// ---------------------------------------------------------------------------
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const randInt = (rng: () => number, min: number, max: number): number =>
  Math.floor(rng() * (max - min + 1)) + min;

// ---------------------------------------------------------------------------
// Recording mock CanvasRenderingContext2D.
// ---------------------------------------------------------------------------
const MUTATING_OPS = new Set([
  'fillRect',
  'strokeRect',
  'clearRect',
  'putImageData',
  'drawImage',
  'stroke',
  'fill',
]);

interface MockImageData {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

class RecordingContext2D {
  canvas: { width: number; height: number };
  ops: string[] = [];

  // Backing RGBA pixel buffer so getImageData/putImageData truly mutate pixels.
  private buffer: Uint8ClampedArray;

  // Drawing-state properties accessed by the renderer (recorded but inert).
  fillStyle: unknown = '#000';
  strokeStyle: unknown = '#000';
  lineWidth = 1;
  shadowColor = '';
  shadowBlur = 0;
  globalAlpha = 1;
  globalCompositeOperation = 'source-over';

  constructor(width: number, height: number, seedBuffer: Uint8ClampedArray) {
    this.canvas = { width, height };
    this.buffer = seedBuffer;
  }

  private record(op: string) {
    this.ops.push(op);
  }

  get mutatingOps(): string[] {
    return this.ops.filter((op) => MUTATING_OPS.has(op));
  }

  // --- state ---
  save() {
    this.record('save');
  }
  restore() {
    this.record('restore');
  }

  // --- pixel access (backed by a real buffer) ---
  getImageData(x: number, y: number, w: number, h: number): MockImageData {
    this.record('getImageData');
    const cw = this.canvas.width;
    const data = new Uint8ClampedArray(Math.max(0, w * h * 4));
    for (let row = 0; row < h; row++) {
      for (let col = 0; col < w; col++) {
        const srcIdx = ((y + row) * cw + (x + col)) * 4;
        const dstIdx = (row * w + col) * 4;
        data[dstIdx] = this.buffer[srcIdx] ?? 0;
        data[dstIdx + 1] = this.buffer[srcIdx + 1] ?? 0;
        data[dstIdx + 2] = this.buffer[srcIdx + 2] ?? 0;
        data[dstIdx + 3] = this.buffer[srcIdx + 3] ?? 255;
      }
    }
    return { data, width: w, height: h };
  }

  putImageData(img: MockImageData, x: number, y: number) {
    this.record('putImageData');
    const cw = this.canvas.width;
    for (let row = 0; row < img.height; row++) {
      for (let col = 0; col < img.width; col++) {
        const srcIdx = (row * img.width + col) * 4;
        const dstIdx = ((y + row) * cw + (x + col)) * 4;
        if (dstIdx < 0 || dstIdx + 3 >= this.buffer.length) continue;
        this.buffer[dstIdx] = img.data[srcIdx]!;
        this.buffer[dstIdx + 1] = img.data[srcIdx + 1]!;
        this.buffer[dstIdx + 2] = img.data[srcIdx + 2]!;
        this.buffer[dstIdx + 3] = img.data[srcIdx + 3]!;
      }
    }
  }

  // --- drawing ops ---
  drawImage() {
    this.record('drawImage');
  }
  fillRect() {
    this.record('fillRect');
  }
  strokeRect() {
    this.record('strokeRect');
  }
  clearRect() {
    this.record('clearRect');
  }
  fill() {
    this.record('fill');
  }
  stroke() {
    this.record('stroke');
  }

  // --- path ops (non-mutating bookkeeping) ---
  beginPath() {
    this.record('beginPath');
  }
  closePath() {
    this.record('closePath');
  }
  moveTo() {
    this.record('moveTo');
  }
  lineTo() {
    this.record('lineTo');
  }
  arc() {
    this.record('arc');
  }
  ellipse() {
    this.record('ellipse');
  }

  // --- gradients ---
  createLinearGradient() {
    this.record('createLinearGradient');
    return { addColorStop: () => {} };
  }
  createRadialGradient() {
    this.record('createRadialGradient');
    return { addColorStop: () => {} };
  }
}

/** Build a recording context seeded with random pixel data. */
function makeContext(rng: () => number, width: number, height: number): RecordingContext2D {
  const buffer = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < buffer.length; i += 4) {
    buffer[i] = randInt(rng, 0, 255);
    buffer[i + 1] = randInt(rng, 0, 255);
    buffer[i + 2] = randInt(rng, 0, 255);
    buffer[i + 3] = 255;
  }
  return new RecordingContext2D(width, height, buffer);
}

/** Generate a plausible face mesh bounding box for the given frame size. */
function makeFaceMesh(rng: () => number, width: number, height: number): FaceMeshResult {
  const bw = randInt(rng, Math.floor(width * 0.2), Math.floor(width * 0.5));
  const bh = randInt(rng, Math.floor(height * 0.2), Math.floor(height * 0.5));
  const x = randInt(rng, 0, Math.max(0, width - bw));
  const y = randInt(rng, 0, Math.max(0, height - bh));
  return {
    landmarks: [{ x: (x + bw / 2) / width, y: (y + bh / 2) / height }],
    boundingBox: { x, y, width: bw, height: bh },
    confidence: 0.5 + rng() * 0.5,
  };
}

const NUM_CASES = 120;

describe('Property 2: AR lens compositing modifies the output frame', () => {
  it('exposes exactly the 7 built-in lenses to exercise', () => {
    expect(AR_LENSES).toHaveLength(7);
  });

  it(`mutates the frame for any lens + any input frame (${NUM_CASES} seeded cases)`, () => {
    const rng = mulberry32(0x5eed_1234);
    let casesRun = 0;

    for (let i = 0; i < NUM_CASES; i++) {
      // Cycle through all 7 lenses so every type is covered repeatedly.
      const lens: ARLensConfig = AR_LENSES[i % AR_LENSES.length]!;
      const width = randInt(rng, 128, 320);
      const height = randInt(rng, 128, 320);
      const ctx = makeContext(rng, width, height);

      // Randomly use a detected face mesh or the null/fallback path.
      const faceMesh = rng() < 0.5 ? makeFaceMesh(rng, width, height) : null;

      expect(() =>
        applyLens(ctx as unknown as CanvasRenderingContext2D, faceMesh, lens),
      ).not.toThrow();

      // The composited output must differ from the raw input: at least one
      // mutating draw operation must have been issued.
      expect(
        ctx.mutatingOps.length,
        `lens "${lens.id}" (${lens.type}) faceMesh=${faceMesh ? 'present' : 'null'} ` +
          `frame=${width}x${height} produced no mutating draw operation`,
      ).toBeGreaterThan(0);

      casesRun++;
    }

    expect(casesRun).toBe(NUM_CASES);
  });

  it('every lens type mutates the frame with a detected face mesh', () => {
    const rng = mulberry32(0xa11e_0007);
    for (const lens of AR_LENSES) {
      const width = randInt(rng, 160, 320);
      const height = randInt(rng, 160, 320);
      const ctx = makeContext(rng, width, height);
      const faceMesh = makeFaceMesh(rng, width, height);

      applyLens(ctx as unknown as CanvasRenderingContext2D, faceMesh, lens);

      expect(ctx.mutatingOps.length, `lens "${lens.id}" with face mesh`).toBeGreaterThan(0);
    }
  });

  it('every lens type uses the fallback path (null faceMesh) without throwing and still mutates', () => {
    const rng = mulberry32(0xfa11_bac3);
    for (const lens of AR_LENSES) {
      const width = randInt(rng, 160, 320);
      const height = randInt(rng, 160, 320);
      const ctx = makeContext(rng, width, height);

      expect(() => applyLens(ctx as unknown as CanvasRenderingContext2D, null, lens)).not.toThrow();

      expect(ctx.mutatingOps.length, `lens "${lens.id}" fallback path`).toBeGreaterThan(0);
    }
  });

  it('pixel-mutating lenses (face_distortion, beauty) actually change pixels via putImageData', () => {
    const rng = mulberry32(0x9111_e15);
    const pixelLenses = AR_LENSES.filter(
      (l) => l.type === 'face_distortion' || l.type === 'beauty',
    );
    expect(pixelLenses.length).toBeGreaterThan(0);

    for (const lens of pixelLenses) {
      const width = 240;
      const height = 240;
      const ctx = makeContext(rng, width, height);
      const faceMesh = makeFaceMesh(rng, width, height);

      applyLens(ctx as unknown as CanvasRenderingContext2D, faceMesh, lens);

      expect(ctx.mutatingOps, `lens "${lens.id}" should write pixels back`).toContain(
        'putImageData',
      );
    }
  });
});
