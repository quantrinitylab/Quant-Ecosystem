// ============================================================================
// QuantTube - TVChannelEpgService (DTLive v2.1-grade EPG Schedule & Stream Key Engine)
// ----------------------------------------------------------------------------
// Live TV Channel Electronic Program Guide (EPG) & Secure RTMP Engine:
// - Channel registry with stream metadata and program slots
// - EPG Timeline resolver (current live program, elapsed/remaining time, percentage)
// - Chronological upcoming schedule queries with optional limits
// - Cryptographically signed RTMP stream keys with HMAC-SHA256 and revocation
// - RTMP broadcast ingestion endpoint validation
// ============================================================================

import crypto from 'node:crypto';

export interface TvProgramScheduleItem {
  id: string;
  channelId: string;
  title: string;
  synopsis: string;
  startTime: string; // ISO date-time
  endTime: string; // ISO date-time
  durationMinutes: number;
  thumbnailUrl?: string;
  ageRating: 'G' | 'PG' | 'PG-13' | 'R';
  category: string; // e.g. 'News', 'Sports', 'Movie'
}

export interface LiveTvChannel {
  id: string;
  name: string;
  channelNumber: number;
  logoUrl: string;
  streamUrl: string;
  streamKey: string;
  isLive: boolean;
  category: string;
  schedules: TvProgramScheduleItem[];
}

export interface CurrentPlayingProgram {
  program: TvProgramScheduleItem;
  elapsedMinutes: number;
  remainingMinutes: number;
  progressPercentage: number;
}

export interface RtmpIngestValidationResult {
  valid: boolean;
  channelId?: string;
  channelName?: string;
  ingestEndpoint?: string;
  error?: string;
}

// In-memory channel store
const channelsStore = new Map<string, LiveTvChannel>();

/**
 * Creates a new Live TV Channel.
 */
export function createChannel(data: {
  name: string;
  channelNumber: number;
  logoUrl: string;
  streamUrl: string;
  category: string;
}): LiveTvChannel {
  if (!data.name || data.name.trim() === '') {
    throw new Error('Channel name is required');
  }
  if (typeof data.channelNumber !== 'number' || data.channelNumber <= 0) {
    throw new Error('Channel number must be a positive integer');
  }

  const id = `chan_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const channel: LiveTvChannel = {
    id,
    name: data.name.trim(),
    channelNumber: data.channelNumber,
    logoUrl: data.logoUrl,
    streamUrl: data.streamUrl,
    streamKey: '',
    isLive: false,
    category: data.category,
    schedules: [],
  };

  channelsStore.set(id, channel);
  return channel;
}

/**
 * Retrieves a channel by ID.
 */
export function getChannelById(channelId: string): LiveTvChannel | null {
  return channelsStore.get(channelId) || null;
}

/**
 * Lists all registered TV channels sorted by channel number.
 */
export function listChannels(): LiveTvChannel[] {
  return Array.from(channelsStore.values()).sort((a, b) => a.channelNumber - b.channelNumber);
}

/**
 * Adds a scheduled program to a channel's EPG guide.
 * Validates start/end times and calculates duration in minutes.
 */
export function addProgramToSchedule(
  channelId: string,
  program: Omit<TvProgramScheduleItem, 'id' | 'channelId' | 'durationMinutes'>,
): TvProgramScheduleItem {
  const channel = channelsStore.get(channelId);
  if (!channel) {
    throw new Error(`Channel with ID ${channelId} not found`);
  }

  const startMs = new Date(program.startTime).getTime();
  const endMs = new Date(program.endTime).getTime();

  if (isNaN(startMs) || isNaN(endMs)) {
    throw new Error('Invalid ISO date-time string provided for startTime or endTime');
  }

  if (endMs <= startMs) {
    throw new Error('Invalid program schedule: endTime must be greater than startTime');
  }

  const durationMinutes = Math.round((endMs - startMs) / (60 * 1000));

  const scheduleItem: TvProgramScheduleItem = {
    id: `prog_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    channelId,
    title: program.title,
    synopsis: program.synopsis,
    startTime: program.startTime,
    endTime: program.endTime,
    durationMinutes,
    thumbnailUrl: program.thumbnailUrl,
    ageRating: program.ageRating,
    category: program.category,
  };

  channel.schedules.push(scheduleItem);
  // Keep schedules sorted chronologically by startTime
  channel.schedules.sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
  );

  return scheduleItem;
}

/**
 * Resolves the currently playing program for a given channel and timestamp.
 * Calculates elapsed minutes, remaining minutes, and progress percentage.
 */
