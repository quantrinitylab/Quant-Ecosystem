import { describe, it, expect, beforeEach } from 'vitest';
import {
  createPlaylist,
  addVideoToPlaylist,
  removeVideoFromPlaylist,
  reorderPlaylistVideos,
  getNextTrackInPlaylist,
  getPreviousTrackInPlaylist,
  formatPlaylistDuration,
  clearPlaylistsForTesting,
  getPlaylist,
  getPlaylistsByChannel,
  playlistSequencerService,
  type VideoPlaylist,
  type PlaylistItem,
} from '../services/playlist-sequencer.service';

describe('DTTube Video Channel Playlists & Sequencer Engine', () => {
  beforeEach(() => {
    clearPlaylistsForTesting();
  });

  describe('createPlaylist', () => {
    it('initializes empty items, 0 total videos, and 0 total duration', () => {
      const playlist = createPlaylist('channel-101', {
        title: 'Deep House Mixes',
        description: 'Best melodic and vocal deep house tracks',
        visibility: 'public',
      });

      expect(playlist.id).toBeDefined();
      expect(playlist.channelId).toBe('channel-101');
      expect(playlist.title).toBe('Deep House Mixes');
      expect(playlist.description).toBe('Best melodic and vocal deep house tracks');
      expect(playlist.visibility).toBe('public');
      expect(playlist.items).toEqual([]);
      expect(playlist.totalVideos).toBe(0);
      expect(playlist.totalDurationSeconds).toBe(0);
      expect(playlist.createdAt).toBeDefined();
      expect(playlist.updatedAt).toBeDefined();

      // Verify retrieval via getPlaylist
      const fetched = getPlaylist(playlist.id);
      expect(fetched).not.toBeNull();
      expect(fetched?.title).toBe('Deep House Mixes');
    });

    it('defaults visibility to public if not provided', () => {
      const playlist = createPlaylist('channel-102', {
        title: 'Daily Vlogs',
      });

      expect(playlist.visibility).toBe('public');
      expect(playlist.description).toBe('');
    });

    it('supports private and unlisted visibility', () => {
      const unlisted = createPlaylist('channel-103', {
        title: 'Unlisted Drafts',
        visibility: 'unlisted',
      });
      expect(unlisted.visibility).toBe('unlisted');

      const privatePl = createPlaylist('channel-103', {
        title: 'Private Stash',
        visibility: 'private',
      });
      expect(privatePl.visibility).toBe('private');
    });

    it('throws error if channelId or title is missing', () => {
      expect(() => createPlaylist('', { title: 'Test' })).toThrow('channelId is required');
      expect(() => createPlaylist('chan-1', { title: '   ' })).toThrow(
        'Playlist title is required',
      );
    });
  });

  describe('addVideoToPlaylist', () => {
    it('appends items with correct orderIndex and accumulates total duration', () => {
      const playlist = createPlaylist('channel-101', { title: 'Coding Soundtracks' });

      const updated1 = addVideoToPlaylist(playlist.id, {
        videoId: 'vid-1',
        title: 'Synthwave Odyssey',
        durationSeconds: 240,
        thumbnailUrl: 'https://cdn.quant.tube/thumbs/vid1.jpg',
        channelName: 'RetroWave Records',
      });

      expect(updated1.items).toHaveLength(1);
      expect(updated1.totalVideos).toBe(1);
      expect(updated1.totalDurationSeconds).toBe(240);
      expect(updated1.items[0]).toMatchObject({
        videoId: 'vid-1',
        title: 'Synthwave Odyssey',
        durationSeconds: 240,
        thumbnailUrl: 'https://cdn.quant.tube/thumbs/vid1.jpg',
        channelName: 'RetroWave Records',
        orderIndex: 0,
      });

      const updated2 = addVideoToPlaylist(playlist.id, {
        videoId: 'vid-2',
        title: 'Cyberpunk Ambient',
        durationSeconds: 360,
        channelName: 'Neon City',
      });

      expect(updated2.items).toHaveLength(2);
      expect(updated2.totalVideos).toBe(2);
      expect(updated2.totalDurationSeconds).toBe(600); // 240 + 360
      expect(updated2.items[1].orderIndex).toBe(1);

      const updated3 = addVideoToPlaylist(playlist.id, {
        videoId: 'vid-3',
        title: 'Lo-Fi Chill Beats',
        durationSeconds: 180,
        channelName: 'ChillHop',
      });

      expect(updated3.items).toHaveLength(3);
      expect(updated3.totalVideos).toBe(3);
      expect(updated3.totalDurationSeconds).toBe(780); // 600 + 180
      expect(updated3.items[2].orderIndex).toBe(2);
    });

    it('throws error if playlist does not exist', () => {
      expect(() =>
        addVideoToPlaylist('non-existent-pl', {
          videoId: 'vid-99',
          title: 'Ghost Video',
          durationSeconds: 100,
          channelName: 'Ghost Channel',
        }),
      ).toThrow('Playlist not found: non-existent-pl');
    });
  });

  describe('removeVideoFromPlaylist', () => {
    it('removes video, re-indexes remaining items, and updates duration', () => {
      const playlist = createPlaylist('channel-101', { title: 'Workout Beats' });
      addVideoToPlaylist(playlist.id, {
        videoId: 'v1',
        title: 'Track 1',
        durationSeconds: 200,
        channelName: 'C1',
      });
      addVideoToPlaylist(playlist.id, {
        videoId: 'v2',
        title: 'Track 2',
        durationSeconds: 300,
        channelName: 'C2',
      });
      addVideoToPlaylist(playlist.id, {
        videoId: 'v3',
        title: 'Track 3',
        durationSeconds: 150,
        channelName: 'C3',
      });

      // Remove middle item (v2)
      const afterRemoval = removeVideoFromPlaylist(playlist.id, 'v2');

      expect(afterRemoval.items).toHaveLength(2);
      expect(afterRemoval.totalVideos).toBe(2);
      expect(afterRemoval.totalDurationSeconds).toBe(350); // 200 + 150
      expect(afterRemoval.items.map((i) => i.videoId)).toEqual(['v1', 'v3']);

      // Ensure contiguous orderIndex 0, 1
      expect(afterRemoval.items[0].orderIndex).toBe(0);
      expect(afterRemoval.items[1].orderIndex).toBe(1);
    });

    it('handles removing the first item and re-indexing', () => {
      const playlist = createPlaylist('channel-101', { title: 'Chill Study' });
      addVideoToPlaylist(playlist.id, {
        videoId: 'v1',
        title: 'Track 1',
        durationSeconds: 100,
        channelName: 'C1',
      });
      addVideoToPlaylist(playlist.id, {
        videoId: 'v2',
        title: 'Track 2',
        durationSeconds: 200,
        channelName: 'C2',
      });

      const afterRemoval = removeVideoFromPlaylist(playlist.id, 'v1');
      expect(afterRemoval.items).toHaveLength(1);
      expect(afterRemoval.items[0].videoId).toBe('v2');
      expect(afterRemoval.items[0].orderIndex).toBe(0);
      expect(afterRemoval.totalDurationSeconds).toBe(200);
    });

    it('safely handles removal of non-existent video without altering playlist', () => {
      const playlist = createPlaylist('channel-101', { title: 'Chill Study' });
      addVideoToPlaylist(playlist.id, {
        videoId: 'v1',
        title: 'Track 1',
        durationSeconds: 100,
        channelName: 'C1',
      });

      const afterRemoval = removeVideoFromPlaylist(playlist.id, 'unknown-id');
      expect(afterRemoval.items).toHaveLength(1);
      expect(afterRemoval.totalDurationSeconds).toBe(100);
    });
  });

  describe('reorderPlaylistVideos', () => {
    it('moves target item to new index correctly and re-indexes array', () => {
      const playlist = createPlaylist('channel-101', { title: 'Epic Mix' });
      addVideoToPlaylist(playlist.id, {
        videoId: 'v0',
        title: 'Track 0',
        durationSeconds: 100,
        channelName: 'C',
      });
      addVideoToPlaylist(playlist.id, {
        videoId: 'v1',
        title: 'Track 1',
        durationSeconds: 200,
        channelName: 'C',
      });
      addVideoToPlaylist(playlist.id, {
        videoId: 'v2',
        title: 'Track 2',
        durationSeconds: 300,
        channelName: 'C',
      });
      addVideoToPlaylist(playlist.id, {
        videoId: 'v3',
        title: 'Track 3',
        durationSeconds: 400,
        channelName: 'C',
      });

      // Move track at index 3 (v3) to index 1
      const reordered = reorderPlaylistVideos(playlist.id, 3, 1);

      expect(reordered.items.map((i) => i.videoId)).toEqual(['v0', 'v3', 'v1', 'v2']);
      expect(reordered.items[0].orderIndex).toBe(0);
      expect(reordered.items[1].orderIndex).toBe(1);
      expect(reordered.items[2].orderIndex).toBe(2);
      expect(reordered.items[3].orderIndex).toBe(3);
    });

    it('moves target item forward correctly (from 0 to 2)', () => {
      const playlist = createPlaylist('channel-101', { title: 'Forward Move' });
      addVideoToPlaylist(playlist.id, {
        videoId: 'v0',
        title: 'Track 0',
        durationSeconds: 100,
        channelName: 'C',
      });
      addVideoToPlaylist(playlist.id, {
        videoId: 'v1',
        title: 'Track 1',
        durationSeconds: 200,
        channelName: 'C',
      });
      addVideoToPlaylist(playlist.id, {
        videoId: 'v2',
        title: 'Track 2',
        durationSeconds: 300,
        channelName: 'C',
      });

      const reordered = reorderPlaylistVideos(playlist.id, 0, 2);
      expect(reordered.items.map((i) => i.videoId)).toEqual(['v1', 'v2', 'v0']);
      expect(reordered.items.map((i) => i.orderIndex)).toEqual([0, 1, 2]);
    });

    it('returns unchanged list if fromIndex equals toIndex', () => {
      const playlist = createPlaylist('channel-101', { title: 'No-Op Move' });
      addVideoToPlaylist(playlist.id, {
        videoId: 'v0',
        title: 'Track 0',
        durationSeconds: 100,
        channelName: 'C',
      });
      addVideoToPlaylist(playlist.id, {
        videoId: 'v1',
        title: 'Track 1',
        durationSeconds: 200,
        channelName: 'C',
      });

      const reordered = reorderPlaylistVideos(playlist.id, 1, 1);
      expect(reordered.items.map((i) => i.videoId)).toEqual(['v0', 'v1']);
    });

    it('throws error for invalid indices', () => {
      const playlist = createPlaylist('channel-101', { title: 'Bounds Test' });
      addVideoToPlaylist(playlist.id, {
        videoId: 'v0',
        title: 'Track 0',
        durationSeconds: 100,
        channelName: 'C',
      });

      expect(() => reorderPlaylistVideos(playlist.id, -1, 0)).toThrow('Invalid reorder indices');
      expect(() => reorderPlaylistVideos(playlist.id, 0, 5)).toThrow('Invalid reorder indices');
    });
  });

  describe('getNextTrackInPlaylist', () => {
    it('returns subsequent video and handles loop mode', () => {
      const playlist = createPlaylist('channel-101', { title: 'Sequencing Queue' });
      addVideoToPlaylist(playlist.id, {
        videoId: 'v1',
        title: 'Song 1',
        durationSeconds: 180,
        channelName: 'A',
      });
      addVideoToPlaylist(playlist.id, {
        videoId: 'v2',
        title: 'Song 2',
        durationSeconds: 200,
        channelName: 'A',
      });
      addVideoToPlaylist(playlist.id, {
        videoId: 'v3',
        title: 'Song 3',
        durationSeconds: 220,
        channelName: 'A',
      });

      // In the middle
      const nextFromV1 = getNextTrackInPlaylist(playlist.id, 'v1');
      expect(nextFromV1).not.toBeNull();
      expect(nextFromV1?.videoId).toBe('v2');

      const nextFromV2 = getNextTrackInPlaylist(playlist.id, 'v2');
      expect(nextFromV2?.videoId).toBe('v3');

      // At the end without loop
      const nextFromV3NoLoop = getNextTrackInPlaylist(playlist.id, 'v3', false);
      expect(nextFromV3NoLoop).toBeNull();

      // At the end WITH loop
      const nextFromV3Loop = getNextTrackInPlaylist(playlist.id, 'v3', true);
      expect(nextFromV3Loop).not.toBeNull();
      expect(nextFromV3Loop?.videoId).toBe('v1');
    });

    it('returns null if video is not in playlist', () => {
      const playlist = createPlaylist('channel-101', { title: 'Unknown test' });
      addVideoToPlaylist(playlist.id, {
        videoId: 'v1',
        title: 'Song 1',
        durationSeconds: 180,
        channelName: 'A',
      });

      expect(getNextTrackInPlaylist(playlist.id, 'non-existent-video')).toBeNull();
    });

    it('returns null for empty playlist', () => {
      const playlist = createPlaylist('channel-101', { title: 'Empty' });
      expect(getNextTrackInPlaylist(playlist.id, 'v1', true)).toBeNull();
    });
  });

  describe('getPreviousTrackInPlaylist', () => {
    it('returns previous track in playlist or null if at beginning', () => {
      const playlist = createPlaylist('channel-101', { title: 'Prev Test' });
      addVideoToPlaylist(playlist.id, {
        videoId: 'v1',
        title: 'Track 1',
        durationSeconds: 100,
        channelName: 'A',
      });
      addVideoToPlaylist(playlist.id, {
        videoId: 'v2',
        title: 'Track 2',
        durationSeconds: 100,
        channelName: 'A',
      });
      addVideoToPlaylist(playlist.id, {
        videoId: 'v3',
        title: 'Track 3',
        durationSeconds: 100,
        channelName: 'A',
      });

      expect(getPreviousTrackInPlaylist(playlist.id, 'v3')?.videoId).toBe('v2');
      expect(getPreviousTrackInPlaylist(playlist.id, 'v2')?.videoId).toBe('v1');
      expect(getPreviousTrackInPlaylist(playlist.id, 'v1')).toBeNull();
    });

    it('returns null if current video not found', () => {
      const playlist = createPlaylist('channel-101', { title: 'Prev Test' });
      addVideoToPlaylist(playlist.id, {
        videoId: 'v1',
        title: 'Track 1',
        durationSeconds: 100,
        channelName: 'A',
      });
      expect(getPreviousTrackInPlaylist(playlist.id, 'unknown')).toBeNull();
    });
  });

  describe('formatPlaylistDuration', () => {
    it('formats hours and minutes properly', () => {
      // < 1 hour: formatted as M:SS
      expect(formatPlaylistDuration(0)).toBe('0:00');
      expect(formatPlaylistDuration(45)).toBe('0:45');
      expect(formatPlaylistDuration(65)).toBe('1:05');
      expect(formatPlaylistDuration(599)).toBe('9:59');
      expect(formatPlaylistDuration(3599)).toBe('59:59');

      // >= 1 hour: formatted as X hr Y min
      expect(formatPlaylistDuration(3600)).toBe('1 hr 0 min');
      expect(formatPlaylistDuration(3665)).toBe('1 hr 1 min');
      expect(formatPlaylistDuration(5400)).toBe('1 hr 30 min');
      expect(formatPlaylistDuration(7200)).toBe('2 hr 0 min');
      expect(formatPlaylistDuration(9125)).toBe('2 hr 32 min');
    });
  });

  describe('getPlaylistsByChannel', () => {
    it('retrieves playlists belonging to a specific channel', () => {
      createPlaylist('chan-alpha', { title: 'Alpha 1' });
      createPlaylist('chan-alpha', { title: 'Alpha 2' });
      createPlaylist('chan-beta', { title: 'Beta 1' });

      const alphaPlaylists = getPlaylistsByChannel('chan-alpha');
      expect(alphaPlaylists).toHaveLength(2);
      expect(alphaPlaylists.map((p) => p.title)).toEqual(['Alpha 1', 'Alpha 2']);

      const betaPlaylists = getPlaylistsByChannel('chan-beta');
      expect(betaPlaylists).toHaveLength(1);
      expect(betaPlaylists[0].title).toBe('Beta 1');
    });
  });

  describe('playlistSequencerService class singleton', () => {
    it('exposes identical functionality via OOP service wrapper', () => {
      const pl = playlistSequencerService.createPlaylist('chan-oop', { title: 'OOP Playlist' });
      expect(pl.title).toBe('OOP Playlist');
      playlistSequencerService.addVideoToPlaylist(pl.id, {
        videoId: 'vid-oop',
        title: 'OOP Track',
        durationSeconds: 120,
        channelName: 'OOP Channel',
      });

      const fetched = playlistSequencerService.getPlaylist(pl.id);
      expect(fetched?.items).toHaveLength(1);
      expect(playlistSequencerService.formatPlaylistDuration(3600)).toBe('1 hr 0 min');
    });
  });
});
