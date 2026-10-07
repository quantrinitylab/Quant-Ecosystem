// ============================================================================
// Search - Search Analytics
// Query analytics with click-through tracking and zero-result detection
// ============================================================================

import type {
  SearchAnalyticsEntry,
  SearchFilter,
} from '../types';

/** Aggregated query metrics */
interface QueryMetrics {
  query: string;
  totalSearches: number;
  uniqueUsers: Set<string>;
  totalClicks: number;
  totalResults: number;
  zeroResultCount: number;
  averagePosition: number;
  conversions: number;
  lastSearchedAt: number;
  averageResponseTime: number;
}

/** Time-based volume data */
interface VolumeData {
  timestamp: number;
  count: number;
  uniqueUsers: number;
}

/**
 * SearchAnalytics - Query analytics and performance tracking
 *
 * Tracks search queries, click-through rates, zero-result queries,
 * average click position, and search volume. Provides insights
 * for optimizing search relevance and discovering content gaps.
 */
export class SearchAnalytics {
  private entries: Map<string, SearchAnalyticsEntry>;
  private queryMetrics: Map<string, QueryMetrics>;
  private clickLog: Array<{ entryId: string; documentId: string; position: number; timestamp: number }>;
  private hourlyVolume: Map<number, VolumeData>;
  private entryCounter: number = 0;

  constructor() {
    this.entries = new Map();
    this.queryMetrics = new Map();
    this.clickLog = [];
    this.hourlyVolume = new Map();
  }

  /**
   * Track a search query event
   */
  public trackQuery(
    query: string,
    resultsCount: number,
    responseTimeMs: number,
    options: {
      userId?: string;
      filters?: SearchFilter[];
      page?: number;
    } = {}
  ): SearchAnalyticsEntry {
    const entry: SearchAnalyticsEntry = {
      id: this.generateId('search'),
      query: query.toLowerCase().trim(),
      userId: options.userId,
      timestamp: Date.now(),
      resultsCount,
      clickedResults: [],
      clickPositions: [],
      responseTimeMs,
      filters: options.filters || [],
      page: options.page || 1,
      converted: false,
    };

    this.entries.set(entry.id, entry);
    this.updateQueryMetrics(entry);
    this.updateHourlyVolume(entry);

    return entry;
  }

  /**
   * Track a click on a search result
   */
  public trackClick(entryId: string, documentId: string, position: number): void {
    const entry = this.entries.get(entryId);
    if (!entry) {
      throw new Error(`Search entry not found: ${entryId}`);
    }

    entry.clickedResults.push(documentId);
    entry.clickPositions.push(position);

    this.clickLog.push({ entryId, documentId, position, timestamp: Date.now() });

    // Update query metrics
    const metrics = this.queryMetrics.get(entry.query);
    if (metrics) {
      metrics.totalClicks++;
      // Update running average position
      const totalClickPositions = metrics.averagePosition * (metrics.totalClicks - 1) + position;
      metrics.averagePosition = totalClickPositions / metrics.totalClicks;
    }
  }

  /**
   * Track a conversion from search
   */
  public trackConversion(entryId: string): void {
    const entry = this.entries.get(entryId);
    if (!entry) return;

    entry.converted = true;

    const metrics = this.queryMetrics.get(entry.query);
    if (metrics) {
      metrics.conversions++;
    }
  }

  /**
   * Get most popular queries
   */
  public getPopularQueries(options: { limit?: number; timeWindowMs?: number } = {}): Array<{
    query: string;
    searches: number;
    uniqueUsers: number;
    clickRate: number;
    conversionRate: number;
  }> {
    const limit = options.limit || 20;
    const timeWindow = options.timeWindowMs;
    const now = Date.now();

    let metrics = Array.from(this.queryMetrics.values());

    if (timeWindow) {
      metrics = metrics.filter(m => m.lastSearchedAt >= now - timeWindow);
    }

    return metrics
      .sort((a, b) => b.totalSearches - a.totalSearches)
      .slice(0, limit)
      .map(m => ({
        query: m.query,
        searches: m.totalSearches,
        uniqueUsers: m.uniqueUsers.size,
        clickRate: m.totalSearches > 0 ? m.totalClicks / m.totalSearches : 0,
        conversionRate: m.totalSearches > 0 ? m.conversions / m.totalSearches : 0,
      }));
  }

