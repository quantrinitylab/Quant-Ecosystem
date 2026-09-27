// ============================================================================
// QuantTube - PlaylistSequencerService (DTTube-grade Video Channel Playlists & Sequencer Engine)
// ----------------------------------------------------------------------------
// YouTube & DTTube-class playlist management, sequencing, and auto-play queuing:
// - Customized video playlists (Public, Unlisted, Private)
// - Ordered sequence of video items with duration summing
// - Moving and reordering items (drag-and-drop / index shifts) with auto re-indexing
// - Dynamic playback queue resolving nextVideo and previousVideo with loop support
// ============================================================================

export type PlaylistVisibility = 'public' | 'unlisted' | 'private';

export interface PlaylistItem {
  videoId: string;
  title: string;
  durationSeconds: number;
  thumbnailUrl?: string;
  channelName: string;
  addedAt: string;
  orderIndex: number;
}

export interface VideoPlaylist {
  id: string;
  channelId: string;
  title: string;
  description: string;
  visibility: PlaylistVisibility;
  items: PlaylistItem[];
  totalVideos: number;
  totalDurationSeconds: number;
  createdAt: string;
  updatedAt: string;
}

// In-memory store for playlists
const playlistsStore = new Map<string, VideoPlaylist>();

/**
 * Format total duration in seconds into 'X hr Y min' or 'M:SS'.
 */
export function formatPlaylistDuration(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds || 0));

  if (safeSeconds >= 3600) {
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    return `${hours} hr ${minutes} min`;
  }

  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  const paddedSeconds = seconds.toString().padStart(2, '0');
  return `${minutes}:${paddedSeconds}`;
}

/**
 * Helper to generate unique playlist identifiers.
 */
function generatePlaylistId(): string {
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 9);
  return `pl_${timestamp}_${randomSuffix}`;
}

/**
 * Creates a new video playlist for a channel.
 */
export function createPlaylist(
  channelId: string,
  data: {
    title: string;
    description?: string;
    visibility?: PlaylistVisibility;
  },
): VideoPlaylist {
  if (!channelId || typeof channelId !== 'string') {
    throw new Error('channelId is required');
  }
  if (!data?.title || typeof data.title !== 'string' || !data.title.trim()) {
    throw new Error('Playlist title is required');
  }

  const now = new Date().toISOString();
  const playlist: VideoPlaylist = {
    id: generatePlaylistId(),
    channelId,
    title: data.title.trim(),
    description: data.description?.trim() ?? '',
    visibility: data.visibility ?? 'public',
    items: [],
    totalVideos: 0,
    totalDurationSeconds: 0,
    createdAt: now,
    updatedAt: now,
  };

  playlistsStore.set(playlist.id, playlist);
  return { ...playlist, items: [...playlist.items] };
}

/**
 * Retrieves a playlist by its ID.
 */
export function getPlaylist(playlistId: string): VideoPlaylist | null {
  const playlist = playlistsStore.get(playlistId);
  if (!playlist) return null;
  return { ...playlist, items: [...playlist.items] };
}

/**
 * Retrieves all playlists belonging to a specific channel.
 */
export function getPlaylistsByChannel(channelId: string): VideoPlaylist[] {
  const results: VideoPlaylist[] = [];
  for (const playlist of playlistsStore.values()) {
    if (playlist.channelId === channelId) {
      results.push({ ...playlist, items: [...playlist.items] });
    }
  }
  return results;
}

/**
 * Appends a video to the end of a playlist and recalculates totals.
 */
export function addVideoToPlaylist(
  playlistId: string,
  video: {
    videoId: string;
    title: string;
    durationSeconds: number;
    thumbnailUrl?: string;
    channelName: string;
  },
): VideoPlaylist {
  const playlist = playlistsStore.get(playlistId);
  if (!playlist) {
    throw new Error(`Playlist not found: ${playlistId}`);
  }

  if (!video.videoId || typeof video.videoId !== 'string') {
    throw new Error('videoId is required');
  }

  const duration = Math.max(0, Math.floor(video.durationSeconds || 0));
  const newItem: PlaylistItem = {
    videoId: video.videoId,
    title: video.title || 'Untitled Video',
    durationSeconds: duration,
    thumbnailUrl: video.thumbnailUrl,
    channelName: video.channelName || 'Unknown Channel',
    addedAt: new Date().toISOString(),
    orderIndex: playlist.items.length,
  };

  playlist.items.push(newItem);
  playlist.totalVideos = playlist.items.length;
  playlist.totalDurationSeconds = playlist.items.reduce(
    (sum, item) => sum + item.durationSeconds,
    0,
  );
  playlist.updatedAt = new Date().toISOString();

  return { ...playlist, items: [...playlist.items] };
}

