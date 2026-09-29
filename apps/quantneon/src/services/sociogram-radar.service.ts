// ============================================================================
// @quant/quantgram (apps/quantneon) - Sociogram Proximity Radar & Trending Engine
// Sociogram v1.0-grade Proximity Radar, Trending Hashtags & User Moderation Service
// ============================================================================

export type ReportReason =
  | 'spam'
  | 'harassment'
  | 'inappropriate_content'
  | 'hate_speech'
  | 'impersonation';

export interface UserLocationNode {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  latitude: number;
  longitude: number;
  isOnline: boolean;
  lastSeenAt: string;
  distanceKm?: number;
}

export interface HashtagMetric {
  hashtag: string; // e.g. '#photography'
  count: number;
  trendScore: number;
  velocity: 'rising' | 'steady' | 'declining';
  lastUsedAt: string;
}

export interface UserSafetyReport {
  reportId: string;
  reporterUserId: string;
  reportedUserId: string;
  reason: ReportReason;
  details?: string;
  status: 'PENDING' | 'INVESTIGATING' | 'RESOLVED' | 'DISMISSED';
  createdAt: string;
}

interface HashtagInternalRecord {
  hashtag: string;
  count: number;
  timestamps: number[];
  lastUsedAt: string;
}

// In-memory state registries
const locationNodes: Map<string, UserLocationNode> = new Map();
const hashtagStore: Map<string, HashtagInternalRecord> = new Map();
const blockStore: Map<string, Set<string>> = new Map();
const reportStore: Map<string, UserSafetyReport> = new Map();
const muteStore: Map<string, Set<string>> = new Map();

/**
 * Updates or registers a user's location and presence on the proximity radar
 */
export function updateUserLocation(
  userId: string,
  data: {
    username: string;
    displayName: string;
    avatarUrl?: string;
    latitude: number;
    longitude: number;
    isOnline?: boolean;
  },
): UserLocationNode {
  const node: UserLocationNode = {
    userId,
    username: data.username,
    displayName: data.displayName,
    avatarUrl: data.avatarUrl,
    latitude: data.latitude,
    longitude: data.longitude,
    isOnline: data.isOnline !== undefined ? data.isOnline : true,
    lastSeenAt: new Date().toISOString(),
  };

  locationNodes.set(userId, node);
  return { ...node };
}

/**
 * Gets a specific user's location node if registered
 */
export function getUserLocation(userId: string): UserLocationNode | undefined {
  const node = locationNodes.get(userId);
  return node ? { ...node } : undefined;
}

/**
 * Calculates geodesic distance using the Haversine formula (km)
 */
export function calculateHaversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  if (lat1 === lat2 && lon1 === lon2) {
    return 0;
  }

  const EARTH_RADIUS_KM = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const lat1Rad = (lat1 * Math.PI) / 180;
  const lat2Rad = (lat2 * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = EARTH_RADIUS_KM * c;

  return Math.round(distance * 100) / 100;
}

/**
 * Discovers nearby users within maxRadiusKm (default 25km), sorted by distance ascending.
 * Supports optional exclusion of caller user ID and bidirectional block filtering.
 */
export function getNearbyUsers(
  centerLat: number,
  centerLon: number,
  maxRadiusKm: number = 25,
  limit: number = 50,
  options?: { excludeUserId?: string; onlyOnline?: boolean },
): UserLocationNode[] {
  const nearby: UserLocationNode[] = [];

  for (const node of locationNodes.values()) {
    if (options?.excludeUserId) {
      if (node.userId === options.excludeUserId) continue;
      if (isUserBlocked(options.excludeUserId, node.userId)) continue;
    }

    if (options?.onlyOnline && !node.isOnline) {
      continue;
    }

    const dist = calculateHaversineDistanceKm(centerLat, centerLon, node.latitude, node.longitude);

    if (dist <= maxRadiusKm) {
      nearby.push({
        ...node,
        distanceKm: dist,
      });
    }
  }

  nearby.sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));

  return typeof limit === 'number' && limit > 0 ? nearby.slice(0, limit) : nearby;
}

/**
 * Ingests all hashtags from post content, normalizes to lowercase, and updates frequency and velocity.
 * Returns array of unique lowercase hashtags from this post.
 */
export function ingestHashtagsFromPost(content: string, timestamp?: string): string[] {
  if (!content) return [];

  // Match #tag patterns: alphanumeric characters and underscores
  const regex = /#([a-zA-Z0-9_\u00c0-\u024e]+)/g;
  const matches = content.match(regex);
  if (!matches) return [];

  const nowMs = timestamp ? new Date(timestamp).getTime() : Date.now();
  const isoTime = new Date(nowMs).toISOString();

  // Deduplicate per post
  const uniqueTags = Array.from(new Set(matches.map((tag) => tag.toLowerCase())));

  for (const tag of uniqueTags) {
    let record = hashtagStore.get(tag);
    if (!record) {
      record = {
        hashtag: tag,
        count: 0,
        timestamps: [],
        lastUsedAt: isoTime,
      };
      hashtagStore.set(tag, record);
    }

    record.count += 1;
    record.timestamps.push(nowMs);
    record.lastUsedAt = isoTime;
  }

  return uniqueTags;
}

/**
 * Returns trending hashtags ranked by trendScore and mention frequency descending.
 */