  /**
   * Get queries with zero results (content gaps)
   */
  public getZeroResults(options: { limit?: number; minOccurrences?: number } = {}): Array<{
    query: string;
    occurrences: number;
    uniqueUsers: number;
    lastOccurredAt: number;
  }> {
    const limit = options.limit || 50;
    const minOccurrences = options.minOccurrences || 1;

    const zeroResults: Array<{
      query: string;
      occurrences: number;
      uniqueUsers: number;
      lastOccurredAt: number;
    }> = [];

    for (const [, metrics] of this.queryMetrics) {
      if (metrics.zeroResultCount >= minOccurrences) {
        zeroResults.push({
          query: metrics.query,
          occurrences: metrics.zeroResultCount,
          uniqueUsers: metrics.uniqueUsers.size,
          lastOccurredAt: metrics.lastSearchedAt,
        });
      }
    }

    return zeroResults
      .sort((a, b) => b.occurrences - a.occurrences)
      .slice(0, limit);
  }

  /**
   * Get click-through rate metrics
   */
  public getClickthrough(options: { minSearches?: number; timeWindowMs?: number } = {}): Array<{
    query: string;
    searches: number;
    clicks: number;
    ctr: number;
    averagePosition: number;
  }> {
    const minSearches = options.minSearches || 5;
    const timeWindow = options.timeWindowMs;
    const now = Date.now();

    let metrics = Array.from(this.queryMetrics.values());

    if (timeWindow) {
      metrics = metrics.filter(m => m.lastSearchedAt >= now - timeWindow);
    }

    return metrics
      .filter(m => m.totalSearches >= minSearches)
      .map(m => ({
        query: m.query,
        searches: m.totalSearches,
        clicks: m.totalClicks,
        ctr: m.totalSearches > 0 ? m.totalClicks / m.totalSearches : 0,
        averagePosition: m.averagePosition,
      }))
      .sort((a, b) => b.ctr - a.ctr);
  }

  /**
   * Get average click position for search results
   */
  public getAveragePosition(query?: string): number {
    if (query) {
      const metrics = this.queryMetrics.get(query.toLowerCase().trim());
      return metrics ? metrics.averagePosition : 0;
    }

    // Global average position
    if (this.clickLog.length === 0) return 0;

    const totalPosition = this.clickLog.reduce((sum, c) => sum + c.position, 0);
    return totalPosition / this.clickLog.length;
  }

