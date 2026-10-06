// P0-3 regression tests: shorts must point at real, playable video assets —
// the old MOCK_SHORTS used /videos/shortN.mp4 + /thumbs/shortN.jpg which 404'd
// (no public/ dir exists), leaving a black player.
import { describe, it, expect } from 'vitest';
import { SAMPLE_SHORTS } from '../data/sample-shorts';

describe('sample shorts (P0-3)', () => {
  it('has 5 shorts with unique ids', () => {
    expect(SAMPLE_SHORTS).toHaveLength(5);
    const ids = SAMPLE_SHORTS.map((s) => s.id);
    expect(new Set(ids).size).toBe(5);
  });

  it('every videoUrl is a real absolute https mp4 (no dead relative paths)', () => {
    for (const s of SAMPLE_SHORTS) {
      expect(s.videoUrl, `${s.id} videoUrl`).toMatch(/^https:\/\/.+\.mp4$/);
      expect(s.videoUrl, `${s.id} must not use a relative /videos/ path`).not.toContain(
        '/videos/short',
      );
    }
  });

  it('every thumbnailUrl is a real absolute https URL (no dead /thumbs/ paths)', () => {
    for (const s of SAMPLE_SHORTS) {
      expect(s.thumbnailUrl, `${s.id} thumbnailUrl`).toMatch(/^https:\/\//);
      expect(s.thumbnailUrl, `${s.id} must not use a /thumbs/ path`).not.toContain('/thumbs/');
    }
  });

  it('every short is flagged as a sample (honesty labeling)', () => {
    for (const s of SAMPLE_SHORTS) {
      expect(s.isSample).toBe(true);
    }
  });
});
