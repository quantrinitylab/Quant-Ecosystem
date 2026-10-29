// ============================================================================
// QuantEdits - Editor document model (canonical, P0-5)
//
// These types used to live locally in src/pages/editor.tsx. P0-5 makes the
// editor document a persisted wire shape (EditProject.timeline, spec §2.2),
// so the api-client and the editor must share ONE definition — it lives
// here, and both import from here. Pure helpers for building, comparing
// and hydrating documents live alongside the types so they are testable
// without a DOM (the established frontend test pattern in this app).
// ============================================================================

export interface FilterSettings {
  brightness: number;
  contrast: number;
  saturation: number;
  blur: number;
  hue: number;
}

export interface EditorClip {
  id: string;
  trackId: string;
  name: string;
  startTime: number;
  duration: number;
  trimStart: number;
  trimEnd: number;
  type: 'video' | 'audio' | 'text' | 'effect';
  thumbnail: string;
  volume: number;
  opacity: number;
  filters: FilterSettings;
  position: { x: number; y: number };
  scale: { x: number; y: number };
  rotation: number;
  /**
   * Set iff the clip was added from the asset library (or a generation
   * result). This — never a URL — is what persists (spec D5-6): signed
   * URLs expire within the hour, so thumbnails/previews are re-resolved
   * from a fresh assets query at render time via resolveClipThumbnail.
   */
  assetId?: string;
}

export interface EditorTrack {
  id: string;
  name: string;
  type: 'video' | 'audio' | 'text' | 'effects';
  locked: boolean;
  visible: boolean;
  height: number;
  clips: EditorClip[];
}

export type AspectRatio = '16:9' | '9:16' | '1:1' | '4:5' | '4:3';

export const ASPECT_RATIOS: readonly AspectRatio[] = ['16:9', '9:16', '1:1', '4:5', '4:3'];

/** The persisted document — exactly what EditProject.timeline stores. */
export interface EditorDocument {
  schemaVersion: 1;
  tracks: EditorTrack[];
  duration: number;
  aspectRatio: AspectRatio;
}

/**
 * Duration given to clips added from the asset library. Declared constant,
 * spec C8: no media-duration probing exists anywhere in the asset path
 * (ServerAsset carries no duration), so AssetItem.duration is structurally
 * always undefined. For images 5s is a real slideshow duration; for
 * video/audio it is a declared placeholder the user trims — never a
 * measured value presented as real.
 */
export const DEFAULT_CLIP_SECONDS = 5;

export const DEFAULT_FILTERS: FilterSettings = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  blur: 0,
  hue: 0,
};

/** The single serialisation point for the editor's document state. */
export function buildEditorDocument(
  tracks: EditorTrack[],
  duration: number,
  aspectRatio: AspectRatio,
): EditorDocument {
  return { schemaVersion: 1, tracks, duration, aspectRatio };
}

/**
 * Dirty derivation by document comparison (spec §2.5c): editor mutators do
 * not funnel through one function, so dirtiness is derived, not tracked.
 * Undoing back to the saved document compares equal → clean, for free.
 */
export function editorDocumentsEqual(a: EditorDocument, b: EditorDocument): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** The slice of the state response the hydration mapper needs. */
export interface ProjectStateLike {
  version: number;
  timeline: EditorDocument;
}

export interface HydratedEditorState {
  tracks: EditorTrack[];
  duration: number;
  aspectRatio: AspectRatio;
  /** The version the hydrated document is based on (the save base). */
  baseVersion: number;
  document: EditorDocument;
}

/** Map a GET /projects/:id/state response into editor state. */
export function hydrateFromProjectState(state: ProjectStateLike): HydratedEditorState {
  const { timeline } = state;
  return {
    tracks: timeline.tracks,
    duration: timeline.duration,
    aspectRatio: timeline.aspectRatio,
    baseVersion: state.version,
    document: timeline,
  };
}

/**
 * Resolve a clip's display thumbnail at render time. Asset-backed clips
 * resolve from the CURRENT assets query (fresh signed URLs); a missing or
 * PENDING asset resolves to '' — the timeline and preview render no image,
 * never a stale/expired URL. Non-asset clips keep their stored thumbnail.
 */
export function resolveClipThumbnail(
  clip: EditorClip,
  assets: readonly { id: string; url: string | null }[],
): string {
  if (clip.assetId) {
    const asset = assets.find((a) => a.id === clip.assetId);
    return asset?.url ?? '';
  }
  return clip.thumbnail;
}

/**
 * Build the clip created when a library asset is added to the timeline
 * (spec §2.5d). Carries `assetId` ONLY — the item's thumbnailUrl (a signed
 * URL) is deliberately not copied anywhere near the document.
 */
export function buildClipFromAssetItem(
  item: { id: string; name: string; type: string },
  track: EditorTrack,
  now: number = Date.now(),
): EditorClip {
  const isAudio = item.type === 'audio';
  const lastClip = track.clips[track.clips.length - 1];
  return {
    id: `clip-${item.id}-${now}`,
    trackId: track.id,
    name: item.name,
    assetId: item.id,
    startTime: lastClip ? lastClip.startTime + lastClip.duration : 0,
    duration: DEFAULT_CLIP_SECONDS,
    trimStart: 0,
    trimEnd: 0,
    // Images become still clips on the video track; audio stays audio.
    type: isAudio ? 'audio' : 'video',
    thumbnail: '',
    volume: 1,
    opacity: 1,
    filters: { ...DEFAULT_FILTERS },
    position: { x: 0, y: 0 },
    scale: { x: 1, y: 1 },
    rotation: 0,
  };
}
