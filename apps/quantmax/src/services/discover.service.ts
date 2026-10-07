import { apiFetchRaw } from '@quant/api-client';
// ============================================================================
// QuantMax - Discover Data Service
// ============================================================================
//
// TRUST CONTRACT (P0 fix, 2026-10-06):
// /discover is a PUBLIC page. It previously rendered fabricated content as
// real — client-generated random engagement counts and thumbnails on a dead
// placeholder CDN host. That is forbidden here.
//
// This service loads discover content ONLY from the backend. Every metric it
// returns is a number that came from a real API response, or null. Every
// media URL is a real URL from a real API response, or null. When the backend
// has no discover endpoint, is unreachable, or rejects the request (401
// unauthenticated), the service returns EMPTY collections — the page then
// renders honest "No data yet" empty states. It NEVER synthesizes data.
//
// When a public discover API ships, wire it in fetchDiscoverContent() below
// and keep this contract: validate server payloads, pass through real numbers
// as-is, never generate metrics client-side.

// ---------------------------------------------------------------------------
// Types — metrics and media are nullable because real data may not exist yet.
// ---------------------------------------------------------------------------

export interface TrendingSound {
  id: string;
  name: string;
  artistName: string | null;
  /** Real cover art URL from the API, or null (rendered as a placeholder). */
  coverUrl: string | null;
  /** Real video count from the API, or null (count line hidden). Never generated. */
  videoCount: number | null;
  /** Real preview audio URL from the API, or null (no playback). */
  previewUrl: string | null;
  duration: number | null;
}

export interface HashtagChallenge {
  id: string;
  hashtag: string;
  title: string;
  description: string | null;
  bannerUrl: string | null;
  videoCount: number | null;
  participantCount: number | null;
  prizePool: string | null;
  endsAt: string | null;
  sponsored: boolean;
}

export interface CreatorSpotlight {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  followerCount: number | null;
  videoCount: number | null;
  isVerified: boolean;
  category: string | null;
}

export interface DiscoverVideo {
  id: string;
  thumbnailUrl: string | null;
  viewCount: number | null;
  likes: number | null;
  creatorUsername: string | null;
  caption: string | null;
  duration: number | null;
}

export interface DiscoverContent {
  sounds: TrendingSound[];
  challenges: HashtagChallenge[];
  spotlights: CreatorSpotlight[];
}

export const EMPTY_DISCOVER_CONTENT: DiscoverContent = {
  sounds: [],
  challenges: [],
  spotlights: [],
};

// ---------------------------------------------------------------------------
// Payload validation — only real, server-provided values are accepted.
// A missing metric stays null; it is NEVER backfilled with a random number.
// ---------------------------------------------------------------------------

function asNonNegativeInt(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : null;
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/**
 * Map a raw backend item onto TrendingSound, keeping only real values.
 * Exported for unit tests (contract: no fabrication).
 */
export function mapTrendingSound(raw: Record<string, unknown>): TrendingSound {
  return {
    id: String(raw.id ?? ''),
    name: asNonEmptyString(raw.name) ?? 'Untitled sound',
    artistName: asNonEmptyString(raw.artistName),
    coverUrl: asNonEmptyString(raw.coverUrl),
    videoCount: asNonNegativeInt(raw.videoCount),
    previewUrl: asNonEmptyString(raw.previewUrl),
    duration: asNonNegativeInt(raw.duration),
  };
}

/**
 * Map a raw backend item onto HashtagChallenge, keeping only real values.
 * Exported for unit tests (contract: no fabrication).
 */
export function mapHashtagChallenge(raw: Record<string, unknown>): HashtagChallenge {
  return {
    id: String(raw.id ?? ''),
    hashtag: asNonEmptyString(raw.hashtag) ?? '#challenge',
    title: asNonEmptyString(raw.title) ?? 'Challenge',
    description: asNonEmptyString(raw.description),
    bannerUrl: asNonEmptyString(raw.bannerUrl),
    videoCount: asNonNegativeInt(raw.videoCount),
    participantCount: asNonNegativeInt(raw.participantCount),
    prizePool: asNonEmptyString(raw.prizePool),
    endsAt: asNonEmptyString(raw.endsAt),
    sponsored: raw.sponsored === true,
  };
}

/**
 * Map a raw backend item onto CreatorSpotlight, keeping only real values.
 * Exported for unit tests (contract: no fabrication).
 */
export function mapCreatorSpotlight(raw: Record<string, unknown>): CreatorSpotlight {
  return {
    id: String(raw.id ?? ''),
    username: asNonEmptyString(raw.username) ?? 'creator',
    displayName: asNonEmptyString(raw.displayName) ?? 'Creator',
    avatarUrl: asNonEmptyString(raw.avatarUrl),
    bio: asNonEmptyString(raw.bio),
    followerCount: asNonNegativeInt(raw.followerCount),
    videoCount: asNonNegativeInt(raw.videoCount),
    isVerified: raw.isVerified === true,
    category: asNonEmptyString(raw.category),
  };
}

/**
 * Map a raw backend item onto DiscoverVideo, keeping only real values.
 * Exported for unit tests (contract: no fabrication).
 */
export function mapDiscoverVideo(raw: Record<string, unknown>): DiscoverVideo {
  return {
    id: String(raw.id ?? ''),
    thumbnailUrl: asNonEmptyString(raw.thumbnailUrl),
    viewCount: asNonNegativeInt(raw.viewCount),
    likes: asNonNegativeInt(raw.likes),
    creatorUsername: asNonEmptyString(raw.creatorUsername),
    caption: asNonEmptyString(raw.caption),
    duration: asNonNegativeInt(raw.duration),
  };
}

// ---------------------------------------------------------------------------
// Fetchers — real backend only, graceful empty on any failure.
// ---------------------------------------------------------------------------

interface DiscoverApiResponse {
  success?: boolean;
  data?: {
    sounds?: Record<string, unknown>[];
    challenges?: Record<string, unknown>[];
    spotlights?: Record<string, unknown>[];
    videos?: Record<string, unknown>[];
  };
}

async function fetchJson(path: string): Promise<DiscoverApiResponse | null> {
  try {
    const res = await apiFetchRaw(path, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null; // 401/404/5xx → no real data; page shows empty states
    const body = (await res.json()) as DiscoverApiResponse;
    if (!body || body.success === false) return null;
    return body;
  } catch {
    return null; // network failure → no real data; page shows empty states
  }
}

/**
 * Load discover content from the backend. Returns EMPTY collections when no
 * real data is available — NEVER fabricated items.
 */
export async function fetchDiscoverContent(): Promise<DiscoverContent> {
  const body = await fetchJson('/api/discover');
  if (!body?.data) return { ...EMPTY_DISCOVER_CONTENT };

  const sounds = Array.isArray(body.data.sounds)
    ? body.data.sounds.map(mapTrendingSound)
    : [];
  const challenges = Array.isArray(body.data.challenges)
    ? body.data.challenges.map(mapHashtagChallenge)
    : [];
  const spotlights = Array.isArray(body.data.spotlights)
    ? body.data.spotlights.map(mapCreatorSpotlight)
    : [];

  return { sounds, challenges, spotlights };
}

/**
 * Load category video grid from the backend. Returns an EMPTY list when no
 * real data is available — NEVER fabricated items.
 */
export async function fetchDiscoverCategoryVideos(
  category: string,
): Promise<DiscoverVideo[]> {
  const body = await fetchJson(`/api/discover/category/${encodeURIComponent(category)}`);
  if (!body?.data || !Array.isArray(body.data.videos)) return [];
  return body.data.videos.map(mapDiscoverVideo);
}
