// ============================================================================
// QuantMax - Trending Hashtags Service
// Tracks hashtag popularity, velocity, and suggestions
// ============================================================================

export interface HashtagStats {
  tag: string;
  volume: number;
  velocity: number;
  peakTime: number;
  relatedTags: string[];
}

export interface TrendingHashtag {
  tag: string;
  rank: number;
  volume: number;
  growth: number;
  isNew: boolean;
}

export class TrendingHashtagsService {
  private stats: Map<string, HashtagStats> = new Map();
  private usageHistory: Map<string, number[]> = new Map();

  trackUsage(tag: string): void {
    const normalized = tag.toLowerCase().replace(/^#/, '');
    const existing = this.stats.get(normalized);
    if (existing) {
      existing.volume += 1;
    } else {
      this.stats.set(normalized, {
        tag: normalized,
        volume: 1,
        velocity: 0,
        peakTime: Date.now(),
        relatedTags: [],
      });
    }
    const history = this.usageHistory.get(normalized) ?? [];
    history.push(Date.now());
    this.usageHistory.set(normalized, history);
  }

  getTrending(limit: number): TrendingHashtag[] {
    const all = [...this.stats.values()];
    all.sort((a, b) => b.volume - a.volume);
    return all.slice(0, limit).map((s, index) => ({
      tag: s.tag,
      rank: index + 1,
      volume: s.volume,
      growth: s.velocity,
      isNew: s.volume <= 5,
    }));
  }

  getStats(tag: string): HashtagStats | null {
    const normalized = tag.toLowerCase().replace(/^#/, '');
    return this.stats.get(normalized) ?? null;
  }

  suggestHashtags(content: string, limit: number): string[] {
    const words = content.toLowerCase().split(/\s+/);
    const suggestions: string[] = [];
    for (const [tag] of this.stats) {
      for (const word of words) {
        if (tag.includes(word) || word.includes(tag)) {
          suggestions.push(tag);
          break;
        }
      }
      if (suggestions.length >= limit) break;
    }
    return suggestions;
  }

  getRelated(tag: string, limit: number): string[] {
    const normalized = tag.toLowerCase().replace(/^#/, '');
    const stat = this.stats.get(normalized);
    if (!stat) return [];
    return stat.relatedTags.slice(0, limit);
  }

  addRelated(tag: string, relatedTag: string): void {
    const normalized = tag.toLowerCase().replace(/^#/, '');
    const stat = this.stats.get(normalized);
    if (stat && !stat.relatedTags.includes(relatedTag)) {
      stat.relatedTags.push(relatedTag);
    }
  }

  getVelocity(tag: string): number {
    const normalized = tag.toLowerCase().replace(/^#/, '');
    const history = this.usageHistory.get(normalized);
    if (!history || history.length < 2) return 0;
    const recent = history.slice(-10);
    if (recent.length < 2) return 0;
    const first = recent[0]!;
    const last = recent[recent.length - 1]!;
    const timeDiff = last - first;
    if (timeDiff === 0) return 0;
    return (recent.length / timeDiff) * 1000; // usages per second
  }

  isCurrentlyTrending(tag: string): boolean {
    const normalized = tag.toLowerCase().replace(/^#/, '');
    const stat = this.stats.get(normalized);
    if (!stat) return false;
    return stat.volume >= 10;
  }
}
