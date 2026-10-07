// ============================================================================
// @quant/shared-ui - Advanced Map Engine with Tile Management
// ============================================================================

import {
  MapState,
  MapTile,
  Marker,
  MarkerCluster,
  GeoCoord,
  MapBounds,
  TileCache,
  MapConfig,
} from './types';

interface PixelCoord {
  x: number;
  y: number;
}

interface TileCoord {
  x: number;
  y: number;
  z: number;
}

interface RoutePolyline {
  id: string;
  coordinates: GeoCoord[];
  color: string;
  width: number;
}

interface HeatmapPoint {
  position: GeoCoord;
  intensity: number;
}

type MapListener = (state: MapState) => void;

export class MapEngine {
  private state: MapState;
  private config: MapConfig;
  private markers: Map<string, Marker> = new Map();
  private clusters: MarkerCluster[] = [];
  private routes: Map<string, RoutePolyline> = new Map();
  private heatmapData: HeatmapPoint[] = [];
  private tileCache: TileCache;
  private tileQueue: TileCoord[] = [];
  private loadingTiles: Set<string> = new Set();
  private maxConcurrentLoads: number = 6;
  private listeners: Set<MapListener> = new Set();
  private viewportWidth: number = 800;
  private viewportHeight: number = 600;
  private tileSize: number;

  constructor(config: MapConfig) {
    this.config = {
      minZoom: 1,
      maxZoom: 18,
      tileSize: 256,
      tileUrlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      clusterRadius: 60,
      ...config,
    };
    this.tileSize = this.config.tileSize || 256;
    this.state = {
      center: config.center,
      zoom: config.zoom,
      bearing: 0,
      pitch: 0,
      bounds: this.calculateBounds(config.center, config.zoom),
    };
    this.tileCache = {
      maxSize: 256,
      tiles: new Map(),
      accessOrder: [],
    };
  }

  // Convert lat/lng to tile coordinates at a given zoom level
  latLngToTile(coord: GeoCoord, zoom: number): TileCoord {
    const n = Math.pow(2, zoom);
    const latRad = (coord.lat * Math.PI) / 180;
    const x = Math.floor(((coord.lng + 180) / 360) * n);
    const y = Math.floor(
      ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
    );
    return { x: Math.max(0, Math.min(n - 1, x)), y: Math.max(0, Math.min(n - 1, y)), z: zoom };
  }

  // Convert lat/lng to pixel coordinates within the viewport
  latLngToPixel(coord: GeoCoord): PixelCoord {
    const zoom = this.state.zoom;
    const scale = Math.pow(2, zoom) * this.tileSize;

    // Mercator projection
    const worldX = ((coord.lng + 180) / 360) * scale;
    const latRad = (coord.lat * Math.PI) / 180;
    const worldY = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * scale;

    // Center world coordinates
    const centerWorldX = ((this.state.center.lng + 180) / 360) * scale;
    const centerLatRad = (this.state.center.lat * Math.PI) / 180;
    const centerWorldY =
      ((1 - Math.log(Math.tan(centerLatRad) + 1 / Math.cos(centerLatRad)) / Math.PI) / 2) * scale;

    return {
      x: worldX - centerWorldX + this.viewportWidth / 2,
      y: worldY - centerWorldY + this.viewportHeight / 2,
    };
  }

