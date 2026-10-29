// ============================================================================
// Editor document helpers (P0-5, spec §2.6 frontend cases).
//
// Pins the pure pieces of the editor wiring: the serialiser
// (buildEditorDocument), the library-clip builder (assetId only — never a
// signed URL), hydration mapping from a state response, render-time
// thumbnail resolution, and the dirty-comparison helper behind the
// undo-back-to-saved behaviour.
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  buildClipFromAssetItem,
  buildEditorDocument,
  editorDocumentsEqual,
  hydrateFromProjectState,
  resolveClipThumbnail,
  DEFAULT_CLIP_SECONDS,
  type EditorClip,
  type EditorTrack,
} from '../types/editor-document';

const SIGNED_URL =
  'https://storage.example.com/quantcooks/u/p/a/dish.mp4?X-Amz-Signature=deadbeef&X-Amz-Expires=3600';

function makeTrack(clips: EditorClip[]): EditorTrack {
  return {
    id: 'track-1',
    name: 'Video 1',
    type: 'video',
    locked: false,
    visible: true,
    height: 60,
    clips,
  };
}

function makeClip(overrides: Partial<EditorClip> = {}): EditorClip {
  return {
    id: 'clip-1',
    trackId: 'track-1',
    name: 'Clip',
    startTime: 0,
    duration: 5,
    trimStart: 0,
    trimEnd: 0,
    type: 'video',
    thumbnail: '',
    volume: 1,
    opacity: 1,
    filters: { brightness: 0, contrast: 0, saturation: 0, blur: 0, hue: 0 },
    position: { x: 0, y: 0 },
    scale: { x: 1, y: 1 },
    rotation: 0,
    ...overrides,
  };
}

describe('buildEditorDocument', () => {
  it('produces the persisted shape (schemaVersion 1 + tracks/duration/aspect)', () => {
    const doc = buildEditorDocument([makeTrack([])], 90, '9:16');
    expect(doc).toEqual({
      schemaVersion: 1,
      tracks: [makeTrack([])],
      duration: 90,
      aspectRatio: '9:16',
    });
  });
});

describe('buildClipFromAssetItem (serialiser safety, D5-6/C9)', () => {
  it('carries assetId and NO signed URL anywhere in the built clip', () => {
    const item = { id: 'asset-9', name: 'dish.mp4', type: 'video', thumbnailUrl: SIGNED_URL };
    const clip = buildClipFromAssetItem(item, makeTrack([]), 1234);

    expect(clip.assetId).toBe('asset-9');
    expect(clip.thumbnail).toBe('');
    const doc = buildEditorDocument([makeTrack([clip])], 120, '16:9');
    const serialised = JSON.stringify(doc);
    expect(serialised).toContain('asset-9');
    expect(serialised).not.toContain('X-Amz');
    expect(serialised).not.toContain('storage.example.com');
  });

  it('uses the declared 5s default and appends at the end of the target track', () => {
    const existing = makeClip({ id: 'clip-0', startTime: 0, duration: 7 });
    const clip = buildClipFromAssetItem(
      { id: 'asset-1', name: 'photo.jpg', type: 'image' },
      makeTrack([existing]),
      99,
    );
    expect(clip.duration).toBe(DEFAULT_CLIP_SECONDS);
    expect(DEFAULT_CLIP_SECONDS).toBe(5);
    expect(clip.startTime).toBe(7);
    expect(clip.type).toBe('video'); // images become still clips on the video track
  });

  it('keeps audio items as audio clips', () => {
    const clip = buildClipFromAssetItem(
      { id: 'asset-2', name: 'voice.mp3', type: 'audio' },
      makeTrack([]),
      5,
    );
    expect(clip.type).toBe('audio');
    expect(clip.assetId).toBe('asset-2');
  });
});

describe('hydrateFromProjectState', () => {
  it('maps a state response into editor state with the save base version', () => {
    const tracks = [makeTrack([makeClip()])];
    const hydrated = hydrateFromProjectState({
      version: 4,
      timeline: { schemaVersion: 1, tracks, duration: 33, aspectRatio: '4:5' },
    });
    expect(hydrated.tracks).toEqual(tracks);
    expect(hydrated.duration).toBe(33);
    expect(hydrated.aspectRatio).toBe('4:5');
    expect(hydrated.baseVersion).toBe(4);
  });
});

describe('resolveClipThumbnail', () => {
  it('resolves an asset-backed clip from the current assets query', () => {
    const clip = makeClip({ assetId: 'asset-1', thumbnail: '' });
    expect(resolveClipThumbnail(clip, [{ id: 'asset-1', url: SIGNED_URL }])).toBe(SIGNED_URL);
  });

  it('resolves to empty when the asset is gone or still PENDING (url null)', () => {
    const clip = makeClip({ assetId: 'asset-1' });
    expect(resolveClipThumbnail(clip, [])).toBe('');
    expect(resolveClipThumbnail(clip, [{ id: 'asset-1', url: null }])).toBe('');
    expect(resolveClipThumbnail(clip, [{ id: 'other', url: SIGNED_URL }])).toBe('');
  });

  it('keeps the stored thumbnail for non-asset clips', () => {
    const clip = makeClip({ thumbnail: 'data:image/png;base64,abc' });
    expect(resolveClipThumbnail(clip, [])).toBe('data:image/png;base64,abc');
  });
});

describe('editorDocumentsEqual (dirty derivation)', () => {
  it('equal documents compare clean; any change compares dirty', () => {
    const a = buildEditorDocument([makeTrack([makeClip()])], 120, '16:9');
    const b = buildEditorDocument([makeTrack([makeClip()])], 120, '16:9');
    expect(editorDocumentsEqual(a, b)).toBe(true);

    const c = buildEditorDocument([makeTrack([makeClip({ name: 'Changed' })])], 120, '16:9');
    expect(editorDocumentsEqual(a, c)).toBe(false);
  });
});
