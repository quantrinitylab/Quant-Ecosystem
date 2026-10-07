// ============================================================================
// QuantMax - Sound Library Service
// Manages audio clips, music, effects for video creation
// ============================================================================

export type SoundCategory = 'music' | 'effects' | 'voiceovers' | 'ambient' | 'trending';

export interface Sound {
  id: string;
  name: string;
  artist: string;
  duration: number;
  category: SoundCategory;
  usageCount: number;
  previewUrl: string;
  isFavorite: boolean;
}

export class SoundLibraryService {
  private sounds: Map<string, Sound> = new Map();
  private favorites: Set<string> = new Set();
  private idCounter = 0;

  private generateId(): string {
    this.idCounter += 1;
    return `sound-${this.idCounter}`;
  }

  addSound(
    name: string,
    artist: string,
    duration: number,
    category: SoundCategory,
    previewUrl: string,
  ): Sound {
    const sound: Sound = {
      id: this.generateId(),
      name,
      artist,
      duration,
      category,
      usageCount: 0,
      previewUrl,
      isFavorite: false,
    };
    this.sounds.set(sound.id, sound);
    return sound;
  }

  search(query: string): Sound[] {
    const lower = query.toLowerCase();
    const results: Sound[] = [];
    for (const sound of this.sounds.values()) {
      if (sound.name.toLowerCase().includes(lower) || sound.artist.toLowerCase().includes(lower)) {
        results.push(sound);
      }
    }
    return results;
  }

  getTrending(limit: number): Sound[] {
    const all = [...this.sounds.values()];
    all.sort((a, b) => b.usageCount - a.usageCount);
    return all.slice(0, limit);
  }

  getByCategory(category: SoundCategory, limit: number): Sound[] {
    const results: Sound[] = [];
    for (const sound of this.sounds.values()) {
      if (sound.category === category) {
        results.push(sound);
        if (results.length >= limit) break;
      }
    }
    return results;
  }

  addToFavorites(soundId: string): boolean {
    const sound = this.sounds.get(soundId);
    if (!sound) return false;
    this.favorites.add(soundId);
    sound.isFavorite = true;
    return true;
  }

  removeFromFavorites(soundId: string): boolean {
    const sound = this.sounds.get(soundId);
    if (!sound) return false;
    this.favorites.delete(soundId);
    sound.isFavorite = false;
    return true;
  }

  getFavorites(): Sound[] {
    const results: Sound[] = [];
    for (const id of this.favorites) {
      const sound = this.sounds.get(id);
      if (sound) results.push(sound);
    }
    return results;
  }

  getUsageCount(soundId: string): number {
    const sound = this.sounds.get(soundId);
    return sound ? sound.usageCount : 0;
  }

  incrementUsage(soundId: string): void {
    const sound = this.sounds.get(soundId);
    if (sound) {
      sound.usageCount += 1;
    }
  }
}
