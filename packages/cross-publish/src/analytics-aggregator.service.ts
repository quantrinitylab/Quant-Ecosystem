import type { Surface, AnalyticsMetrics, SurfaceAnalytics, AggregatedAnalytics } from './types.js';

export class AnalyticsAggregatorService {
  private readonly metricsStore = new Map<string, SurfaceAnalytics[]>();
  private readonly intentToUser = new Map<string, string>();

  recordMetrics(
    intentId: string,
    surface: Surface,
    metrics: AnalyticsMetrics,
    userId?: string,
  ): void {
    const existing = this.metricsStore.get(intentId) ?? [];
    const idx = existing.findIndex((s) => s.surface === surface);
    const entry: SurfaceAnalytics = {
      surface,
      metrics,
      lastUpdated: new Date(),
    };

    if (idx >= 0) {
      existing[idx] = entry;
    } else {
      existing.push(entry);
    }
    this.metricsStore.set(intentId, existing);

    if (userId) {
      this.intentToUser.set(intentId, userId);
    }
  }

  getAggregated(intentId: string): AggregatedAnalytics | undefined {
    const perSurface = this.metricsStore.get(intentId);
    if (!perSurface || perSurface.length === 0) return undefined;

    const totalMetrics: AnalyticsMetrics = {
      views: 0,
      likes: 0,
      shares: 0,
      comments: 0,
      watchTime: 0,
    };

    const surfaces: Surface[] = [];
    for (const sa of perSurface) {
      surfaces.push(sa.surface);
      totalMetrics.views += sa.metrics.views;
      totalMetrics.likes += sa.metrics.likes;
      totalMetrics.shares += sa.metrics.shares;
      totalMetrics.comments += sa.metrics.comments;
      totalMetrics.watchTime += sa.metrics.watchTime;
    }

    return {
      intentId,
      surfaces,
      totalMetrics,
      perSurface,
    };
  }

  getByUser(userId: string): AggregatedAnalytics[] {
    const results: AggregatedAnalytics[] = [];
    for (const [intentId, storedUserId] of this.intentToUser.entries()) {
      if (storedUserId !== userId) continue;
      const aggregated = this.getAggregated(intentId);
      if (aggregated) {
        results.push(aggregated);
      }
    }
    return results;
  }
}
