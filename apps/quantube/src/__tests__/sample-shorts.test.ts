// P0-3 regression tests: shorts must point at real, playable video assets —
// the old MOCK_SHORTS used /videos/shortN.mp4 + /thumbs/shortN.jpg which 404'd
// (black player), and the Google-bucket URLs 403 from real networks.
//
// Shorts are self-hosted generated clips under public/samples/ (relative
// /samples/*.mp4 URLs): zero external dependencies, playable everywhere.
// Engagement metadata is intentionally neutral (0/0/0) and channels are the
// neutral "Sample Channel" — no fake counts, no fake creators.
import { describe, it, expect } from 'vitest';
import { SAMPLE_SHORTS } from '../data/sample-shorts';

describe('sample shorts (P0-3)', () => {
  it('has 5 shorts with unique ids', () => {
    expect(SAMPLE_SHORTS).toHaveLength(5);
    const ids = SAMPLE_SHORTS.map((s) => s.id);
    expect(new Set(ids).size).toBe(5);
  });

  it('every videoUrl is a self-hosted /samples/*.mp4 path (no dead URLs)', () => {
    for (const s of SAMPLE_SHORTS) {
      expect(s.videoUrl, `${s.id} videoUrl`).toMatch(/^\/samples\/short-\d{2}\.mp4$/);
      expect(s.videoUrl, `${s.id} must not use a relative /videos/ path`).not.toContain(
        '/videos/short',
      );
      expect(s.videoUrl, `${s.id} must not depend on the blocked Google bucket`).not.toContain(
        'commondatastorage.googleapis.com',
      );
    }
  });

  it('every thumbnailUrl is a self-hosted poster frame (zero external deps)', () => {
    for (const s of SAMPLE_SHORTS) {
      expect(s.thumbnailUrl, `${s.id} thumbnailUrl`).toMatch(
        /^\/samples\/posters\/short-\d{2}\.jpg$/,
      );
      expect(s.thumbnailUrl, `${s.id} must not use Unsplash`).not.toContain('unsplash');
      expect(s.thumbnailUrl, `${s.id} must not use a /thumbs/ path`).not.toContain('/thumbs/');
    }
  });

  it('durations are the real measured clip lengths (6s title cards)', () => {
    for (const s of SAMPLE_SHORTS) {
      expect(s.duration, `${s.id} duration`).toBe(6);
    }
  });

  it('channel avatars are self-hosted and sounds are honest (clips have no audio)', () => {
    for (const s of SAMPLE_SHORTS) {
      expect(s.channelAvatar, `${s.id} channelAvatar`).toBe('/samples/sample-avatar.svg');
      expect(s.channelAvatar, `${s.id} must not use DiceBear`).not.toContain('dicebear');
      expect(s.soundName, `${s.id} soundName`).toBe('No audio');
    }
  });

  it('every short is flagged as a sample (honesty labeling)', () => {
    for (const s of SAMPLE_SHORTS) {
      expect(s.isSample).toBe(true);
    }
  });

  it('engagement metadata is neutral: no fake likes/comments/shares', () => {
    for (const s of SAMPLE_SHORTS) {
      expect(s.likeCount, `${s.id} likeCount`).toBe(0);
      expect(s.commentCount, `${s.id} commentCount`).toBe(0);
      expect(s.shareCount, `${s.id} shareCount`).toBe(0);
    }
  });

  it('channels are the neutral "Sample Channel" (no fake creators)', () => {
    for (const s of SAMPLE_SHORTS) {
      expect(s.channelName, `${s.id} channelName`).toBe('Sample Channel');
    }
  });
});
