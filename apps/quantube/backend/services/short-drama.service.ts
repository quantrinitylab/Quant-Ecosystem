// ============================================================================
// QuantTube - ShortDramaService (SnapReels v1.1.7-grade Short Drama & Binge Playback Engine)
// ----------------------------------------------------------------------------
// Short Drama Series & Binge Streaming Engine:
// - Series catalog with genres (Romance, Revenge, Billionaire, Thriller, etc.)
// - Paywall gating with free episode thresholds (e.g. 1-5 free, 6+ paywalled)
// - Coin-based episode unlocks with user balance verification
// - User watch history tracking and completion percentage computation
// - Continuous binge auto-play sequencing between consecutive episodes
// ============================================================================

export type DramaGenre = 'romance' | 'revenge' | 'billionaire' | 'thriller' | 'fantasy' | 'comedy';

export interface DramaEpisode {
  id: string;
  seriesId: string;
  episodeNumber: number;
  title: string;
  durationSeconds: number;
  videoUrl: string;
  thumbnailUrl?: string;
  isFree: boolean;
  coinCost: number; // 0 if free, e.g. 50 coins if locked
}

export interface ShortDramaSeries {
  id: string;
  title: string;
  synopsis: string;
  coverPosterUrl: string;
  genres: DramaGenre[];
  totalEpisodes: number;
  freeEpisodesCount: number;
  episodes: DramaEpisode[];
  viewCount: number;
  rating: number; // 1-5
  createdAt: string;
}

export interface UserWatchProgress {
  seriesId: string;
  userId: string;
  lastWatchedEpisodeNumber: number;
  unlockedEpisodeNumbers: number[];
  completionPercentage: number;
  lastWatchedAt: string;
}

export interface UnlockEpisodeResult {
  success: boolean;
  remainingCoins: number;
  progress: UserWatchProgress;
  error?: string;
}

// In-memory stores for drama series and user watch progress
const dramaSeriesStore = new Map<string, ShortDramaSeries>();
const userWatchProgressStore = new Map<string, UserWatchProgress>();

/**
 * Generate a unique identifier for drama series.
 */
function generateSeriesId(): string {
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 9);
  return `drama_${timestamp}_${randomSuffix}`;
}

/**
 * Generate a unique identifier for drama episodes.
 */
function generateEpisodeId(seriesId: string, episodeNumber: number): string {
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  return `ep_${seriesId}_${episodeNumber}_${randomSuffix}`;
}

/**
 * Deep clones a ShortDramaSeries object to prevent accidental mutation of internal store.
 */
function cloneSeries(series: ShortDramaSeries): ShortDramaSeries {
  return {
    ...series,
    genres: [...series.genres],
    episodes: series.episodes.map((ep) => ({ ...ep })),
  };
}

/**
 * Deep clones a UserWatchProgress object.
 */
function cloneProgress(progress: UserWatchProgress): UserWatchProgress {
  return {
    ...progress,
    unlockedEpisodeNumbers: [...progress.unlockedEpisodeNumbers],
  };
}

/**
 * Creates a new Short Drama Series.
 */
export function createDramaSeries(data: {
  title: string;
  synopsis: string;
  coverPosterUrl: string;
  genres: DramaGenre[];
  freeEpisodesCount?: number;
}): ShortDramaSeries {
  if (!data?.title || typeof data.title !== 'string' || !data.title.trim()) {
    throw new Error('Series title is required');
  }

  const freeCount =
    data.freeEpisodesCount !== undefined && data.freeEpisodesCount >= 0
      ? Math.floor(data.freeEpisodesCount)
      : 5;

  const now = new Date().toISOString();
  const series: ShortDramaSeries = {
    id: generateSeriesId(),
    title: data.title.trim(),
    synopsis: data.synopsis?.trim() ?? '',
    coverPosterUrl: data.coverPosterUrl?.trim() ?? '',
    genres: Array.isArray(data.genres) && data.genres.length > 0 ? [...data.genres] : ['romance'],
    totalEpisodes: 0,
    freeEpisodesCount: freeCount,
    episodes: [],
    viewCount: 0,
    rating: 5,
    createdAt: now,
  };

  dramaSeriesStore.set(series.id, series);
  return cloneSeries(series);
}

