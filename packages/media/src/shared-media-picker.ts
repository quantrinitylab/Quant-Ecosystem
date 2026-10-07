// ============================================================================
// Shared Media Picker Service - Cross-App Media Access
// ============================================================================

import type { MediaType } from './types';

export interface MediaItem {
  id: string;
  type: MediaType;
  url: string;
  name: string;
  size: number;
  mimeType: string;
  thumbnailUrl?: string;
  sourceApp: string;
  createdAt: number;
}

export interface PickerOptions {
  types?: MediaType[];
  maxSize?: number;
  maxItems?: number;
  sourceApps?: string[];
}

export interface StorageInfo {
  used: number;
  limit: number;
}

export class SharedMediaPickerService {
  private media: Map<string, MediaItem> = new Map();
  private counter = 0;
  private storageLimit = 10 * 1024 * 1024 * 1024; // 10 GB default

  pick(options: PickerOptions): MediaItem[] {
    let results = Array.from(this.media.values());

    if (options.types && options.types.length > 0) {
      const types = options.types;
      results = results.filter((m) => types.includes(m.type));
    }

    if (options.maxSize) {
      const maxSize = options.maxSize;
      results = results.filter((m) => m.size <= maxSize);
    }

    if (options.sourceApps && options.sourceApps.length > 0) {
      const apps = options.sourceApps;
      results = results.filter((m) => apps.includes(m.sourceApp));
    }

    results.sort((a, b) => b.createdAt - a.createdAt);

    if (options.maxItems) {
      results = results.slice(0, options.maxItems);
    }

    return results;
  }

  getRecent(limit: number): MediaItem[] {
    return Array.from(this.media.values())
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }

  getFromApp(appName: string, limit: number): MediaItem[] {
    return Array.from(this.media.values())
      .filter((m) => m.sourceApp === appName)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }

  addMedia(item: Omit<MediaItem, 'id' | 'createdAt'>): MediaItem {
    const id = `media_${Date.now()}_${++this.counter}`;
    const full: MediaItem = {
      ...item,
      id,
      createdAt: Date.now(),
    };
    this.media.set(id, full);
    return full;
  }

  removeMedia(mediaId: string): boolean {
    return this.media.delete(mediaId);
  }

  search(query: string, options?: PickerOptions): MediaItem[] {
    const lower = query.toLowerCase();
    let results = Array.from(this.media.values()).filter(
      (m) => m.name.toLowerCase().includes(lower) || m.mimeType.toLowerCase().includes(lower),
    );

    if (options?.types && options.types.length > 0) {
      const types = options.types;
      results = results.filter((m) => types.includes(m.type));
    }

    if (options?.maxSize) {
      const maxSize = options.maxSize;
      results = results.filter((m) => m.size <= maxSize);
    }

    if (options?.sourceApps && options.sourceApps.length > 0) {
      const apps = options.sourceApps;
      results = results.filter((m) => apps.includes(m.sourceApp));
    }

    if (options?.maxItems) {
      results = results.slice(0, options.maxItems);
    }

    return results;
  }

  getTotalStorage(): StorageInfo {
    let used = 0;
    for (const [, item] of this.media) {
      used += item.size;
    }
    return { used, limit: this.storageLimit };
  }

  getByType(type: MediaType, limit: number): MediaItem[] {
    return Array.from(this.media.values())
      .filter((m) => m.type === type)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }
}
