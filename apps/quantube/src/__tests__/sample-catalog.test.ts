// P0-1/P0-2 regression tests: the shared sample catalog must always serve
// REAL playable videos — never dead placeholder URLs like the old
// cdn.quantube.com fallback that produced the black watch player.
import { describe, it, expect } from 'vitest';
import { SAMPLE_CATALOG, findSampleVideo, toSampleApiRecord } from '../../backend/lib/sample-catalog';
import {
  PUBLIC_FEATURED_VIDEOS,
  getGuestFeaturedVideos,
  resolveWatchVideo,
} from '../data/public-videos';

describe('sample video catalog (P0-1/P0-2)', () => {
  it('has 12 entries with unique ids', () => {
    expect(SAMPLE_CATALOG).toHaveLength(12);
    const ids = SAMPLE_CATALOG.map((v) => v.id);
    expect(new Set(ids).size).toBe(12);
  });

  it('every videoUrl is a real, absolute https URL (never a dead placeholder)', () => {
    for (const v of SAMPLE_CATALOG) {
      expect(v.videoUrl, `${v.id} videoUrl`).toMatch(/^https:\/\/.+\.mp4$/);
      expect(v.videoUrl, `${v.id} must not use the dead fallback CDN`).not.toContain(
        'cdn.quantube.com',
      );
    }
  });

  it('every thumbnailUrl is an absolute https URL', () => {
    for (const v of SAMPLE_CATALOG) {
      expect(v.thumbnailUrl, `${v.id} thumbnailUrl`).toMatch(/^https:\/\//);
    }
  });

  it('findSampleVideo resolves known ids and misses unknown ids', () => {
    expect(findSampleVideo('guest-vid-1')?.title).toContain('Sovereign Computing');
    expect(findSampleVideo('definitely-not-a-video')).toBeUndefined();
  });

  it('toSampleApiRecord populates BOTH videoUrl and url (empty <video src> root cause)', () => {
    const rec = toSampleApiRecord(SAMPLE_CATALOG[0]) as Record<string, unknown>;
    expect(rec.videoUrl).toMatch(/^https:\/\/.+\.mp4$/);
    expect(rec.url).toBe('/watch/guest-vid-1');
    expect(rec.isSample).toBe(true);
  });

  it('frontend re-export keeps ids in sync with the shared catalog', () => {
    expect(PUBLIC_FEATURED_VIDEOS).toHaveLength(SAMPLE_CATALOG.length);
    expect(PUBLIC_FEATURED_VIDEOS.map((v) => v.id)).toEqual(SAMPLE_CATALOG.map((v) => v.id));
    for (const v of PUBLIC_FEATURED_VIDEOS) {
      expect(v.isSample).toBe(true);
      expect(v.videoUrl).toMatch(/^https:\/\//);
    }
  });

  it('getGuestFeaturedVideos filters by category', () => {
    const tech = getGuestFeaturedVideos('tech');
    expect(tech.length).toBeGreaterThan(0);
    expect(tech.every((v) => v.category === 'tech')).toBe(true);
    expect(getGuestFeaturedVideos('all')).toHaveLength(12);
  });

  it('resolveWatchVideo returns a playable record for sample ids', () => {
    const w = resolveWatchVideo('guest-vid-1');
    expect(w).toBeDefined();
    expect(w!.videoUrl).toMatch(/^https:\/\/.+\.mp4$/);
    expect(w!.url).toBe('/watch/guest-vid-1');
    expect(w!.isSample).toBe(true);
  });

  it('resolveWatchVideo returns undefined for unknown ids (honest 404 path)', () => {
    expect(resolveWatchVideo('nope-unknown-id')).toBeUndefined();
  });
});