export function getTrendingHashtags(limit: number = 20): HashtagMetric[] {
  if (hashtagStore.size === 0) return [];

  // Determine reference time: latest observed timestamp across all tags or current time
  let maxTime = 0;
  for (const record of hashtagStore.values()) {
    if (record.timestamps.length > 0) {
      const latestInRecord = record.timestamps[record.timestamps.length - 1];
      if (latestInRecord > maxTime) {
        maxTime = latestInRecord;
      }
    }
  }
  const refTime = maxTime > 0 ? maxTime : Date.now();

  // Rolling time windows:
  // Recent window: [refTime - 1hr, refTime]
  // Prior window:  [refTime - 2hr, refTime - 1hr)
  const WINDOW_MS = 60 * 60 * 1000;
  const recentThreshold = refTime - WINDOW_MS;
  const priorThreshold = refTime - 2 * WINDOW_MS;

  const results: HashtagMetric[] = [];

  for (const record of hashtagStore.values()) {
    let recentMentions = 0;
    let priorMentions = 0;

    for (const ts of record.timestamps) {
      if (ts >= recentThreshold && ts <= refTime) {
        recentMentions++;
      } else if (ts >= priorThreshold && ts < recentThreshold) {
        priorMentions++;
      }
    }

    let velocity: 'rising' | 'steady' | 'declining';
    if (recentMentions > priorMentions) {
      velocity = 'rising';
    } else if (recentMentions < priorMentions) {
      velocity = 'declining';
    } else {
      if (recentMentions > 0) {
        velocity = 'steady';
      } else {
        velocity = record.timestamps.length > 0 ? 'declining' : 'steady';
      }
    }

    const velocityMultiplier = velocity === 'rising' ? 1.5 : velocity === 'steady' ? 1.0 : 0.6;
    const rawScore = (record.count * 10 + recentMentions * 25) * velocityMultiplier;
    const trendScore = Math.round(rawScore * 10) / 10;

    results.push({
      hashtag: record.hashtag,
      count: record.count,
      trendScore,
      velocity,
      lastUsedAt: record.lastUsedAt,
    });
  }

  // Sort descending by trendScore, then count
  results.sort((a, b) => {
    if (b.trendScore !== a.trendScore) {
      return b.trendScore - a.trendScore;
    }
    return b.count - a.count;
  });

  return typeof limit === 'number' && limit > 0 ? results.slice(0, limit) : results;
}

/**
 * File a structured safety report against a user
 */
export function reportUser(
  reporterId: string,
  reportedId: string,
  reason: ReportReason,
  details?: string,
): UserSafetyReport {
  const reportId = `rep_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const report: UserSafetyReport = {
    reportId,
    reporterUserId: reporterId,
    reportedUserId: reportedId,
    reason,
    details: details?.trim() || undefined,
    status: 'PENDING',
    createdAt: new Date().toISOString(),
  };

  reportStore.set(reportId, report);
  return { ...report };
}

/**
 * Updates safety report status (e.g. PENDING -> INVESTIGATING -> RESOLVED / DISMISSED)
 */
export function updateReportStatus(
  reportId: string,
  status: UserSafetyReport['status'],
): UserSafetyReport | null {
  const report = reportStore.get(reportId);
  if (!report) return null;
  report.status = status;
  return { ...report };
}

/**
 * Retrieves all registered safety reports
 */
export function getReports(): UserSafetyReport[] {
  return Array.from(reportStore.values()).map((r) => ({ ...r }));
}

/**
 * Retrieves a single report by ID
 */
export function getReportById(reportId: string): UserSafetyReport | undefined {
  const report = reportStore.get(reportId);
  return report ? { ...report } : undefined;
}

/**
 * Blocks a target user
 */
export function blockUser(userId: string, targetUserId: string): boolean {
  if (!userId || !targetUserId || userId === targetUserId) return false;
  let userBlocks = blockStore.get(userId);
  if (!userBlocks) {
    userBlocks = new Set();
    blockStore.set(userId, userBlocks);
  }
  userBlocks.add(targetUserId);
  return true;
}

/**
 * Unblocks a target user
 */
export function unblockUser(userId: string, targetUserId: string): boolean {
  if (!userId || !targetUserId) return false;
  const userBlocks = blockStore.get(userId);
  if (!userBlocks) return false;
  return userBlocks.delete(targetUserId);
}

/**
 * Checks bidirectional blocking: returns true if userId blocked targetUserId OR targetUserId blocked userId
 */
export function isUserBlocked(userId: string, targetUserId: string): boolean {
  if (!userId || !targetUserId) return false;
  const blocks1 = blockStore.get(userId);
  if (blocks1 && blocks1.has(targetUserId)) {
    return true;
  }
  const blocks2 = blockStore.get(targetUserId);
  if (blocks2 && blocks2.has(userId)) {
    return true;
  }
  return false;
}

/**
 * Checks if a specific user directly blocked targetUserId (unidirectional)
 */
export function hasDirectlyBlocked(userId: string, targetUserId: string): boolean {
  if (!userId || !targetUserId) return false;
  const blocks = blockStore.get(userId);
  return blocks ? blocks.has(targetUserId) : false;
}

/**
 * Mutes a user
 */
export function muteUser(userId: string, targetUserId: string): boolean {
  if (!userId || !targetUserId || userId === targetUserId) return false;
  let mutes = muteStore.get(userId);
  if (!mutes) {
    mutes = new Set();
    muteStore.set(userId, mutes);
  }
  mutes.add(targetUserId);
  return true;
}

/**
 * Checks if targetUserId is muted by userId
 */
export function isUserMuted(userId: string, targetUserId: string): boolean {
  const mutes = muteStore.get(userId);
  return mutes ? mutes.has(targetUserId) : false;
}

/**
 * Unmutes a user
 */
export function unmuteUser(userId: string, targetUserId: string): boolean {
  const mutes = muteStore.get(userId);
  if (!mutes) return false;
  return mutes.delete(targetUserId);
}

/**
 * Resets all internal stores for test isolation
 */
export function clearRadarForTesting(): void {
  locationNodes.clear();
  hashtagStore.clear();
  blockStore.clear();
  reportStore.clear();
  muteStore.clear();
}