/**
 * Removes a video from a playlist, re-indexes remaining items, and recalculates duration.
 */
export function removeVideoFromPlaylist(playlistId: string, videoId: string): VideoPlaylist {
  const playlist = playlistsStore.get(playlistId);
  if (!playlist) {
    throw new Error(`Playlist not found: ${playlistId}`);
  }

  const existingIndex = playlist.items.findIndex((item) => item.videoId === videoId);
  if (existingIndex !== -1) {
    playlist.items.splice(existingIndex, 1);
    // Re-index remaining items 0..N-1
    playlist.items.forEach((item, index) => {
      item.orderIndex = index;
    });
    playlist.totalVideos = playlist.items.length;
    playlist.totalDurationSeconds = playlist.items.reduce(
      (sum, item) => sum + item.durationSeconds,
      0,
    );
    playlist.updatedAt = new Date().toISOString();
  }

  return { ...playlist, items: [...playlist.items] };
}

/**
 * Reorders playlist videos by moving item from `fromIndex` to `toIndex`.
 */
export function reorderPlaylistVideos(
  playlistId: string,
  fromIndex: number,
  toIndex: number,
): VideoPlaylist {
  const playlist = playlistsStore.get(playlistId);
  if (!playlist) {
    throw new Error(`Playlist not found: ${playlistId}`);
  }

  if (
    fromIndex < 0 ||
    fromIndex >= playlist.items.length ||
    toIndex < 0 ||
    toIndex >= playlist.items.length
  ) {
    throw new Error(
      `Invalid reorder indices: fromIndex=${fromIndex}, toIndex=${toIndex}, length=${playlist.items.length}`,
    );
  }

  if (fromIndex === toIndex) {
    return { ...playlist, items: [...playlist.items] };
  }

  const [movedItem] = playlist.items.splice(fromIndex, 1);
  if (movedItem) {
    playlist.items.splice(toIndex, 0, movedItem);
  }

  // Re-index remaining items 0..N-1
  playlist.items.forEach((item, index) => {
    item.orderIndex = index;
  });

  playlist.updatedAt = new Date().toISOString();
  return { ...playlist, items: [...playlist.items] };
}

/**
 * Gets the next track in the playlist relative to currentVideoId, with optional loop support.
 */
export function getNextTrackInPlaylist(
  playlistId: string,
  currentVideoId: string,
  loop?: boolean,
): PlaylistItem | null {
  const playlist = playlistsStore.get(playlistId);
  if (!playlist || playlist.items.length === 0) {
    return null;
  }

  const currentIndex = playlist.items.findIndex((item) => item.videoId === currentVideoId);
  if (currentIndex === -1) {
    return null;
  }

  if (currentIndex + 1 < playlist.items.length) {
    return { ...playlist.items[currentIndex + 1] };
  }

  // At the end of the playlist
  if (loop) {
    return { ...playlist.items[0] };
  }

  return null;
}

/**
 * Gets the previous track in the playlist relative to currentVideoId.
 */
export function getPreviousTrackInPlaylist(
  playlistId: string,
  currentVideoId: string,
): PlaylistItem | null {
  const playlist = playlistsStore.get(playlistId);
  if (!playlist || playlist.items.length === 0) {
    return null;
  }

  const currentIndex = playlist.items.findIndex((item) => item.videoId === currentVideoId);
  if (currentIndex === -1 || currentIndex === 0) {
    return null;
  }

  return { ...playlist.items[currentIndex - 1] };
}

/**
 * Clears in-memory playlists for testing isolation.
 */
export function clearPlaylistsForTesting(): void {
  playlistsStore.clear();
}

/**
 * Class wrapper for object-oriented injection or modular services.
 */
export class PlaylistSequencerService {
  createPlaylist = createPlaylist;
  getPlaylist = getPlaylist;
  getPlaylistsByChannel = getPlaylistsByChannel;
  addVideoToPlaylist = addVideoToPlaylist;
  removeVideoFromPlaylist = removeVideoFromPlaylist;
  reorderPlaylistVideos = reorderPlaylistVideos;
  getNextTrackInPlaylist = getNextTrackInPlaylist;
  getPreviousTrackInPlaylist = getPreviousTrackInPlaylist;
  formatPlaylistDuration = formatPlaylistDuration;
  clearPlaylistsForTesting = clearPlaylistsForTesting;
}

export const playlistSequencerService = new PlaylistSequencerService();
