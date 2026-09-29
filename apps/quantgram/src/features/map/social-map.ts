// ============================================================================
// QuantNeon - Geospatial Social Map Domain Logic
// Instagram 98-Screen Forensic Parity (Screens 33-36, 75-78)
// Story Location Clusters & Privacy Shield ("Ghost Mode")
// ============================================================================

export interface StoryLocationPin {
  id: string;
  storyId: string;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  mediaThumbnail: string;
  caption?: string;
  lat: number;
  lng: number;
  cityName: string;
  landmarkName?: string;
  postedAt: number;
}

export interface MapCluster {
  id: string;
  lat: number;
  lng: number;
  cityName: string;
  pins: StoryLocationPin[];
  count: number;
  representativePin: StoryLocationPin;
}

export type LocationSharingScope = 'ghost' | 'close_friends' | 'followers';

export interface PrivacyShieldSettings {
  ghostModeEnabled: boolean;
  sharingScope: LocationSharingScope;
  ghostUntil?: string | null; // null = indefinitely until toggled off
  lastUpdated: string;
}

export const DEFAULT_PRIVACY_SHIELD: PrivacyShieldSettings = {
  ghostModeEnabled: false,
  sharingScope: 'followers',
  ghostUntil: null,
  lastUpdated: new Date().toISOString(),
};

/**
 * Calculates Great-Circle distance between two coordinates in kilometers using Haversine formula.
 */
export function haversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Clusters story location pins based on zoom level and coordinate proximity.
 */
export function computeStoryClusters(pins: StoryLocationPin[], zoomLevel: number): MapCluster[] {
  if (pins.length === 0) return [];

  // Cell size decreases as zoom level increases (higher zoom = smaller geographic cells)
  const cellSize = 180 / Math.pow(2, zoomLevel);
  const clusterBuckets = new Map<string, StoryLocationPin[]>();

  for (const pin of pins) {
    const cellX = Math.floor(pin.lng / cellSize);
    const cellY = Math.floor(pin.lat / cellSize);
    const key = `${cellX}:${cellY}`;

    const bucket = clusterBuckets.get(key) ?? [];
    bucket.push(pin);
    clusterBuckets.set(key, bucket);
  }

  const clusters: MapCluster[] = [];
  let clusterIndex = 1;

  for (const bucket of clusterBuckets.values()) {
    if (bucket.length === 0) continue;

    // Sort newest first
    bucket.sort((a, b) => b.postedAt - a.postedAt);

    let sumLat = 0;
    let sumLng = 0;
    for (const p of bucket) {
      sumLat += p.lat;
      sumLng += p.lng;
    }

    const rep = bucket[0];
    clusters.push({
      id: `cluster-${clusterIndex++}-${rep.cityName.toLowerCase().replace(/\s+/g, '-')}`,
      lat: sumLat / bucket.length,
      lng: sumLng / bucket.length,
      cityName: rep.cityName,
      pins: [...bucket],
      count: bucket.length,
      representativePin: rep,
    });
  }

  return clusters;
}

/**
 * Filters visible pins according to user's Privacy Shield settings.
 */
export function filterPinsByPrivacy(
  pins: StoryLocationPin[],
  currentUserId: string,
  userPrivacySettings: Record<string, PrivacyShieldSettings>,
  isCloseFriendFn: (targetUserId: string) => boolean,
): StoryLocationPin[] {
  return pins.filter((pin) => {
    // Current user can always view their own pins
    if (pin.userId === currentUserId) return true;

    const privacy = userPrivacySettings[pin.userId] ?? DEFAULT_PRIVACY_SHIELD;

    // Ghost mode hides pins completely
    if (privacy.ghostModeEnabled || privacy.sharingScope === 'ghost') {
      return false;
    }

    // Close friends only check
    if (privacy.sharingScope === 'close_friends') {
      return isCloseFriendFn(pin.userId);
    }

    // Default followers scope
    return true;
  });
}

/**
 * Updates Privacy Shield settings with validation.
 */
export function updatePrivacyShield(
  current: PrivacyShieldSettings,
  update: Partial<PrivacyShieldSettings>,
): PrivacyShieldSettings {
  const ghostMode =
    update.ghostModeEnabled !== undefined ? update.ghostModeEnabled : current.ghostModeEnabled;

  const scope = update.sharingScope ?? current.sharingScope;

  return {
    ghostModeEnabled: ghostMode,
    sharingScope: ghostMode ? 'ghost' : scope === 'ghost' ? 'followers' : scope,
    ghostUntil: ghostMode ? (update.ghostUntil ?? current.ghostUntil) : null,
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Searches pins near a target coordinate within a given radius in kilometers.
 */
export function findPinsNearLocation(
  pins: StoryLocationPin[],
  targetLat: number,
  targetLng: number,
  radiusKm: number,
): StoryLocationPin[] {
  return pins.filter((p) => {
    const dist = haversineDistanceKm(targetLat, targetLng, p.lat, p.lng);
    return dist <= radiusKm;
  });
}