  // Convert pixel coordinates to lat/lng
  pixelToLatLng(pixel: PixelCoord): GeoCoord {
    const zoom = this.state.zoom;
    const scale = Math.pow(2, zoom) * this.tileSize;

    const centerWorldX = ((this.state.center.lng + 180) / 360) * scale;
    const centerLatRad = (this.state.center.lat * Math.PI) / 180;
    const centerWorldY =
      ((1 - Math.log(Math.tan(centerLatRad) + 1 / Math.cos(centerLatRad)) / Math.PI) / 2) * scale;

    const worldX = pixel.x - this.viewportWidth / 2 + centerWorldX;
    const worldY = pixel.y - this.viewportHeight / 2 + centerWorldY;

    const lng = (worldX / scale) * 360 - 180;
    const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * worldY) / scale)));
    const lat = (latRad * 180) / Math.PI;

    return { lat, lng };
  }

  // Calculate visible bounds
  calculateBounds(_center: GeoCoord, _zoom: number): MapBounds {
    const topLeft = this.pixelToLatLng({ x: 0, y: 0 });
    const bottomRight = this.pixelToLatLng({ x: this.viewportWidth, y: this.viewportHeight });

    return {
      north: topLeft.lat,
      south: bottomRight.lat,
      east: bottomRight.lng,
      west: topLeft.lng,
    };
  }

  // Get visible tiles for current viewport
  getVisibleTiles(): TileCoord[] {
    const zoom = Math.round(this.state.zoom);
    const n = Math.pow(2, zoom);

    // Get tile range
    const topLeftTile = this.latLngToTile(
      { lat: this.state.bounds.north, lng: this.state.bounds.west },
      zoom,
    );
    const bottomRightTile = this.latLngToTile(
      { lat: this.state.bounds.south, lng: this.state.bounds.east },
      zoom,
    );

    const tiles: TileCoord[] = [];
    for (let x = topLeftTile.x - 1; x <= bottomRightTile.x + 1; x++) {
      for (let y = topLeftTile.y - 1; y <= bottomRightTile.y + 1; y++) {
        const tileX = ((x % n) + n) % n; // Wrap around for longitude
        const tileY = Math.max(0, Math.min(n - 1, y));
        tiles.push({ x: tileX, y: tileY, z: zoom });
      }
    }

    return tiles;
  }

  // Load tiles - manages queue and concurrency
  loadTiles(): MapTile[] {
    const visibleTiles = this.getVisibleTiles();
    const result: MapTile[] = [];

    for (const coord of visibleTiles) {
      const key = `${coord.z}/${coord.x}/${coord.y}`;
      const cached = this.tileCache.tiles.get(key);

      if (cached) {
        // Update access order (LRU)
        this.updateCacheAccess(key);
        result.push(cached);
      } else {
        // Queue for loading
        const url = this.getTileUrl(coord);
        const tile: MapTile = { ...coord, url, loaded: false };
        result.push(tile);

        if (!this.loadingTiles.has(key) && this.loadingTiles.size < this.maxConcurrentLoads) {
          this.loadingTiles.add(key);
          this.tileQueue.push(coord);
        }
      }
    }

    return result;
  }

  // Mark tile as loaded (callback from loader)
  tileLoaded(coord: TileCoord, data?: any): void {
    const key = `${coord.z}/${coord.x}/${coord.y}`;
    const url = this.getTileUrl(coord);
    const tile: MapTile = { ...coord, url, loaded: true, data };

    // Add to cache
    this.addToCache(key, tile);
    this.loadingTiles.delete(key);

    // Process next in queue
    this.processQueue();
  }

  // Tile URL generation
  private getTileUrl(coord: TileCoord): string {
    return (this.config.tileUrlTemplate || '')
      .replace('{z}', String(coord.z))
      .replace('{x}', String(coord.x))
      .replace('{y}', String(coord.y));
  }

  // LRU cache management
  private addToCache(key: string, tile: MapTile): void {
    if (this.tileCache.tiles.size >= this.tileCache.maxSize) {
      // Evict least recently used
      const lruKey = this.tileCache.accessOrder.shift();
      if (lruKey) this.tileCache.tiles.delete(lruKey);
    }
    this.tileCache.tiles.set(key, tile);
    this.tileCache.accessOrder.push(key);
  }

  private updateCacheAccess(key: string): void {
    const idx = this.tileCache.accessOrder.indexOf(key);
    if (idx > -1) {
      this.tileCache.accessOrder.splice(idx, 1);
      this.tileCache.accessOrder.push(key);
    }
  }

  private processQueue(): void {
    while (this.tileQueue.length > 0 && this.loadingTiles.size < this.maxConcurrentLoads) {
      const coord = this.tileQueue.shift()!;
      const key = `${coord.z}/${coord.x}/${coord.y}`;
      this.loadingTiles.add(key);
    }
  }

  // Marker management
  addMarker(marker: Marker): void {
    this.markers.set(marker.id, marker);
    if (marker.clusterable !== false) {
      this.updateClusters();
    }
  }

  removeMarker(id: string): void {
    this.markers.delete(id);
    this.updateClusters();
  }

  updateMarkerPosition(id: string, position: GeoCoord): void {
    const marker = this.markers.get(id);
    if (marker) {
      marker.position = position;
      this.updateClusters();
    }
  }

  // Grid-based marker clustering
  updateClusters(): void {
    const clusterRadius = this.config.clusterRadius || 60;
    const gridSize = clusterRadius;

    const grid: Map<string, Marker[]> = new Map();

    // Place markers into grid cells
    this.markers.forEach((marker) => {
      if (marker.clusterable === false) return;
      const pixel = this.latLngToPixel(marker.position);
      const cellX = Math.floor(pixel.x / gridSize);
      const cellY = Math.floor(pixel.y / gridSize);
      const cellKey = `${cellX}:${cellY}`;

      if (!grid.has(cellKey)) grid.set(cellKey, []);
      grid.get(cellKey)!.push(marker);
    });

    // Create clusters from grid cells
    this.clusters = [];
    let clusterId = 0;

    grid.forEach((markers, _cellKey) => {
      if (markers.length === 1) return; // No cluster needed

      // Calculate cluster center (average position)
      const avgLat = markers.reduce((sum, m) => sum + m.position.lat, 0) / markers.length;
      const avgLng = markers.reduce((sum, m) => sum + m.position.lng, 0) / markers.length;

      // Calculate bounds
      const lats = markers.map((m) => m.position.lat);
      const lngs = markers.map((m) => m.position.lng);

      this.clusters.push({
        id: `cluster_${clusterId++}`,
        center: { lat: avgLat, lng: avgLng },
        markers,
        count: markers.length,
        bounds: {
          north: Math.max(...lats),
          south: Math.min(...lats),
          east: Math.max(...lngs),
          west: Math.min(...lngs),
        },
      });
    });
  }

  // Get visible markers (unclustered or individual)
  getVisibleMarkers(): Array<Marker | MarkerCluster> {
    const result: Array<Marker | MarkerCluster> = [];
    const clusteredIds = new Set<string>();

    for (const cluster of this.clusters) {
      if (this.isInBounds(cluster.center)) {
        result.push(cluster);
        cluster.markers.forEach((m) => clusteredIds.add(m.id));
      }
    }

    this.markers.forEach((marker) => {
      if (!clusteredIds.has(marker.id) && this.isInBounds(marker.position)) {
        result.push(marker);
      }
    });

    return result;
  }

  // Check if coordinate is in current bounds
  private isInBounds(coord: GeoCoord): boolean {
    const { north, south, east, west } = this.state.bounds;
    return coord.lat <= north && coord.lat >= south && coord.lng <= east && coord.lng >= west;
  }

  // Route rendering - generate polyline points
  addRoute(
    id: string,
    coordinates: GeoCoord[],
    color: string = '#3b82f6',
    width: number = 3,
  ): void {
    this.routes.set(id, { id, coordinates, color, width });
  }

  removeRoute(id: string): void {
    this.routes.delete(id);
  }

  getRoutePixels(id: string): Array<PixelCoord> {
    const route = this.routes.get(id);
    if (!route) return [];
    return route.coordinates.map((coord) => this.latLngToPixel(coord));
  }

  generateRouteSVGPath(id: string): string {
    const pixels = this.getRoutePixels(id);
    if (pixels.length < 2) return '';
    const first = pixels[0]!;
    let path = `M ${first.x} ${first.y}`;
    for (let i = 1; i < pixels.length; i++) {
      const pt = pixels[i]!;
      path += ` L ${pt.x} ${pt.y}`;
    }
    return path;
  }

  // Heatmap - density to color mapping
  setHeatmapData(points: HeatmapPoint[]): void {
    this.heatmapData = points;
  }

  generateHeatmap(
    resolution: number = 10,
  ): Array<{ x: number; y: number; intensity: number; color: string }> {
    const grid: Map<string, number> = new Map();
    const maxIntensity = Math.max(...this.heatmapData.map((p) => p.intensity), 1);

    for (const point of this.heatmapData) {
      if (!this.isInBounds(point.position)) continue;
      const pixel = this.latLngToPixel(point.position);
      const cellX = Math.floor(pixel.x / resolution);
      const cellY = Math.floor(pixel.y / resolution);
      const key = `${cellX}:${cellY}`;
      grid.set(key, (grid.get(key) || 0) + point.intensity);
    }

    const result: Array<{ x: number; y: number; intensity: number; color: string }> = [];
    grid.forEach((intensity, key) => {
      const parts = key.split(':').map(Number);
      const cx = parts[0] ?? 0;
      const cy = parts[1] ?? 0;
      const normalized = Math.min(1, intensity / maxIntensity);
      result.push({
        x: cx * resolution,
        y: cy * resolution,
        intensity: normalized,
        color: this.intensityToColor(normalized),
      });
    });

    return result;
  }

  private intensityToColor(intensity: number): string {
    // Blue -> Green -> Yellow -> Red gradient
    if (intensity < 0.25) {
      const t = intensity / 0.25;
      return `rgba(0, ${Math.round(t * 255)}, 255, ${0.3 + intensity * 2})`;
    } else if (intensity < 0.5) {
      const t = (intensity - 0.25) / 0.25;
      return `rgba(0, 255, ${Math.round((1 - t) * 255)}, ${0.3 + intensity * 2})`;
    } else if (intensity < 0.75) {
      const t = (intensity - 0.5) / 0.25;
      return `rgba(${Math.round(t * 255)}, 255, 0, ${0.3 + intensity})`;
    } else {
      const t = (intensity - 0.75) / 0.25;
      return `rgba(255, ${Math.round((1 - t) * 255)}, 0, ${0.5 + intensity * 0.5})`;
    }
  }

  // Viewport management
  setCenter(center: GeoCoord): void {
    this.state.center = center;
    this.state.bounds = this.calculateBounds(center, this.state.zoom);
    this.updateClusters();
    this.notifyListeners();
  }

  setZoom(zoom: number): void {
    const clampedZoom = Math.max(
      this.config.minZoom || 1,
      Math.min(this.config.maxZoom || 18, zoom),
    );
    this.state.zoom = clampedZoom;
    this.state.bounds = this.calculateBounds(this.state.center, clampedZoom);
    this.updateClusters();
    this.notifyListeners();
  }

  // Pan (drag) - move center by pixel delta
  pan(deltaX: number, deltaY: number): void {
    const newCenter = this.pixelToLatLng({
      x: this.viewportWidth / 2 - deltaX,
      y: this.viewportHeight / 2 - deltaY,
    });
    this.setCenter(newCenter);
  }

  // Zoom in/out
  zoomIn(): void {
    this.setZoom(this.state.zoom + 1);
  }
  zoomOut(): void {
    this.setZoom(this.state.zoom - 1);
  }

  // Pinch zoom (relative to focal point)
  pinchZoom(focalPoint: PixelCoord, scaleDelta: number): void {
    const focalLatLng = this.pixelToLatLng(focalPoint);
    const newZoom = this.state.zoom + scaleDelta;
    this.setZoom(newZoom);
    // Adjust center to keep focal point in place
    const newFocalPixel = this.latLngToPixel(focalLatLng);
    const dx = focalPoint.x - newFocalPixel.x;
    const dy = focalPoint.y - newFocalPixel.y;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
      this.pan(-dx, -dy);
    }
  }

  // Fit bounds (zoom to show all markers)
  fitBounds(bounds: MapBounds, padding: number = 50): void {
    const latRange = bounds.north - bounds.south;
    const lngRange = bounds.east - bounds.west;

    const latZoom = Math.log2(
      (180 * (this.viewportHeight - 2 * padding)) / (latRange * this.tileSize),
    );
    const lngZoom = Math.log2(
      (360 * (this.viewportWidth - 2 * padding)) / (lngRange * this.tileSize),
    );

    const zoom = Math.min(latZoom, lngZoom, this.config.maxZoom || 18);
    const center: GeoCoord = {
      lat: (bounds.north + bounds.south) / 2,
      lng: (bounds.east + bounds.west) / 2,
    };

    this.state.center = center;
    this.setZoom(Math.floor(zoom));
  }

  // Set viewport dimensions
  setViewport(width: number, height: number): void {
    this.viewportWidth = width;
    this.viewportHeight = height;
    this.state.bounds = this.calculateBounds(this.state.center, this.state.zoom);
    this.notifyListeners();
  }

  // Get state
  getState(): MapState {
    return { ...this.state };
  }
  getMarkers(): Marker[] {
    return Array.from(this.markers.values());
  }
  getClusters(): MarkerCluster[] {
    return [...this.clusters];
  }
  getCacheStats(): { size: number; maxSize: number } {
    return { size: this.tileCache.tiles.size, maxSize: this.tileCache.maxSize };
  }

  // Subscribe to state changes
  subscribe(listener: MapListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    this.listeners.forEach((listener) => listener(this.state));
  }

  destroy(): void {
    this.listeners.clear();
    this.markers.clear();
    this.routes.clear();
    this.tileCache.tiles.clear();
    this.tileQueue = [];
    this.loadingTiles.clear();
  }
}

export default MapEngine;