export function getCurrentPlayingProgram(
  channelId: string,
  currentTimeIso?: string,
): CurrentPlayingProgram | null {
  const channel = channelsStore.get(channelId);
  if (!channel) return null;

  const currentMs = currentTimeIso ? new Date(currentTimeIso).getTime() : Date.now();
  if (isNaN(currentMs)) return null;

  const program = channel.schedules.find((p) => {
    const start = new Date(p.startTime).getTime();
    const end = new Date(p.endTime).getTime();
    return currentMs >= start && currentMs <= end;
  });

  if (!program) return null;

  const start = new Date(program.startTime).getTime();
  const end = new Date(program.endTime).getTime();
  const totalMs = Math.max(1, end - start);
  const elapsedMs = Math.max(0, Math.min(currentMs - start, totalMs));
  const remainingMs = Math.max(0, end - currentMs);

  const elapsedMinutes = Math.floor(elapsedMs / (60 * 1000));
  const remainingMinutes = Math.max(0, Math.round(remainingMs / (60 * 1000)));
  const progressPercentage = Math.min(
    100,
    Math.max(0, Math.round((elapsedMs / totalMs) * 10000) / 100),
  );

  return {
    program,
    elapsedMinutes,
    remainingMinutes,
    progressPercentage,
  };
}

/**
 * Queries upcoming programs starting after the specified timestamp, sorted chronologically.
 */
export function getUpcomingPrograms(
  channelId: string,
  fromTimeIso?: string,
  limit?: number,
): TvProgramScheduleItem[] {
  const channel = channelsStore.get(channelId);
  if (!channel) return [];

  const fromTimeMs = fromTimeIso ? new Date(fromTimeIso).getTime() : Date.now();
  if (isNaN(fromTimeMs)) return [];

  const upcoming = channel.schedules
    .filter((p) => new Date(p.startTime).getTime() > fromTimeMs)
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  if (typeof limit === 'number' && limit > 0) {
    return upcoming.slice(0, limit);
  }

  return upcoming;
}

/**
 * Generates an HMAC-SHA256 cryptographically signed broadcast stream key.
 * Formats key as `live_sk_${nonce}_${hmacSignature}` and activates it for the channel.
 */
export function generateStreamKey(channelId: string, secretKey: string): string {
  if (!channelId) {
    throw new Error('channelId is required');
  }
  if (!secretKey) {
    throw new Error('secretKey is required');
  }

  const channel = channelsStore.get(channelId);
  if (!channel) {
    throw new Error(`Channel with ID ${channelId} not found`);
  }

  const nonce = crypto.randomBytes(16).toString('hex');
  const payload = `${channelId}:${nonce}`;
  const signature = crypto.createHmac('sha256', secretKey).update(payload).digest('hex');
  const streamKey = `live_sk_${nonce}_${signature}`;

  channel.streamKey = streamKey;
  channel.isLive = true;

  return streamKey;
}

/**
 * Validates a stream key using HMAC verification and checks channel activation.
 */
export function validateStreamKey(
  channelId: string,
  streamKey: string,
  secretKey: string,
): boolean {
  if (!channelId || !streamKey || !secretKey) {
    return false;
  }
  if (!streamKey.startsWith('live_sk_')) {
    return false;
  }

  const channel = channelsStore.get(channelId);
  if (!channel || channel.streamKey !== streamKey) {
    return false;
  }

  const raw = streamKey.slice('live_sk_'.length);
  const parts = raw.split('_');

  if (parts.length === 2) {
    const [nonce, signature] = parts;
    const payload = `${channelId}:${nonce}`;
    const expectedSig = crypto.createHmac('sha256', secretKey).update(payload).digest('hex');
    if (signature.length !== expectedSig.length) {
      return false;
    }
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'utf-8'),
      Buffer.from(expectedSig, 'utf-8'),
    );
  } else if (parts.length === 1) {
    const signature = parts[0];
    const expectedSig = crypto.createHmac('sha256', secretKey).update(channelId).digest('hex');
    if (signature.length !== expectedSig.length) {
      return false;
    }
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'utf-8'),
      Buffer.from(expectedSig, 'utf-8'),
    );
  }

  return false;
}

/**
 * Revokes a channel's active broadcast stream key and sets channel live state to false.
 */
export function revokeStreamKey(channelId: string): boolean {
  const channel = channelsStore.get(channelId);
  if (!channel) {
    return false;
  }
  channel.streamKey = '';
  channel.isLive = false;
  return true;
}

/**
 * Validates RTMP ingestion endpoint authorization for a channel stream key.
 */
export function validateRtmpIngest(
  channelId: string,
  streamKey: string,
  secretKey: string,
  serverHost: string = 'live.quantube.in',
): RtmpIngestValidationResult {
  const isValidKey = validateStreamKey(channelId, streamKey, secretKey);
  if (!isValidKey) {
    return {
      valid: false,
      error: 'Invalid, revoked, or expired stream key',
    };
  }

  const channel = channelsStore.get(channelId);
  if (!channel) {
    return {
      valid: false,
      error: 'Channel not found',
    };
  }

  return {
    valid: true,
    channelId: channel.id,
    channelName: channel.name,
    ingestEndpoint: `rtmp://${serverHost}/live/${channel.id}`,
  };
}

/**
 * Clears in-memory channel store for isolated test suites.
 */
export function clearTvForTesting(): void {
  channelsStore.clear();
}

export const tvChannelEpgService = {
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
};

export default tvChannelEpgService;