/**
 * Adds an episode to a drama series.
 * Assigns episodeNumber = episodes.length + 1, updates totalEpisodes,
 * and recalculates free vs locked status based on freeEpisodesCount.
 */
export function addEpisodeToSeries(
  seriesId: string,
  episodeData: {
    title: string;
    durationSeconds: number;
    videoUrl: string;
    thumbnailUrl?: string;
    isFree?: boolean;
    coinCost?: number;
  },
): DramaEpisode {
  const series = dramaSeriesStore.get(seriesId);
  if (!series) {
    throw new Error(`Series not found: ${seriesId}`);
  }

  if (!episodeData?.videoUrl || typeof episodeData.videoUrl !== 'string') {
    throw new Error('videoUrl is required');
  }

  const episodeNumber = series.episodes.length + 1;
  const duration = Math.max(0, Math.floor(episodeData.durationSeconds || 0));

  // Determine if episode is free based on series freeEpisodesCount and explicit overrides
  const isFree = episodeNumber <= series.freeEpisodesCount ? true : episodeData.isFree === true;

  const coinCost = isFree
    ? 0
    : typeof episodeData.coinCost === 'number' && episodeData.coinCost > 0
      ? episodeData.coinCost
      : 50;

  const episode: DramaEpisode = {
    id: generateEpisodeId(seriesId, episodeNumber),
    seriesId,
    episodeNumber,
    title: episodeData.title?.trim() || `Episode ${episodeNumber}`,
    durationSeconds: duration,
    videoUrl: episodeData.videoUrl.trim(),
    thumbnailUrl: episodeData.thumbnailUrl?.trim(),
    isFree,
    coinCost,
  };

  series.episodes.push(episode);
  series.totalEpisodes = series.episodes.length;

  return { ...episode };
}

/**
 * Retrieves a drama series by ID.
 */
export function getSeriesById(seriesId: string): ShortDramaSeries | null {
  const series = dramaSeriesStore.get(seriesId);
  if (!series) return null;
  return cloneSeries(series);
}

/**
 * Lists all series, optionally filtered by genre.
 */
export function listSeries(genre?: DramaGenre): ShortDramaSeries[] {
  const results: ShortDramaSeries[] = [];
  for (const series of dramaSeriesStore.values()) {
    if (!genre || series.genres.includes(genre)) {
      results.push(cloneSeries(series));
    }
  }
  return results;
}

/**
 * Helper to obtain or initialize a user's watch progress for a given series.
 */
function getOrCreateUserWatchProgress(userId: string, series: ShortDramaSeries): UserWatchProgress {
  const progressKey = `${userId}:${series.id}`;
  let progress = userWatchProgressStore.get(progressKey);

  if (!progress) {
    const freeEpisodes = series.episodes.filter((ep) => ep.isFree).map((ep) => ep.episodeNumber);

    progress = {
      seriesId: series.id,
      userId,
      lastWatchedEpisodeNumber: 0,
      unlockedEpisodeNumbers: freeEpisodes,
      completionPercentage: 0,
      lastWatchedAt: new Date().toISOString(),
    };
    userWatchProgressStore.set(progressKey, progress);
  }

  return progress;
}

/**
 * Unlocks a drama episode for a user.
 * - Verifies episode exists.
 * - If already unlocked or free, succeeds with 0 coin deduction.
 * - If locked, verifies userCoinBalance >= episode.coinCost, deducts coins,
 *   and records episode in unlockedEpisodeNumbers.
 */
