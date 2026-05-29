import { AppListing, SearchFilters, SortOptions } from '../types.js';

export class AppSearchEngine {
  private index_store: Map<string, AppListing> = new Map();

  index(listing: AppListing): void {
    this.index_store.set(listing.id, listing);
  }

  remove(appId: string): boolean {
    return this.index_store.delete(appId);
  }

  search(query: string, filters?: SearchFilters, sort?: SortOptions, limit?: number): AppListing[] {
    const lowerQuery = query.toLowerCase();

    let results = Array.from(this.index_store.values()).filter((listing) => {
      const matchesQuery =
        listing.name.toLowerCase().includes(lowerQuery) ||
        listing.description.toLowerCase().includes(lowerQuery) ||
        listing.category.toLowerCase().includes(lowerQuery);

      if (!matchesQuery) return false;

      if (filters) {
        if (filters.category && listing.category !== filters.category) return false;
        if (filters.minRating !== undefined && listing.rating < filters.minRating) return false;
        if (filters.maxPrice !== undefined && listing.price > filters.maxPrice) return false;
        if (filters.status && listing.status !== filters.status) return false;
        if (filters.creatorId && listing.creatorId !== filters.creatorId) return false;
      }

      return true;
    });

    if (sort) {
      results.sort((a, b) => {
        const aVal = a[sort.field as keyof AppListing] as number | string;
        const bVal = b[sort.field as keyof AppListing] as number | string;
        const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        return sort.direction === 'asc' ? cmp : -cmp;
      });
    }

    if (limit) {
      results = results.slice(0, limit);
    }

    return results;
  }

  suggest(partialQuery: string): string[] {
    const lower = partialQuery.toLowerCase();
    const suggestions = new Set<string>();

    for (const listing of this.index_store.values()) {
      if (listing.name.toLowerCase().includes(lower)) {
        suggestions.add(listing.name);
      }
      if (listing.category.toLowerCase().includes(lower)) {
        suggestions.add(listing.category);
      }
    }

    return Array.from(suggestions).slice(0, 10);
  }
}
