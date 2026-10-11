// P0-1/P0-2 regression tests: the shared sample catalog must always serve
// REAL playable videos — never dead placeholder URLs like the old
// cdn.quantube.com fallback that produced the black watch player.
//
// Samples are self-hosted generated clips under public/samples/ (relative
// /samples/*.mp4 URLs): zero external dependencies, playable everywhere.
import { describe, it, expect } from 'vitest';
import { SAMPLE_CATALOG, findSampleVideo, toSampleApiRecord } from '../../backend/lib/sample-catalog';
import {
  PUBLIC_FEATURED_VIDEOS,
  getGuestFeaturedVideos,
  getSampleRecommendations,
  resolveWatchVideo,
} from '../data/public-videos';

describe('sample video catalog (P0-1/P0-2)', () => {
  it('has 12 entries with unique ids', () => {
    expect(SAMPLE_CATALOG).toHaveLength(12);
    const ids = SAMPLE_CATALOG.map((v) => v.id);
    expect(new Set(ids).size).toBe(12);
  });

  it('every videoUrl is a self-hosted /samples/*.mp4 path (never a dead external URL)', () => {
    for (const v of SAMPLE_CATALOG) {
      expect(v.videoUrl, `${v.id} videoUrl`).toMatch(/^\/samples\/vid-\d{2}\.mp4$/);
      expect(v.videoUrl, `${v.id} must not use the dead fallback CDN`).not.toContain(
        'cdn.quantube.com',
      );
      expect(v.videoUrl, `${v.id} must not depend on the blocked Google bucket`).not.toContain(
        'commondatastorage.googleapis.com',
      );
    }
  });

  it('every thumbnailUrl is a self-hosted poster frame (zero external deps)', () => {
    for (const v of SAMPLE_CATALOG) {
      expect(v.thumbnailUrl, `${v.id} thumbnailUrl`).toMatch(
        /^\/samples\/posters\/vid-\d{2}\.jpg$/,
      );
      expect(v.thumbnailUrl, `${v.id} must not use Unsplash`).not.toContain('unsplash');
    }
  });

  it('no sample is presented as a live stream', () => {
    for (const v of SAMPLE_CATALOG) {
      expect('isLive' in v, `${v.id} must not carry an isLive flag`).toBe(false);
    }
    const rec = toSampleApiRecord(SAMPLE_CATALOG[1]) as Record<string, unknown>;
    expect(rec.isLive).toBe(false);
  });

  it('durations are the real measured clip lengths (8s title cards)', () => {
    for (const v of SAMPLE_CATALOG) {
      expect(v.duration, `${v.id} duration`).toBe(8);
    }
  });

  it('channel avatars are self-hosted (no DiceBear external dependency)', () => {
    for (const v of SAMPLE_CATALOG) {
      expect(v.channelAvatar, `${v.id} channelAvatar`).toBe('/samples/sample-avatar.svg');
    }
  });

  it('resolutions are the real 360p of the generated clips', () => {
    for (const v of SAMPLE_CATALOG) {
      expect(v.resolution, `${v.id} resolution`).toBe('360p');
    }
  });

  it('findSampleVideo resolves known ids and misses unknown ids', () => {
    expect(findSampleVideo('guest-vid-1')?.title).toContain('Sovereign Computing');
    expect(findSampleVideo('definitely-not-a-video')).toBeUndefined();
  });

  it('toSampleApiRecord populates BOTH videoUrl and url (empty <video src> root cause)', () => {
    const rec = toSampleApiRecord(SAMPLE_CATALOG[0]) as Record<string, unknown>;
    expect(rec.videoUrl).toBe('/samples/vid-01.mp4');
    expect(rec.url).toBe('/watch/guest-vid-1');
    expect(rec.isSample).toBe(true);
  });

  it('frontend re-export keeps ids in sync with the shared catalog', () => {
    expect(PUBLIC_FEATURED_VIDEOS).toHaveLength(SAMPLE_CATALOG.length);
    expect(PUBLIC_FEATURED_VIDEOS.map((v) => v.id)).toEqual(SAMPLE_CATALOG.map((v) => v.id));
    for (const v of PUBLIC_FEATURED_VIDEOS) {
      expect(v.isSample).toBe(true);
      expect(v.videoUrl).toMatch(/^\/samples\//);
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
    expect(w!.videoUrl).toBe('/samples/vid-01.mp4');
    expect(w!.url).toBe('/watch/guest-vid-1');
    expect(w!.isSample).toBe(true);
  });

  it('resolveWatchVideo returns undefined for unknown ids (honest 404 path)', () => {
    expect(resolveWatchVideo('nope-unknown-id')).toBeUndefined();
  });

  it('getSampleRecommendations returns real playable samples, never the current video', () => {
    const recs = getSampleRecommendations('guest-vid-1', 8);
    expect(recs).toHaveLength(8);
    expect(recs.every((r) => r.id !== 'guest-vid-1')).toBe(true);
    expect(recs.every((r) => r.isSample)).toBe(true);
    for (const r of recs) {
      // Real playable media + real self-hosted thumbnails: no dead links, no fake views.
      expect(r.videoUrl).toMatch(/^\/samples\/vid-\d{2}\.mp4$/);
      expect(r.thumbnailUrl).toMatch(/^\/samples\/posters\/vid-\d{2}\.jpg$/);
      expect(r.views).toBe(0);
    }
    const ids = recs.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('getSampleRecommendations returns [] for non-sample ids (honest empty state)', () => {
    expect(getSampleRecommendations('real-video-123')).toEqual([]);
    expect(getSampleRecommendations('rec1')).toEqual([]);
  });
});
