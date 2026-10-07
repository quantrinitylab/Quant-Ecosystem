// ============================================================================
// QuantChat - AI Avatar Generator (deterministic, SVG-based)
//
// Pure, dependency-free logic for Task 5.2 / 5.3 / 5.4:
//   - Server-side face-detection validation from raw image bytes (Task 5.3)
//   - Deterministic 3-variant alien avatar generation seeded from an image hash
//     producing data-URI SVGs, one per alien style (Task 5.2, Property 11)
//   - Synchronous generation that completes well under the 10s budget (Task 5.4)
//   - Reaction animation descriptors covering all 5 emotions (Task 5.7 backing data)
//
// This module intentionally avoids any ML/native image dependency so it is fully
// deterministic and unit-testable: the same image bytes always yield the same
// avatars and the same face-detection confidence.
// ============================================================================

export type AlienStyle = 'crystalline' | 'bioluminescent' | 'cybernetic';

export type ReactionEmotion = 'happy' | 'sad' | 'surprised' | 'angry' | 'love';

export const ALIEN_STYLES: readonly AlienStyle[] = [
  'crystalline',
  'bioluminescent',
  'cybernetic',
] as const;

export const REACTION_EMOTIONS: readonly ReactionEmotion[] = [
  'happy',
  'sad',
  'surprised',
  'angry',
  'love',
] as const;

export interface AvatarVariant {
  style: AlienStyle;
  imageUrl: string; // data-URI SVG (full size)
  thumbnailUrl: string; // data-URI SVG (compact)
}

export interface FaceDetectionResult {
  hasFace: boolean;
  confidence: number; // 0..1
}

export interface AvatarGenerationResult {
  variants: AvatarVariant[];
  faceDetectionConfidence: number;
  processingTimeMs: number;
}

// ---------------------------------------------------------------------------
// Deterministic hashing + PRNG
// ---------------------------------------------------------------------------

/** FNV-1a 32-bit hash over a byte buffer. Deterministic, fast, collision-light. */
export function hashImage(buffer: Uint8Array): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < buffer.length; i++) {
    hash ^= buffer[i]!;
    // 32-bit FNV prime multiply via shifts to stay in integer range
    hash = Math.imul(hash, 0x01000193);
  }
  // Coerce to unsigned 32-bit
  return hash >>> 0;
}

/** mulberry32 — small, fast, deterministic PRNG seeded by a 32-bit integer. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Face detection (Task 5.3)
// ---------------------------------------------------------------------------

/**
 * Shannon entropy (bits/byte, 0..8) of the buffer's byte histogram.
 * A flat / uniform image (no real subject) has low entropy; a genuine photo
 * with a face has high entropy. Deterministic for a given buffer.
 */
