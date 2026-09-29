// Quantads - Location Service
// Mobile location services for advertising platform

export interface Coordinates {
  latitude: number;
  longitude: number;
  altitude?: number;
  accuracy: number;
  altitudeAccuracy?: number;
  heading?: number;
  speed?: number;
}

export interface LocationResult {
  coords: Coordinates;
  timestamp: number;
  provider: 'gps' | 'network' | 'fused';
}

export type AccuracyLevel = 'high' | 'balanced' | 'low_power' | 'passive';

export interface TrackingConfig {
  accuracy: AccuracyLevel;
  distanceFilter: number;
  intervalMs: number;
  fastestIntervalMs: number;
  maxWaitMs: number;
}

export interface GeofenceRegion {
  id: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  triggers: GeofenceTrigger[];
  dwellTimeMs?: number;
  expiresAt?: number;
  metadata: Record<string, string>;
}

export type GeofenceTrigger = 'enter' | 'exit' | 'dwell';

export interface GeofenceEvent {
  regionId: string;
  trigger: GeofenceTrigger;
  location: LocationResult;
  timestamp: number;
}

export interface GeocodingResult {
  formattedAddress: string;
  street: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
  coordinates: Coordinates;
}

export interface LocationHistoryEntry {
  location: LocationResult;
  duration: number;
  activity?: 'still' | 'walking' | 'running' | 'driving' | 'cycling';
}

export type LocationPermission = 'always' | 'when_in_use' | 'denied' | 'not_determined';

export interface BackgroundLocationConfig {
  enabled: boolean;
  accuracy: AccuracyLevel;
  distanceFilter: number;
  showNotification: boolean;
  notificationTitle: string;
  notificationBody: string;
}

export class LocationService {
  private isTracking: boolean = false;
  private trackingConfig: TrackingConfig = {
    accuracy: 'balanced',
    distanceFilter: 50,
    intervalMs: 10000,
    fastestIntervalMs: 5000,
    maxWaitMs: 15000,
  };
  private geofences: Map<string, GeofenceRegion> = new Map();
  private locationHistory: LocationHistoryEntry[] = [];
  private permission: LocationPermission = 'not_determined';
  private geofenceCallbacks: Map<string, (event: GeofenceEvent) => void> = new Map();
  private trackingCallbacks: Array<(location: LocationResult) => void> = [];
  private backgroundConfig: BackgroundLocationConfig = {
    enabled: false,
    accuracy: 'balanced',
    distanceFilter: 100,
    showNotification: true,
    notificationTitle: 'Quantads Location',
    notificationBody: 'Using location for location targeting',
  };

  public async requestPermission(level: 'always' | 'when_in_use'): Promise<LocationPermission> {
    this.permission = level;
    return this.permission;
  }

  public getPermissionStatus(): LocationPermission {
    return this.permission;
  }

  public async getCurrentLocation(accuracy?: AccuracyLevel): Promise<LocationResult> {
    if (this.permission === 'denied' || this.permission === 'not_determined') {
      throw new Error('Location permission not granted');
    }
    const location: LocationResult = {
      coords: {
        latitude: 37.7749,
        longitude: -122.4194,
        accuracy: accuracy === 'high' ? 5 : 50,
        altitude: 10,
        speed: 0,
        heading: 0,
      },
      timestamp: Date.now(),
      provider: accuracy === 'high' ? 'gps' : 'fused',
    };
    return location;
  }

  public startTracking(config?: Partial<TrackingConfig>): void {
    if (config) this.trackingConfig = { ...this.trackingConfig, ...config };
    this.isTracking = true;
  }

  public stopTracking(): void {
    this.isTracking = false;
  }

  public onLocationUpdate(callback: (location: LocationResult) => void): () => void {
    this.trackingCallbacks.push(callback);
    return () => {
      const index = this.trackingCallbacks.indexOf(callback);
      if (index > -1) this.trackingCallbacks.splice(index, 1);
    };
  }

  public addGeofence(region: GeofenceRegion): void {
    this.geofences.set(region.id, region);
  }

  public removeGeofence(regionId: string): boolean {
    return this.geofences.delete(regionId);
  }

  public onGeofenceEvent(regionId: string, callback: (event: GeofenceEvent) => void): void {
    this.geofenceCallbacks.set(regionId, callback);
  }

  public getActiveGeofences(): GeofenceRegion[] {
    return Array.from(this.geofences.values()).filter(
      (g) => !g.expiresAt || g.expiresAt > Date.now(),
    );
  }

  public async reverseGeocode(latitude: number, longitude: number): Promise<GeocodingResult> {
    return {
      formattedAddress: '123 Main St, San Francisco, CA 94102, USA',
      street: '123 Main St',
      city: 'San Francisco',
      state: 'California',
      country: 'United States',
      postalCode: '94102',
      coordinates: { latitude, longitude, accuracy: 5 },
    };
  }

  public getLocationHistory(limit?: number): LocationHistoryEntry[] {
    const entries = [...this.locationHistory];
    return limit ? entries.slice(-limit) : entries;
  }

  public addToHistory(entry: LocationHistoryEntry): void {
    this.locationHistory.push(entry);
    if (this.locationHistory.length > 1000) {
      this.locationHistory = this.locationHistory.slice(-500);
    }
  }

  public calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000;
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  public configureBackgroundLocation(config: Partial<BackgroundLocationConfig>): void {
    this.backgroundConfig = { ...this.backgroundConfig, ...config };
  }

  public isBackgroundLocationEnabled(): boolean {
    return this.backgroundConfig.enabled && this.permission === 'always';
  }

  public getTrackingStatus(): { isTracking: boolean; config: TrackingConfig } {
    return { isTracking: this.isTracking, config: { ...this.trackingConfig } };
  }

  public clearHistory(): void {
    this.locationHistory = [];
  }
}
