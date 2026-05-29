import { AppListing, SearchFilters, Pagination, SortOptions } from '../types.js';
import { AppSearchEngine } from './search-engine.js';

export class CatalogService {
  private listings: Map<string, AppListing> = new Map();
  private searchEngine: AppSearchEngine;

  constructor() {
    this.searchEngine = new AppSearchEngine();
  }

  publish(listing: AppListing): AppListing {
    const published: AppListing = { ...listing, status: 'published' };
    this.listings.set(published.id, published);
    this.searchEngine.index(published);
    return published;
  }

  unpublish(appId: string): boolean {
    const listing = this.listings.get(appId);
    if (!listing) return false;
    const updated: AppListing = { ...listing, status: 'unpublished' };
    this.listings.set(appId, updated);
    this.searchEngine.remove(appId);
    return true;
  }

  update(appId: string, updates: Partial<AppListing>): AppListing | null {
    const listing = this.listings.get(appId);
    if (!listing) return null;
    const updated: AppListing = { ...listing, ...updates, id: appId };
    this.listings.set(appId, updated);
    if (updated.status === 'published') {
      this.searchEngine.index(updated);
    }
    return updated;
  }

  get(appId: string): AppListing | null {
    return this.listings.get(appId) ?? null;
  }

  search(query: string, filters?: SearchFilters): AppListing[] {
    return this.searchEngine.search(query, filters);
  }

  listByCategory(categoryId: string, sort?: SortOptions, pagination?: Pagination): AppListing[] {
    let results = Array.from(this.listings.values()).filter(
      (l) => l.category === categoryId && l.status === 'published',
    );

    if (sort) {
      results.sort((a, b) => {
        const aVal = a[sort.field as keyof AppListing] as number | string;
        const bVal = b[sort.field as keyof AppListing] as number | string;
        const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        return sort.direction === 'asc' ? cmp : -cmp;
      });
    }

    if (pagination) {
      results = results.slice(pagination.offset, pagination.offset + pagination.limit);
    }

    return results;
  }

  getCreatorApps(creatorId: string): AppListing[] {
    return Array.from(this.listings.values()).filter((l) => l.creatorId === creatorId);
  }
}
