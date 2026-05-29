export interface AggregatedItem {
  id: string;
  appId: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  timestamp: number;
  actionable: boolean;
}

export interface AggregatorSource {
  appId: string;
  name: string;
  fetch(userId: string): Promise<AggregatedItem[]>;
}

export class AppAggregator {
  private sources: AggregatorSource[] = [];

  registerSource(source: AggregatorSource): void {
    const existing = this.sources.findIndex((s) => s.appId === source.appId);
    if (existing >= 0) {
      this.sources[existing] = source;
    } else {
      this.sources.push(source);
    }
  }

  removeSource(appId: string): boolean {
    const index = this.sources.findIndex((s) => s.appId === appId);
    if (index >= 0) {
      this.sources.splice(index, 1);
      return true;
    }
    return false;
  }

  async fetchAll(userId: string): Promise<AggregatedItem[]> {
    const results: AggregatedItem[][] = [];
    for (const source of this.sources) {
      const items = await source.fetch(userId);
      results.push(items);
    }
    return this.merge(results);
  }

  merge(items: AggregatedItem[][]): AggregatedItem[] {
    const flat = items.flat();
    const priorityOrder: Record<string, number> = {
      critical: 4,
      high: 3,
      medium: 2,
      low: 1,
    };
    return flat.sort((a, b) => {
      const pDiff = (priorityOrder[b.priority] ?? 0) - (priorityOrder[a.priority] ?? 0);
      if (pDiff !== 0) return pDiff;
      return b.timestamp - a.timestamp;
    });
  }

  getRegisteredApps(): string[] {
    return this.sources.map((s) => s.appId);
  }
}