  /**
   * Get search volume over time
   */
  public getSearchVolume(options: {
    granularity?: 'hour' | 'day' | 'week';
    windowMs?: number;
  } = {}): Array<{ timestamp: number; searches: number; uniqueUsers: number }> {
    const granularity = options.granularity || 'hour';
    const windowMs = options.windowMs || 86400000; // 24 hours default
    const now = Date.now();
    const cutoff = now - windowMs;

    const granularityMs = granularity === 'hour' ? 3600000
      : granularity === 'day' ? 86400000
      : 604800000;

    const buckets: Map<number, { searches: number; users: Set<string> }> = new Map();

    for (const [, entry] of this.entries) {
      if (entry.timestamp < cutoff) continue;

      const bucketKey = Math.floor(entry.timestamp / granularityMs) * granularityMs;
      const bucket = buckets.get(bucketKey) || { searches: 0, users: new Set() };
      bucket.searches++;
      if (entry.userId) bucket.users.add(entry.userId);
      buckets.set(bucketKey, bucket);
    }

    return Array.from(buckets.entries())
      .map(([timestamp, data]) => ({
        timestamp,
        searches: data.searches,
        uniqueUsers: data.users.size,
      }))
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Get low-performing queries (low CTR, high volume)
   */
  public getLowPerformingQueries(minSearches: number = 10): Array<{
    query: string;
    searches: number;
    ctr: number;
    zeroResults: number;
    suggestion: string;
  }> {
    const results: Array<{
      query: string;
      searches: number;
      ctr: number;
      zeroResults: number;
      suggestion: string;
    }> = [];

    for (const [, metrics] of this.queryMetrics) {
      if (metrics.totalSearches < minSearches) continue;

      const ctr = metrics.totalSearches > 0 ? metrics.totalClicks / metrics.totalSearches : 0;

      if (ctr < 0.1 || metrics.zeroResultCount > metrics.totalSearches * 0.5) {
        let suggestion = '';
        if (metrics.zeroResultCount > metrics.totalSearches * 0.5) {
          suggestion = 'Content gap - consider adding content for this query';
        } else if (ctr < 0.05) {
          suggestion = 'Very low CTR - results may not be relevant, review ranking';
        } else {
          suggestion = 'Low CTR - consider improving result snippets or relevance';
        }

        results.push({
          query: metrics.query,
          searches: metrics.totalSearches,
          ctr,
          zeroResults: metrics.zeroResultCount,
          suggestion,
        });
      }
    }

    return results.sort((a, b) => b.searches - a.searches);
  }

  /**
   * Get overall search health metrics
   */
  public getHealthMetrics(): {
    totalSearches: number;
    uniqueQueries: number;
    overallCTR: number;
    zeroResultRate: number;
    averageResponseTime: number;
    conversionRate: number;
    searchesLast24h: number;
  } {
    const now = Date.now();
    const oneDayAgo = now - 86400000;

    let totalSearches = 0;
    let totalClicks = 0;
    let totalZeroResults = 0;
    let totalResponseTime = 0;
    let totalConversions = 0;
    let searchesLast24h = 0;

    for (const [, metrics] of this.queryMetrics) {
      totalSearches += metrics.totalSearches;
      totalClicks += metrics.totalClicks;
      totalZeroResults += metrics.zeroResultCount;
      totalConversions += metrics.conversions;
      totalResponseTime += metrics.averageResponseTime * metrics.totalSearches;

      if (metrics.lastSearchedAt >= oneDayAgo) {
        searchesLast24h += metrics.totalSearches;
      }
    }

    return {
      totalSearches,
      uniqueQueries: this.queryMetrics.size,
      overallCTR: totalSearches > 0 ? totalClicks / totalSearches : 0,
      zeroResultRate: totalSearches > 0 ? totalZeroResults / totalSearches : 0,
      averageResponseTime: totalSearches > 0 ? totalResponseTime / totalSearches : 0,
      conversionRate: totalSearches > 0 ? totalConversions / totalSearches : 0,
      searchesLast24h,
    };
  }

  /**
   * Clean up old entries
   */
  public cleanup(olderThanMs: number = 2592000000): number {
    const cutoff = Date.now() - olderThanMs;
    let removed = 0;

    for (const [id, entry] of this.entries) {
      if (entry.timestamp < cutoff) {
        this.entries.delete(id);
        removed++;
      }
    }

    this.clickLog = this.clickLog.filter(c => c.timestamp >= cutoff);
    return removed;
  }

  /**
   * Get entry count
   */
  public getEntryCount(): number {
    return this.entries.size;
  }

  // ---- Private Methods ----

  private updateQueryMetrics(entry: SearchAnalyticsEntry): void {
    const key = entry.query;
    const existing = this.queryMetrics.get(key);

    if (existing) {
      existing.totalSearches++;
      if (entry.userId) existing.uniqueUsers.add(entry.userId);
      existing.totalResults += entry.resultsCount;
      if (entry.resultsCount === 0) existing.zeroResultCount++;
      existing.lastSearchedAt = entry.timestamp;
      // Running average for response time
      existing.averageResponseTime =
        (existing.averageResponseTime * (existing.totalSearches - 1) + entry.responseTimeMs) / existing.totalSearches;
    } else {
      const users = new Set<string>();
      if (entry.userId) users.add(entry.userId);

      this.queryMetrics.set(key, {
        query: key,
        totalSearches: 1,
        uniqueUsers: users,
        totalClicks: 0,
        totalResults: entry.resultsCount,
        zeroResultCount: entry.resultsCount === 0 ? 1 : 0,
        averagePosition: 0,
        conversions: 0,
        lastSearchedAt: entry.timestamp,
        averageResponseTime: entry.responseTimeMs,
      });
    }
  }

  private updateHourlyVolume(entry: SearchAnalyticsEntry): void {
    const hourKey = Math.floor(entry.timestamp / 3600000) * 3600000;
    const existing = this.hourlyVolume.get(hourKey);

    if (existing) {
      existing.count++;
    } else {
      this.hourlyVolume.set(hourKey, {
        timestamp: hourKey,
        count: 1,
        uniqueUsers: 1,
      });
    }
  }

  private generateId(prefix: string): string {
    this.entryCounter++;
    const timestamp = Date.now().toString(36);
    const counter = this.entryCounter.toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `${prefix}_${timestamp}_${counter}_${random}`;
  }
}
