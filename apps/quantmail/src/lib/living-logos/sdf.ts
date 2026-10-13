/**
 * Signed distance fields for living-logo layers: canvas rasterisation, then an
 * exact Euclidean distance transform (Felzenszwalb & Huttenlocher) with
 * tiny-sdf style sub-pixel seeding from the anti-aliased coverage.
 */
import type { LogoDef } from './shapes';

const INF = 1e20;

function edt1d(
  grid: Float64Array,
  offset: number,
  stride: number,
  length: number,
  f: Float64Array,
  v: Uint16Array,
  z: Float64Array,
): void {
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;
  f[0] = grid[offset];
  for (let q = 1, k = 0, s = 0; q < length; q++) {
    f[q] = grid[offset + q * stride];
    const q2 = q * q;
    do {
      const r = v[k];
      s = (f[q] - f[r] + q2 - r * r) / (q - r) / 2;
    } while (s <= z[k] && --k > -1);
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }
  for (let q = 0, k = 0; q < length; q++) {
    while (z[k + 1] < q) k++;
    const r = v[k];
    const qr = q - r;
    grid[offset + q * stride] = f[r] + qr * qr;
  }
}

function edt(data: Float64Array, n: number, f: Float64Array, v: Uint16Array, z: Float64Array): void {
  for (let x = 0; x < n; x++) edt1d(data, x, n, n, f, v, z);
  for (let y = 0; y < n; y++) edt1d(data, y * n, 1, n, f, v, z);
}

// Fast float32 -> float16 bits.
const f32 = new Float32Array(1);
const u32 = new Uint32Array(f32.buffer);
function toHalf(val: number): number {
  f32[0] = val;
  const x = u32[0];
  const sign = (x >>> 16) & 0x8000;
  const e = ((x >>> 23) & 0xff) - 112;
  const m = x & 0x7fffff;
  if (e <= 0) return sign; // flush tiny values to zero — distances never need denormals
  if (e >= 31) return sign | 0x7bff;
  return sign | ((e << 10) + ((m + 0x1000) >>> 13));
}

function rasterContext(n: number): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
  if (typeof OffscreenCanvas !== 'undefined') {
    const ctx = new OffscreenCanvas(n, n).getContext('2d', { willReadFrequently: true });
    if (ctx) return ctx;
  }
  const canvas = document.createElement('canvas');
  canvas.width = n;
  canvas.height = n;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('living-logos: no 2D canvas for the distance field');
  return ctx;
}

/**
 * Build an RGBA half-float SDF (distance in frame units, positive outside) for
 * up to four layers, as `Uint16Array` half-float bits ready for `RGBA16F`.
 */
export function buildSDF(logo: LogoDef, n: number): Uint16Array {
  const { x0, y0, size } = logo.frame;
  const ctx = rasterContext(n);
  const out = new Uint16Array(n * n * 4);
  const outer = new Float64Array(n * n);
  const inner = new Float64Array(n * n);
  const f = new Float64Array(n);
  const v = new Uint16Array(n);
  const z = new Float64Array(n + 1);
  const far = toHalf(4.0);
  for (let li = 0; li < 4; li++) {
    const layer = logo.layers[li];
    if (!layer) {
      for (let i = 0; i < n * n; i++) out[i * 4 + li] = far;
      continue;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, n, n);
    const s = n / size;
    ctx.setTransform(s, 0, 0, s, -x0 * s, -y0 * s);
    ctx.fillStyle = '#fff';
    layer.draw(ctx);
    const px = ctx.getImageData(0, 0, n, n).data;
    for (let i = 0; i < n * n; i++) {
      const a = px[i * 4 + 3] / 255;
      if (a === 0) {
        outer[i] = INF;
        inner[i] = 0;
      } else if (a === 1) {
        outer[i] = 0;
        inner[i] = INF;
      } else {
        const d = 0.5 - a;
        outer[i] = d > 0 ? d * d : 0;
        inner[i] = d < 0 ? d * d : 0;
      }
    }
    edt(outer, n, f, v, z);
    edt(inner, n, f, v, z);
    for (let y = 0; y < n; y++) {
      const dst = (n - 1 - y) * n; // flip rows: texture v grows upward
      for (let x = 0; x < n; x++) {
        const i = y * n + x;
        const d = (Math.sqrt(outer[i]) - Math.sqrt(inner[i])) / n; // texels -> frame units
        out[(dst + x) * 4 + li] = toHalf(d);
      }
    }
  }
  return out;
}
