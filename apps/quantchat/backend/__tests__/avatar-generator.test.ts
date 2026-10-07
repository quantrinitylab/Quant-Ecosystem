import { describe, it, expect } from 'vitest';
import {
  ALIEN_STYLES,
  REACTION_EMOTIONS,
  NO_FACE_ERROR_MESSAGE,
  NoFaceError,
  buildReactionMap,
  decodeImagePayload,
  detectFace,
  fromPrismaStyle,
  generateAvatarSvg,
  generateAvatarVariants,
  generateAvatars,
  hashImage,
  svgToDataUri,
  toPrismaStyle,
} from '../lib/avatar-generator';

// Deterministic, high-entropy buffer that passes face detection.
function faceLikeBuffer(size = 4096, seed = 7): Uint8Array {
  const buf = new Uint8Array(size);
  let x = seed >>> 0;
  for (let i = 0; i < size; i++) {
    // xorshift → spreads bytes across all 256 values (high entropy)
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    buf[i] = (x >>> 0) % 256;
  }
  return buf;
}

describe('hashImage', () => {
  it('is deterministic for identical input', () => {
    const a = faceLikeBuffer();
    expect(hashImage(a)).toBe(hashImage(faceLikeBuffer()));
  });

  it('differs for different inputs', () => {
    expect(hashImage(faceLikeBuffer(4096, 1))).not.toBe(hashImage(faceLikeBuffer(4096, 2)));
  });
});

describe('detectFace (Task 5.3)', () => {
  it('rejects buffers below the minimum size', () => {
    const res = detectFace(new Uint8Array(10));
    expect(res.hasFace).toBe(false);
    expect(res.confidence).toBe(0);
  });

  it('rejects a uniform / blank image (no face)', () => {
    const blank = new Uint8Array(4096).fill(128);
    const res = detectFace(blank);
    expect(res.hasFace).toBe(false);
  });

  it('accepts a high-entropy face-like photo with a confidence in [0,1]', () => {
    const res = detectFace(faceLikeBuffer());
    expect(res.hasFace).toBe(true);
    expect(res.confidence).toBeGreaterThan(0);
    expect(res.confidence).toBeLessThanOrEqual(1);
  });
});

describe('generateAvatars (Property 11 — exactly 3 variants, Task 5.4)', () => {
  it('produces exactly 3 variants, one per alien style', () => {
    const result = generateAvatars(faceLikeBuffer());
    expect(result.variants).toHaveLength(3);
    expect(result.variants.map((v) => v.style).sort()).toEqual([...ALIEN_STYLES].sort());
  });

  it('completes well under the 10s budget', () => {
    const result = generateAvatars(faceLikeBuffer());
    expect(result.processingTimeMs).toBeLessThan(10_000);
  });

  it('throws NoFaceError with the user-facing message when no face is detected', () => {
    const blank = new Uint8Array(4096).fill(0);
    expect(() => generateAvatars(blank)).toThrowError(NoFaceError);
    try {
      generateAvatars(blank);
    } catch (err) {
      expect((err as NoFaceError).message).toBe(NO_FACE_ERROR_MESSAGE);
    }
  });

  it('is deterministic — same photo yields identical variants', () => {
    const a = generateAvatars(faceLikeBuffer());
    const b = generateAvatars(faceLikeBuffer());
    expect(a.variants).toEqual(b.variants);
  });
});

describe('generateAvatarVariants — distinctness', () => {
  it('emits data-URI SVGs', () => {
    const variants = generateAvatarVariants(faceLikeBuffer());
    for (const v of variants) {
      expect(v.imageUrl.startsWith('data:image/svg+xml;base64,')).toBe(true);
      expect(v.thumbnailUrl.startsWith('data:image/svg+xml;base64,')).toBe(true);
    }
  });

  it('produces visually distinct artwork per style', () => {
    const variants = generateAvatarVariants(faceLikeBuffer());
    const urls = new Set(variants.map((v) => v.imageUrl));
    expect(urls.size).toBe(3);
  });
});

describe('generateAvatarSvg', () => {
  it('returns a valid svg document referencing the style', () => {
    const svg = generateAvatarSvg('crystalline', 12345);
    expect(svg).toContain('<svg');
    expect(svg).toContain('crystalline');
  });

  it('round-trips through svgToDataUri', () => {
    const svg = generateAvatarSvg('cybernetic', 999);
    const uri = svgToDataUri(svg);
    const base64 = uri.split(',')[1]!;
    expect(Buffer.from(base64, 'base64').toString('utf-8')).toBe(svg);
  });
});

describe('buildReactionMap (Property 13 — all emotions animated)', () => {
  it('provides a non-null animation for every reaction emotion', () => {
    const map = buildReactionMap();
    for (const emotion of REACTION_EMOTIONS) {
      expect(map[emotion]).toBeDefined();
      expect(map[emotion].animation.length).toBeGreaterThan(0);
      expect(map[emotion].durationMs).toBeGreaterThan(0);
    }
  });
});

describe('style mapping + payload decoding', () => {
  it('maps styles to/from the Prisma enum', () => {
    expect(toPrismaStyle('crystalline')).toBe('CRYSTALLINE');
    expect(fromPrismaStyle('BIOLUMINESCENT')).toBe('bioluminescent');
  });

  it('decodes both raw base64 and data-URI payloads', () => {
    const raw = Buffer.from('hello-bytes').toString('base64');
    expect(Buffer.from(decodeImagePayload(raw)).toString('utf-8')).toBe('hello-bytes');
    const dataUri = `data:image/jpeg;base64,${raw}`;
    expect(Buffer.from(decodeImagePayload(dataUri)).toString('utf-8')).toBe('hello-bytes');
  });
});
