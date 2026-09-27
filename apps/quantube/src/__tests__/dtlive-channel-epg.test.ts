import { describe, it, expect, beforeEach } from 'vitest';
import {
  createChannel,
  getChannelById,
  listChannels,
  addProgramToSchedule,
  getCurrentPlayingProgram,
  getUpcomingPrograms,
  generateStreamKey,
  validateStreamKey,
  revokeStreamKey,
  validateRtmpIngest,
  clearTvForTesting,
  type TvProgramScheduleItem,
  type LiveTvChannel,
  type CurrentPlayingProgram,
} from '../services/tv-channel-epg.service';

describe('DTLive v2.1-grade Live TV Channel EPG Schedule & Stream Key Engine', () => {
  const SECRET_KEY = 'quant_production_tv_secret_key_9921';

  beforeEach(() => {
    clearTvForTesting();
  });

  describe('Channel Management & Schedule Addition', () => {
    it('creates a new live TV channel with initial inactive stream key and empty schedules', () => {
      const channel = createChannel({
        name: 'Quant News 24/7',
        channelNumber: 101,
        logoUrl: 'https://images.quantube.in/channels/quant-news-logo.png',
        streamUrl: 'https://cdn.quantube.in/live/quant-news/index.m3u8',
        category: 'News',
      });

      expect(channel.id).toBeDefined();
      expect(channel.name).toBe('Quant News 24/7');
      expect(channel.channelNumber).toBe(101);
      expect(channel.logoUrl).toBe('https://images.quantube.in/channels/quant-news-logo.png');
      expect(channel.streamUrl).toBe('https://cdn.quantube.in/live/quant-news/index.m3u8');
      expect(channel.streamKey).toBe('');
      expect(channel.isLive).toBe(false);
      expect(channel.category).toBe('News');
      expect(channel.schedules).toEqual([]);

      const fetched = getChannelById(channel.id);
      expect(fetched).not.toBeNull();
      expect(fetched?.id).toBe(channel.id);
    });

    it('rejects channel creation with invalid names or non-positive channel numbers', () => {
      expect(() =>
        createChannel({
          name: '',
          channelNumber: 101,
          logoUrl: 'https://example.com/logo.png',
          streamUrl: 'https://example.com/stream.m3u8',
          category: 'News',
        }),
      ).toThrow('Channel name is required');

      expect(() =>
        createChannel({
          name: 'Invalid Channel',
          channelNumber: 0,
          logoUrl: 'https://example.com/logo.png',
          streamUrl: 'https://example.com/stream.m3u8',
          category: 'News',
        }),
      ).toThrow('Channel number must be a positive integer');
    });

    it('lists all channels sorted by channelNumber', () => {
      createChannel({
        name: 'Channel 300',
        channelNumber: 300,
        logoUrl: 'https://example.com/logo3.png',
        streamUrl: 'https://example.com/stream3.m3u8',
        category: 'General',
      });
      createChannel({
        name: 'Channel 100',
        channelNumber: 100,
        logoUrl: 'https://example.com/logo1.png',
        streamUrl: 'https://example.com/stream1.m3u8',
        category: 'News',
      });
      createChannel({
        name: 'Channel 200',
        channelNumber: 200,
        logoUrl: 'https://example.com/logo2.png',
        streamUrl: 'https://example.com/stream2.m3u8',
        category: 'Sports',
      });

      const list = listChannels();
      expect(list.length).toBe(3);
      expect(list[0].channelNumber).toBe(100);
      expect(list[1].channelNumber).toBe(200);
      expect(list[2].channelNumber).toBe(300);
    });

    it('adds a scheduled program with automatic durationMinutes calculation from startTime and endTime', () => {
      const channel = createChannel({
        name: 'Quant Sports HD',
        channelNumber: 202,
        logoUrl: 'https://images.quantube.in/channels/sports.png',
        streamUrl: 'https://cdn.quantube.in/live/sports/index.m3u8',
        category: 'Sports',
      });

      const program = addProgramToSchedule(channel.id, {
        title: 'UEFA Champions League Live',
        synopsis: 'Live coverage of the semi-final first leg clash.',
        startTime: '2026-09-27T18:00:00Z',
        endTime: '2026-09-27T20:00:00Z',
        thumbnailUrl: 'https://images.quantube.in/shows/champions-league.jpg',
        ageRating: 'PG',
        category: 'Sports',
      });

      expect(program.id).toBeDefined();
      expect(program.channelId).toBe(channel.id);
      expect(program.title).toBe('UEFA Champions League Live');
      expect(program.durationMinutes).toBe(120); // 2 hours = 120 minutes
      expect(program.ageRating).toBe('PG');
      expect(program.category).toBe('Sports');

      const updatedChannel = getChannelById(channel.id);
      expect(updatedChannel?.schedules.length).toBe(1);
      expect(updatedChannel?.schedules[0].id).toBe(program.id);
    });

    it('throws error when endTime is before or equal to startTime', () => {
      const channel = createChannel({
        name: 'Quant Cinema',
        channelNumber: 303,
        logoUrl: 'https://images.quantube.in/channels/cinema.png',
        streamUrl: 'https://cdn.quantube.in/live/cinema/index.m3u8',
        category: 'Movie',
      });

      expect(() =>
        addProgramToSchedule(channel.id, {
          title: 'Time Paradox Movie',
          synopsis: 'An end time before start time.',
          startTime: '2026-09-27T15:00:00Z',
          endTime: '2026-09-27T14:00:00Z',
          ageRating: 'PG-13',
          category: 'Movie',
        }),
      ).toThrow('Invalid program schedule: endTime must be greater than startTime');

      expect(() =>
        addProgramToSchedule(channel.id, {
          title: 'Zero Duration Movie',
          synopsis: 'Same start and end time.',
          startTime: '2026-09-27T15:00:00Z',
          endTime: '2026-09-27T15:00:00Z',
          ageRating: 'PG-13',
          category: 'Movie',
        }),
      ).toThrow('Invalid program schedule: endTime must be greater than startTime');
    });

    it('throws error when channel is not found', () => {
      expect(() =>
        addProgramToSchedule('non_existent_channel', {
          title: 'Missing Channel Show',
          synopsis: 'Show on unknown channel.',
          startTime: '2026-09-27T15:00:00Z',
          endTime: '2026-09-27T16:00:00Z',
          ageRating: 'PG',
          category: 'News',
        }),
      ).toThrow('Channel with ID non_existent_channel not found');
    });
  });

  describe('getCurrentPlayingProgram', () => {
    it('identifies the ongoing show and computes correct elapsed percentage and remaining time', () => {
      const channel = createChannel({
        name: 'Quant Discovery',
        channelNumber: 404,
        logoUrl: 'https://images.quantube.in/channels/discovery.png',
        streamUrl: 'https://cdn.quantube.in/live/discovery/index.m3u8',
        category: 'Documentary',
      });

      // Show 1: 10:00 to 11:00 (60 mins)
      addProgramToSchedule(channel.id, {
        title: 'Deep Ocean Mysteries',
        synopsis: 'Exploring the Mariana Trench.',
        startTime: '2026-09-27T10:00:00.000Z',
        endTime: '2026-09-27T11:00:00.000Z',
        ageRating: 'G',
        category: 'Documentary',
      });

      // Show 2: 11:00 to 12:30 (90 mins)
      addProgramToSchedule(channel.id, {
        title: 'Volcanoes of the Pacific',
        synopsis: 'Journey into the Ring of Fire.',
        startTime: '2026-09-27T11:00:00.000Z',
        endTime: '2026-09-27T12:30:00.000Z',
        ageRating: 'PG',
        category: 'Documentary',
      });

      // Test mid-way through Show 1 (at 10:15 - exactly 15 minutes into 60 mins -> 25%)
      const midShow1 = getCurrentPlayingProgram(channel.id, '2026-09-27T10:15:00.000Z');
      expect(midShow1).not.toBeNull();
      expect(midShow1?.program.title).toBe('Deep Ocean Mysteries');
      expect(midShow1?.elapsedMinutes).toBe(15);
      expect(midShow1?.remainingMinutes).toBe(45);
      expect(midShow1?.progressPercentage).toBe(25);

      // Test mid-way through Show 2 (at 11:45 - 45 minutes into 90 mins -> 50%)
      const midShow2 = getCurrentPlayingProgram(channel.id, '2026-09-27T11:45:00.000Z');
      expect(midShow2).not.toBeNull();
      expect(midShow2?.program.title).toBe('Volcanoes of the Pacific');
      expect(midShow2?.elapsedMinutes).toBe(45);
      expect(midShow2?.remainingMinutes).toBe(45);
      expect(midShow2?.progressPercentage).toBe(50);
    });

    it('returns null when no show is scheduled for the given timestamp', () => {
      const channel = createChannel({
        name: 'Quant SciFi',
        channelNumber: 505,
        logoUrl: 'https://images.quantube.in/channels/scifi.png',
        streamUrl: 'https://cdn.quantube.in/live/scifi/index.m3u8',
        category: 'Sci-Fi',
      });

      addProgramToSchedule(channel.id, {
        title: 'Interstellar Voyage',
        synopsis: 'Deep space exploration.',
        startTime: '2026-09-27T14:00:00.000Z',
        endTime: '2026-09-27T16:00:00.000Z',
        ageRating: 'PG-13',
        category: 'Sci-Fi',
      });

      const beforeShow = getCurrentPlayingProgram(channel.id, '2026-09-27T13:30:00.000Z');
      expect(beforeShow).toBeNull();

      const afterShow = getCurrentPlayingProgram(channel.id, '2026-09-27T16:30:00.000Z');
      expect(afterShow).toBeNull();
    });

    it('returns null for non-existent channel or invalid timestamp', () => {
      expect(getCurrentPlayingProgram('unknown_channel_id')).toBeNull();
      expect(getCurrentPlayingProgram('unknown_channel_id', 'invalid_date_iso')).toBeNull();
    });
  });

  describe('getUpcomingPrograms', () => {
    it('returns future scheduled shows sorted chronologically', () => {
      const channel = createChannel({
        name: 'Quant Primetime',
        channelNumber: 606,
        logoUrl: 'https://images.quantube.in/channels/primetime.png',
        streamUrl: 'https://cdn.quantube.in/live/primetime/index.m3u8',
        category: 'Entertainment',
      });

      addProgramToSchedule(channel.id, {
        title: 'Morning Breakfast Show',
        synopsis: 'Daily morning roundup.',
        startTime: '2026-09-27T08:00:00.000Z',
        endTime: '2026-09-27T09:00:00.000Z',
        ageRating: 'G',
        category: 'Entertainment',
      });

      addProgramToSchedule(channel.id, {
        title: 'Midday Cinema Classic',
        synopsis: 'Classic gold cinema.',
        startTime: '2026-09-27T12:00:00.000Z',
        endTime: '2026-09-27T14:00:00.000Z',
        ageRating: 'PG',
        category: 'Movie',
      });

      addProgramToSchedule(channel.id, {
        title: 'Evening Primetime Drama',
        synopsis: 'Thrilling family drama.',
        startTime: '2026-09-27T19:00:00.000Z',
        endTime: '2026-09-27T20:30:00.000Z',
        ageRating: 'PG-13',
        category: 'Drama',
      });

      addProgramToSchedule(channel.id, {
        title: 'Late Night Talk Show',
        synopsis: 'Comedy interviews and celebrity guests.',
        startTime: '2026-09-27T22:00:00.000Z',
        endTime: '2026-09-27T23:00:00.000Z',
        ageRating: 'R',
        category: 'Comedy',
      });

      // Query from 10:00 AM -> should return Midday, Evening, and Late Night in order
      const upcoming = getUpcomingPrograms(channel.id, '2026-09-27T10:00:00.000Z');
      expect(upcoming.length).toBe(3);
      expect(upcoming[0].title).toBe('Midday Cinema Classic');
      expect(upcoming[1].title).toBe('Evening Primetime Drama');
      expect(upcoming[2].title).toBe('Late Night Talk Show');

      // Test limit parameter
      const limited = getUpcomingPrograms(channel.id, '2026-09-27T10:00:00.000Z', 2);
      expect(limited.length).toBe(2);
      expect(limited[0].title).toBe('Midday Cinema Classic');
      expect(limited[1].title).toBe('Evening Primetime Drama');
    });

    it('returns empty array when channel does not exist', () => {
      const result = getUpcomingPrograms('non_existent_channel_999');
      expect(result).toEqual([]);
    });
  });

  describe('Secure Stream Key Management & Validation', () => {
    it('generates HMAC-SHA256 cryptographically signed stream key prefixed with live_sk_', () => {
      const channel = createChannel({
        name: 'Quant Live Ingest',
        channelNumber: 707,
        logoUrl: 'https://images.quantube.in/channels/live.png',
        streamUrl: 'https://cdn.quantube.in/live/ingest/index.m3u8',
        category: 'Live',
      });

      const key = generateStreamKey(channel.id, SECRET_KEY);
      expect(key.startsWith('live_sk_')).toBe(true);

      const updated = getChannelById(channel.id);
      expect(updated?.streamKey).toBe(key);
      expect(updated?.isLive).toBe(true);

      // Validate stream key with correct secret key
      const isValid = validateStreamKey(channel.id, key, SECRET_KEY);
      expect(isValid).toBe(true);
    });

    it('rejects validation when secret key is incorrect or key is tampered with', () => {
      const channel = createChannel({
        name: 'Quant Secure Broadcast',
        channelNumber: 808,
        logoUrl: 'https://images.quantube.in/channels/secure.png',
        streamUrl: 'https://cdn.quantube.in/live/secure/index.m3u8',
        category: 'News',
      });

      const validKey = generateStreamKey(channel.id, SECRET_KEY);

      // Wrong secret key
      const isWrongSecret = validateStreamKey(channel.id, validKey, 'wrong_secret_12345');
      expect(isWrongSecret).toBe(false);

      // Tampered key
      const tamperedKey = validKey + 'tampered';
      const isTampered = validateStreamKey(channel.id, tamperedKey, SECRET_KEY);
      expect(isTampered).toBe(false);

      // Malformed key without live_sk_ prefix
      expect(validateStreamKey(channel.id, 'invalid_prefix_abc', SECRET_KEY)).toBe(false);
    });

    it('revokes stream key and immediately invalidates broadcast authorization', () => {
      const channel = createChannel({
        name: 'Quant Revocation Test',
        channelNumber: 909,
        logoUrl: 'https://images.quantube.in/channels/revocation.png',
        streamUrl: 'https://cdn.quantube.in/live/revocation/index.m3u8',
        category: 'Entertainment',
      });

      const key = generateStreamKey(channel.id, SECRET_KEY);
      expect(validateStreamKey(channel.id, key, SECRET_KEY)).toBe(true);

      const revoked = revokeStreamKey(channel.id);
      expect(revoked).toBe(true);

      const updated = getChannelById(channel.id);
      expect(updated?.streamKey).toBe('');
      expect(updated?.isLive).toBe(false);

      // Attempting to validate previously valid key now fails
      expect(validateStreamKey(channel.id, key, SECRET_KEY)).toBe(false);
    });

    it('validates RTMP ingestion endpoint with server host and authorization', () => {
      const channel = createChannel({
        name: 'Quant Ingestion Endpoint Channel',
        channelNumber: 999,
        logoUrl: 'https://images.quantube.in/channels/ingest.png',
        streamUrl: 'https://cdn.quantube.in/live/ingest-test/index.m3u8',
        category: 'Live',
      });

      const key = generateStreamKey(channel.id, SECRET_KEY);

      const validIngest = validateRtmpIngest(channel.id, key, SECRET_KEY, 'live.quantube.in');
      expect(validIngest.valid).toBe(true);
      expect(validIngest.channelId).toBe(channel.id);
      expect(validIngest.channelName).toBe('Quant Ingestion Endpoint Channel');
      expect(validIngest.ingestEndpoint).toBe(`rtmp://live.quantube.in/live/${channel.id}`);

      // Invalid ingest with wrong secret
      const invalidIngest = validateRtmpIngest(channel.id, key, 'wrong_secret', 'live.quantube.in');
      expect(invalidIngest.valid).toBe(false);
      expect(invalidIngest.error).toBe('Invalid, revoked, or expired stream key');
    });
  });
});