export function unlockEpisode(
  userId: string,
  seriesId: string,
  episodeNumber: number,
  userCoinBalance: number,
): UnlockEpisodeResult {
  const series = dramaSeriesStore.get(seriesId);
  if (!series) {
    return {
      success: false,
      remainingCoins: userCoinBalance,
      progress: {
        seriesId,
        userId,
        lastWatchedEpisodeNumber: 0,
        unlockedEpisodeNumbers: [],
        completionPercentage: 0,
        lastWatchedAt: new Date().toISOString(),
      },
      error: `Series not found: ${seriesId}`,
    };
  }

  const episode = series.episodes.find((ep) => ep.episodeNumber === episodeNumber);
  if (!episode) {
    const progress = getOrCreateUserWatchProgress(userId, series);
    return {
      success: false,
      remainingCoins: userCoinBalance,
      progress: cloneProgress(progress),
      error: `Episode ${episodeNumber} not found in series ${seriesId}`,
    };
  }

  const progress = getOrCreateUserWatchProgress(userId, series);

  // If already unlocked or episode is free, no coin deduction required
  const isAlreadyUnlocked =
    episode.isFree || progress.unlockedEpisodeNumbers.includes(episodeNumber);

  if (isAlreadyUnlocked) {
    if (!progress.unlockedEpisodeNumbers.includes(episodeNumber)) {
      progress.unlockedEpisodeNumbers.push(episodeNumber);
      progress.unlockedEpisodeNumbers.sort((a, b) => a - b);
    }
    return {
      success: true,
      remainingCoins: userCoinBalance,
      progress: cloneProgress(progress),
    };
  }

  // Episode is locked: verify coin balance
  if (userCoinBalance < episode.coinCost) {
    return {
      success: false,
      remainingCoins: userCoinBalance,
      progress: cloneProgress(progress),
      error: 'Insufficient coin balance',
    };
  }

  // Deduct coins and unlock
  const remainingCoins = userCoinBalance - episode.coinCost;
  if (!progress.unlockedEpisodeNumbers.includes(episodeNumber)) {
    progress.unlockedEpisodeNumbers.push(episodeNumber);
    progress.unlockedEpisodeNumbers.sort((a, b) => a - b);
  }
  progress.lastWatchedAt = new Date().toISOString();

  return {
    success: true,
    remainingCoins,
    progress: cloneProgress(progress),
  };
}

/**
 * Records user watch progress for an episode and calculates completion percentage.
 */
export function recordWatchProgress(
  userId: string,
  seriesId: string,
  episodeNumber: number,
): UserWatchProgress {
  const series = dramaSeriesStore.get(seriesId);
  if (!series) {
    throw new Error(`Series not found: ${seriesId}`);
  }

  const episode = series.episodes.find((ep) => ep.episodeNumber === episodeNumber);
  if (!episode) {
    throw new Error(`Episode ${episodeNumber} not found in series ${seriesId}`);
  }

  const progress = getOrCreateUserWatchProgress(userId, series);

  progress.lastWatchedEpisodeNumber = episodeNumber;
  if (episode.isFree && !progress.unlockedEpisodeNumbers.includes(episodeNumber)) {
    progress.unlockedEpisodeNumbers.push(episodeNumber);
    progress.unlockedEpisodeNumbers.sort((a, b) => a - b);
  }

  // Calculate completion percentage: Math.round((episodeNumber / totalEpisodes) * 100)
  const total = Math.max(1, series.totalEpisodes);
  progress.completionPercentage = Math.min(100, Math.round((episodeNumber / total) * 100));
  progress.lastWatchedAt = new Date().toISOString();

  // Increment series total view count
  series.viewCount += 1;

  return cloneProgress(progress);
}

/**
 * Resolves the next episode in sequence for binge auto-play.
 * Returns null if at the end of the series.
 */
export function getNextBingeEpisode(
  seriesId: string,
  currentEpisodeNumber: number,
): DramaEpisode | null {
  const series = dramaSeriesStore.get(seriesId);
  if (!series) {
    return null;
  }

  const nextEpisode = series.episodes.find((ep) => ep.episodeNumber === currentEpisodeNumber + 1);

  return nextEpisode ? { ...nextEpisode } : null;
}

/**
 * Clears drama series and user progress stores for clean test isolation.
 */
export function clearDramaForTesting(): void {
  dramaSeriesStore.clear();
  userWatchProgressStore.clear();
}

/**
 * Service class wrapper for dependency injection or object-oriented usage.
 */
export class ShortDramaService {
  createDramaSeries = createDramaSeries;
  addEpisodeToSeries = addEpisodeToSeries;
  getSeriesById = getSeriesById;
  listSeries = listSeries;
  unlockEpisode = unlockEpisode;
  recordWatchProgress = recordWatchProgress;
  getNextBingeEpisode = getNextBingeEpisode;
  clearDramaForTesting = clearDramaForTesting;
}

export const shortDramaService = new ShortDramaService();
export default shortDramaService;
