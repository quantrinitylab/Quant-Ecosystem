import type { MonitorConfig, NewsItem, NewsDigest } from '../types.js';

export class NewsMonitorAgent {
  private topics: string[] = [];
  private sources: string[] = [];
  private frequency = 3600000;
  private filters: Record<string, string> = {};
  private items: NewsItem[] = [];

  configure(
    topics: string[],
    sources: string[],
    frequency: number,
    filters: Record<string, string> = {},
  ): void {
    this.topics = topics;
    this.sources = sources;
    this.frequency = frequency;
    this.filters = filters;
  }

  getConfig(): MonitorConfig {
    return {
      topics: this.topics,
      sources: this.sources,
      frequency: this.frequency,
      filters: this.filters,
    };
  }

  check(): NewsItem[] {
    const now = Date.now();
    const newItems: NewsItem[] = this.topics.flatMap((topic) =>
      this.sources.map((source) => ({
        id: `${topic}-${source}-${now}`,
        title: `Latest on ${topic} from ${source}`,
        summary: `Breaking updates about ${topic}`,
        source,
        topic,
        timestamp: now,
        url: `https://${source}/news/${topic}`,
      })),
    );
    this.items.push(...newItems);
    return newItems;
  }

  getDigest(since: number): NewsDigest {
    const relevantItems = this.items.filter((item) => item.timestamp >= since);
    const groups: Record<string, NewsItem[]> = {};
    for (const item of relevantItems) {
      if (!groups[item.topic]) {
        groups[item.topic] = [];
      }
      groups[item.topic]!.push(item);
    }
    return {
      since,
      generatedAt: Date.now(),
      groups,
      totalItems: relevantItems.length,
    };
  }
}