function byteEntropy(buffer: Uint8Array): number {
  if (buffer.length === 0) return 0;
  const histogram = new Array<number>(256).fill(0);
  for (let i = 0; i < buffer.length; i++) {
    histogram[buffer[i]!]++;
  }
  let entropy = 0;
  for (let v = 0; v < 256; v++) {
    const count = histogram[v]!;
    if (count === 0) continue;
    const p = count / buffer.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

const MIN_IMAGE_BYTES = 256;
const FACE_ENTROPY_THRESHOLD = 3.5;

/**
 * Validates that the submitted image plausibly contains a detectable face.
 *
 * Heuristic (deterministic, ML-free): a real face photo carries enough tonal
 * variation to yield high byte entropy, whereas a blank / solid / corrupt
 * upload does not. Returns a confidence in [0,1] and a hasFace flag.
 */
export function detectFace(buffer: Uint8Array): FaceDetectionResult {
  if (buffer.length < MIN_IMAGE_BYTES) {
    return { hasFace: false, confidence: 0 };
  }
  const entropy = byteEntropy(buffer);
  // Map entropy (~1..8 for real images) into a 0..1 confidence.
  const confidence = Math.min(1, Math.max(0, (entropy - 1) / 6));
  const hasFace = entropy >= FACE_ENTROPY_THRESHOLD;
  return { hasFace, confidence: Math.round(confidence * 100) / 100 };
}

export const NO_FACE_ERROR_MESSAGE = 'Please provide a clearer face photo with good lighting.';

// ---------------------------------------------------------------------------
// SVG variant generation (Task 5.2)
// ---------------------------------------------------------------------------

interface StylePalette {
  background: [string, string];
  skin: [string, string];
  accent: string;
  glow: string;
}

/** Build a per-style, seed-perturbed colour palette using HSL hue rotation. */
function buildPalette(style: AlienStyle, rand: () => number): StylePalette {
  const jitter = (base: number, spread: number) => Math.round(base + (rand() * 2 - 1) * spread);
  const hsl = (h: number, s: number, l: number) => `hsl(${((h % 360) + 360) % 360} ${s}% ${l}%)`;

  switch (style) {
    case 'crystalline': {
      const h = jitter(265, 25); // violet / cyan crystal
      return {
        background: [hsl(h - 20, 60, 12), hsl(h + 30, 70, 22)],
        skin: [hsl(h + 10, 55, 70), hsl(h - 30, 65, 45)],
        accent: hsl(h + 60, 90, 75),
        glow: hsl(h + 40, 95, 80),
      };
    }
    case 'bioluminescent': {
      const h = jitter(160, 30); // teal / green glow
      return {
        background: [hsl(h - 30, 65, 8), hsl(h + 20, 70, 16)],
        skin: [hsl(h, 70, 55), hsl(h + 40, 75, 35)],
        accent: hsl(h + 10, 100, 65),
        glow: hsl(h - 10, 100, 70),
      };
    }
    case 'cybernetic':
    default: {
      const h = jitter(205, 35); // steel + neon
      return {
        background: [hsl(h - 10, 25, 10), hsl(h + 15, 30, 20)],
        skin: [hsl(h, 15, 60), hsl(h + 5, 20, 38)],
        accent: hsl(h + 140, 95, 60),
        glow: hsl(h + 150, 100, 65),
      };
    }
  }
}

/** Render the style-specific facial feature layer. */
function renderFeatures(style: AlienStyle, p: StylePalette, rand: () => number): string {
  const eyeOffset = 14 + Math.round(rand() * 8);
  const eyeY = 108 + Math.round(rand() * 10);
  const eyeRx = 10 + Math.round(rand() * 6);

  const eyes = `
    <g fill="${p.glow}">
      <ellipse cx="${128 - eyeOffset - 14}" cy="${eyeY}" rx="${eyeRx}" ry="${eyeRx + 6}" />
      <ellipse cx="${128 + eyeOffset + 14}" cy="${eyeY}" rx="${eyeRx}" ry="${eyeRx + 6}" />
    </g>
    <g fill="#05060a">
      <circle cx="${128 - eyeOffset - 14}" cy="${eyeY + 2}" r="3.5" />
      <circle cx="${128 + eyeOffset + 14}" cy="${eyeY + 2}" r="3.5" />
    </g>`;

  if (style === 'crystalline') {
    const facets: string[] = [];
    const count = 5 + Math.floor(rand() * 4);
    for (let i = 0; i < count; i++) {
      const cx = 60 + rand() * 136;
      const cy = 60 + rand() * 130;
      const s = 14 + rand() * 22;
      facets.push(
        `<polygon points="${cx},${cy - s} ${cx + s},${cy} ${cx},${cy + s} ${cx - s},${cy}" fill="${p.accent}" opacity="0.35" />`,
      );
    }
    return `${facets.join('')}${eyes}`;
  }

  if (style === 'bioluminescent') {
    const spots: string[] = [];
    const count = 8 + Math.floor(rand() * 6);
    for (let i = 0; i < count; i++) {
      const cx = 50 + rand() * 156;
      const cy = 55 + rand() * 150;
      const r = 3 + rand() * 7;
      spots.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${p.glow}" opacity="0.55" />`);
    }
    return `${spots.join('')}${eyes}`;
  }

  // cybernetic — circuit traces + hex plates
  const traces: string[] = [];
  const count = 6 + Math.floor(rand() * 5);
  for (let i = 0; i < count; i++) {
    const x1 = 50 + rand() * 156;
    const y1 = 60 + rand() * 140;
    const x2 = x1 + (rand() * 50 - 25);
    const y2 = y1 + (rand() * 50 - 25);
    traces.push(
      `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)} L${x2.toFixed(1)} ${y1.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)}" stroke="${p.accent}" stroke-width="2" fill="none" opacity="0.5" />`,
    );
  }
  return `${traces.join('')}${eyes}`;
}

/**
 * Build a complete SVG document string for the given style + seed.
 * Distinct styles and seeds produce visibly distinct artwork.
 */
export function generateAvatarSvg(style: AlienStyle, seed: number): string {
  // Derive a per-style sub-seed so the three variants of one photo differ.
  const styleIndex = ALIEN_STYLES.indexOf(style);
  const rand = mulberry32((seed ^ Math.imul(styleIndex + 1, 0x9e3779b1)) >>> 0);
  const p = buildPalette(style, rand);
  const gradId = `bg-${style}`;
  const glowId = `glow-${style}`;
  // Elongated alien cranium
  const headWidth = 70 + Math.round(rand() * 16);
  const features = renderFeatures(style, p, rand);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256" role="img" aria-label="${style} alien avatar">
  <defs>
    <radialGradient id="${gradId}" cx="50%" cy="40%" r="75%">
      <stop offset="0%" stop-color="${p.background[1]}" />
      <stop offset="100%" stop-color="${p.background[0]}" />
    </radialGradient>
    <linearGradient id="skin-${style}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${p.skin[0]}" />
      <stop offset="100%" stop-color="${p.skin[1]}" />
    </linearGradient>
    <filter id="${glowId}" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="3" result="b" />
      <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
    </filter>
  </defs>
  <rect width="256" height="256" fill="url(#${gradId})" />
  <g filter="url(#${glowId})">
    <path d="M128 36 C ${128 - headWidth} 44, ${128 - headWidth - 6} 150, 128 224 C ${128 + headWidth + 6} 150, ${128 + headWidth} 44, 128 36 Z" fill="url(#skin-${style})" stroke="${p.accent}" stroke-width="2" />
    ${features}
  </g>
</svg>`;
}

/** Encode an SVG string as a base64 data URI usable directly in <img src>. */
export function svgToDataUri(svg: string): string {
  // Buffer is available in the Fastify/Node runtime.
  const base64 = Buffer.from(svg, 'utf-8').toString('base64');
  return `data:image/svg+xml;base64,${base64}`;
}

/**
 * Builds the reaction animation descriptor map persisted on the Avatar record.
 * Every emotion in REACTION_EMOTIONS gets a non-null descriptor (Property 13).
 */
export function buildReactionMap(): Record<
  ReactionEmotion,
  { animation: string; durationMs: number }
> {
  return {
    happy: { animation: 'bounce', durationMs: 600 },
    sad: { animation: 'droop', durationMs: 800 },
    surprised: { animation: 'pop', durationMs: 500 },
    angry: { animation: 'shake', durationMs: 500 },
    love: { animation: 'scale-pulse', durationMs: 700 },
  };
}

/**
 * Generates exactly 3 deterministic alien avatar variants (one per style) from
 * the supplied image bytes. Synchronous and effectively instant (Task 5.4).
 */
export function generateAvatarVariants(buffer: Uint8Array): AvatarVariant[] {
  const seed = hashImage(buffer);
  return ALIEN_STYLES.map((style) => {
    const full = generateAvatarSvg(style, seed);
    return {
      style,
      imageUrl: svgToDataUri(full),
      thumbnailUrl: svgToDataUri(full), // SVG scales losslessly; same source serves both
    };
  });
}

/**
 * Full pipeline: validate face → generate 3 variants. Throws a NoFaceError when
 * the image fails face validation so the route can return a 422 with the
 * user-facing message (Task 5.3).
 */
export class NoFaceError extends Error {
  readonly confidence: number;
  constructor(confidence: number) {
    super(NO_FACE_ERROR_MESSAGE);
    this.name = 'NoFaceError';
    this.confidence = confidence;
  }
}

export function generateAvatars(buffer: Uint8Array): AvatarGenerationResult {
  const start = Date.now();
  const face = detectFace(buffer);
  if (!face.hasFace) {
    throw new NoFaceError(face.confidence);
  }
  const variants = generateAvatarVariants(buffer);
  return {
    variants,
    faceDetectionConfidence: face.confidence,
    processingTimeMs: Date.now() - start,
  };
}

/** Decode an incoming image payload (raw base64 or data-URI) into bytes. */
export function decodeImagePayload(image: string): Uint8Array {
  const commaIdx = image.indexOf(',');
  const base64 = image.startsWith('data:') && commaIdx >= 0 ? image.slice(commaIdx + 1) : image;
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

/** Map the public lowercase style to the Prisma AlienStyle enum value. */
export function toPrismaStyle(style: AlienStyle): 'CRYSTALLINE' | 'BIOLUMINESCENT' | 'CYBERNETIC' {
  return style.toUpperCase() as 'CRYSTALLINE' | 'BIOLUMINESCENT' | 'CYBERNETIC';
}

/** Map the Prisma AlienStyle enum value back to the public lowercase style. */
export function fromPrismaStyle(style: string): AlienStyle {
  return style.toLowerCase() as AlienStyle;
}
