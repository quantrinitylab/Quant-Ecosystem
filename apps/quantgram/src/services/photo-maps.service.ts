// ============================================================================
// QuantNeon - Photo Maps Service
// Geolocation-based photo organization, clustering, and area search
// ============================================================================

export interface GeoPhoto {
  photoId: string;
  lat: number;
  lng: number;
  takenAt: number;
}

export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface PhotoCluster {
  center: { lat: number; lng: number };
  photos: GeoPhoto[];
  count: number;
}

export class PhotoMapsService {
  private photos: Map<string, GeoPhoto> = new Map();

  addLocation(photoId: string, lat: number, lng: number, takenAt: number): GeoPhoto {
    const photo: GeoPhoto = { photoId, lat, lng, takenAt };
    this.photos.set(photoId, photo);
    return { ...photo };
  }

  removeLocation(photoId: string): boolean {
    return this.photos.delete(photoId);
  }

  getPhotosInArea(bounds: MapBounds): GeoPhoto[] {
    const results: GeoPhoto[] = [];
    for (const photo of this.photos.values()) {
      if (
        photo.lat >= bounds.south &&
        photo.lat <= bounds.north &&
        photo.lng >= bounds.west &&
        photo.lng <= bounds.east
      ) {
        results.push({ ...photo });
      }
    }
    return results;
  }

  clusterPhotos(photos: GeoPhoto[], zoomLevel: number): PhotoCluster[] {
    if (photos.length === 0) {
      return [];
    }

    // Grid-based clustering: higher zoom = smaller cells = more clusters
    const cellSize = 180 / Math.pow(2, zoomLevel);
    const clusters: Map<string, GeoPhoto[]> = new Map();

    for (const photo of photos) {
      const cellX = Math.floor(photo.lng / cellSize);
      const cellY = Math.floor(photo.lat / cellSize);
      const key = `${cellX}:${cellY}`;

      const cell = clusters.get(key) ?? [];
      cell.push(photo);
      clusters.set(key, cell);
    }

    const result: PhotoCluster[] = [];
    for (const clusterPhotos of clusters.values()) {
      if (clusterPhotos.length === 0) continue;

      let totalLat = 0;
      let totalLng = 0;
      for (const p of clusterPhotos) {
        totalLat += p.lat;
        totalLng += p.lng;
      }

      result.push({
        center: {
          lat: totalLat / clusterPhotos.length,
          lng: totalLng / clusterPhotos.length,
        },
        photos: clusterPhotos.map((p) => ({ ...p })),
        count: clusterPhotos.length,
      });
    }

    return result;
  }

  getLocationHistory(): GeoPhoto[] {
    return Array.from(this.photos.values())
      .sort((a, b) => b.takenAt - a.takenAt)
      .map((p) => ({ ...p }));
  }

  getNearbyPhotos(lat: number, lng: number, radiusKm: number): GeoPhoto[] {
    const results: GeoPhoto[] = [];
    for (const photo of this.photos.values()) {
      const distance = this.haversineDistance(lat, lng, photo.lat, photo.lng);
      if (distance <= radiusKm) {
        results.push({ ...photo });
      }
    }
    return results;
  }

  private haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371; // Earth radius in km
    const dLat = this.toRad(lat2 - lat1);
    const dLng = this.toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(deg: number): number {
    return (deg * Math.PI) / 180;
  }
}
