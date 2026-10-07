// ============================================================================
// Search Facet Aggregator - Post-query facet computation
// ============================================================================

import { z } from 'zod';
import type { FacetResult, FacetBucket } from '../types';

export const FacetableResultSchema = z.object({
  id: z.string(),
  type: z.string(),
  date: z.string().optional(),
  sender: z.string().optional(),
  score: z.number(),
});

export type FacetableResult = z.infer<typeof FacetableResultSchema>;

export const FacetScopeSchema = z.enum([
  'all',
  'emails',
  'messages',
  'files',
  'videos',
  'posts',
  'users',
]);
export type FacetScope = z.infer<typeof FacetScopeSchema>;

/**
 * SearchFacetAggregator - Builds facets from search results
 *
 * Computes type counts, date histograms, and sender distributions
 * from a set of search results.
 */
export class SearchFacetAggregator {
  buildFacets(results: FacetableResult[], scope: FacetScope = 'all'): FacetResult[] {
    const validatedResults = z.array(FacetableResultSchema).parse(results);

    const filtered =
      scope === 'all' ? validatedResults : validatedResults.filter((r) => r.type === scope);

    const facets: FacetResult[] = [];

    facets.push(this.buildTypeFacet(filtered));
    facets.push(this.buildDateFacet(filtered));
    facets.push(this.buildSenderFacet(filtered));

    return facets;
  }

  private buildTypeFacet(results: FacetableResult[]): FacetResult {
    const counts = new Map<string, number>();

    for (const result of results) {
      const current = counts.get(result.type) ?? 0;
      counts.set(result.type, current + 1);
    }

    const buckets: FacetBucket[] = Array.from(counts.entries())
      .map(([key, count]) => ({ key, count, label: key }))
      .sort((a, b) => b.count - a.count);

    return {
      name: 'type',
      field: 'type',
      type: 'terms',
      buckets,
      total: results.length,
    };
  }

  private buildDateFacet(results: FacetableResult[]): FacetResult {
    const counts = new Map<string, number>();

    for (const result of results) {
      if (result.date) {
        const dateKey = result.date.substring(0, 10); // YYYY-MM-DD
        const current = counts.get(dateKey) ?? 0;
        counts.set(dateKey, current + 1);
      }
    }

    const buckets: FacetBucket[] = Array.from(counts.entries())
      .map(([key, count]) => ({ key, count, label: key }))
      .sort((a, b) => b.key.localeCompare(a.key));

    return {
      name: 'date',
      field: 'date',
      type: 'date_histogram',
      buckets,
      total: buckets.reduce((sum, b) => sum + b.count, 0),
    };
  }

  private buildSenderFacet(results: FacetableResult[]): FacetResult {
    const counts = new Map<string, number>();

    for (const result of results) {
      if (result.sender) {
        const current = counts.get(result.sender) ?? 0;
        counts.set(result.sender, current + 1);
      }
    }

    const buckets: FacetBucket[] = Array.from(counts.entries())
      .map(([key, count]) => ({ key, count, label: key }))
      .sort((a, b) => b.count - a.count);

    return {
      name: 'sender',
      field: 'sender',
      type: 'terms',
      buckets,
      total: buckets.reduce((sum, b) => sum + b.count, 0),
    };
  }
}
