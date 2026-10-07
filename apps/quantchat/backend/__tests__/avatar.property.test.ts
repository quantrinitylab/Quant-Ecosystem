// ============================================================================
// Property tests — AI Avatar generation (backend core)
// Spec: quantchat-mega-upgrade, Task 5.9
//
// Covers two of the three avatar properties whose logic lives in the backend
// generator core (Property 12 is a pure frontend surface helper and is tested
// in src/__tests__/avatar-surfaces.property.test.ts):
//
//   Property 11 — avatar generation produces exactly 3 style variants
//   Property 13 — avatar reaction animations cover all emotions
//
// Convention: fast-check is NOT a quantchat dependency. These follow the repo's
// realized property-test convention — a seeded deterministic mulberry32 RNG loop
// with >=100 samples (see quantube playlist.position.property.test.ts).
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  ALIEN_STYLES,
  REACTION_EMOTIONS,
  buildReactionMap,
  detectFace,
  generateAvatarVariants,
  type AlienStyle,
} from '../lib/avatar-generator';

// Deterministic seeded RNG (mulberry32) — mirrors the repo PBT convention.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SAMPLES = 120; // >= 100 cases

/**
 * Build a random face-like image buffer that passes detectFace: uniform random
 * bytes across 0..255 yield high byte entropy (the generator's face heuristic),
 * and we keep the length comfortably above the 256-byte minimum.
 */
function randomFaceBuffer(rand: () => number): Uint8Array {
  const size = 512 + Math.floor(rand() * 7680); // 512..8191 bytes
  const buf = new Uint8Array(size);
  for (let i = 0; i < size; i += 1) {
    buf[i] = Math.floor(rand() * 256);
  }
  return buf;
}

const EXPECTED_STYLES: readonly AlienStyle[] = ['crystalline', 'bioluminescent', 'cybernetic'];

// Feature: quantchat-mega-upgrade, Property 11: avatar generation produces exactly 3 style variants
// **Validates: Requirements 5.3**
describe('Property 11: avatar generation produces exactly 3 distinct style variants', () => {
  it('holds across >=100 randomized face photos that pass detection', () => {
    const rand = mulberry32(0x4156_3131); // "AV11"
    let detectedCases = 0;

    for (let s = 0; s < SAMPLES; s += 1) {
      const buffer = randomFaceBuffer(rand);

      // Precondition: the random buffer must pass face detection. High-entropy
      // random bytes reliably clear the entropy threshold; assert it so the
      // property is exercised on valid (detectable-face) inputs only.
      const detection = detectFace(buffer);
      expect(detection.hasFace).toBe(true);
      detectedCases += 1;

      const variants = generateAvatarVariants(buffer);

      // Exactly 3 variants.
      expect(variants).toHaveLength(3);

      // The 3 styles are exactly the distinct expected set.
      const styles = variants.map((v) => v.style);
      expect(new Set(styles).size).toBe(3);
      expect([...styles].sort()).toEqual([...EXPECTED_STYLES].sort());
      expect([...ALIEN_STYLES].sort()).toEqual([...EXPECTED_STYLES].sort());

      // Each variant carries non-empty image + thumbnail data URIs.
      for (const variant of variants) {
        expect(variant.imageUrl.length).toBeGreaterThan(0);
        expect(variant.thumbnailUrl.length).toBeGreaterThan(0);
        expect(variant.imageUrl.startsWith('data:image/svg+xml;base64,')).toBe(true);
        expect(variant.thumbnailUrl.startsWith('data:image/svg+xml;base64,')).toBe(true);
      }
    }

    // Sanity: every sampled buffer was a valid detectable-face input.
    expect(detectedCases).toBe(SAMPLES);
  });
});

// Feature: quantchat-mega-upgrade, Property 13: avatar reaction animations cover all emotions
// **Validates: Requirements 5.5**
describe('Property 13: reaction map yields a non-null animation for every emotion', () => {
  it('holds across >=100 builds — every emotion is animated', () => {
    const rand = mulberry32(0x4156_3133); // "AV13"

    for (let s = 0; s < SAMPLES; s += 1) {
      const map = buildReactionMap();

      // Probe the emotions in a randomized order each iteration so the property
      // is asserted independent of key ordering.
      const order = [...REACTION_EMOTIONS].sort(() => rand() - 0.5);

      for (const emotion of order) {
        const entry = map[emotion];
        expect(entry).toBeDefined();
        expect(entry).not.toBeNull();
        expect(typeof entry.animation).toBe('string');
        expect(entry.animation.length).toBeGreaterThan(0);
        expect(entry.durationMs).toBeGreaterThan(0);
      }

      // Coverage is exactly the 5 defined emotions — no missing, no extra.
      expect(Object.keys(map).sort()).toEqual([...REACTION_EMOTIONS].sort());
    }
  });
});
