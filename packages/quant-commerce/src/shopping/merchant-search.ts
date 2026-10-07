import { ShoppingItem, MerchantSearch, ComparisonResult, SortBy } from '../types.js';

export interface MerchantProvider {
  search(query: MerchantSearch): Promise<ShoppingItem[]>;
  getProductDetails(id: string): Promise<ShoppingItem | null>;
  checkStock(id: string): Promise<boolean>;
}

export class MerchantAggregator {
  private providers: MerchantProvider[] = [];

  addProvider(provider: MerchantProvider): void {
    this.providers.push(provider);
  }

  async search(query: MerchantSearch): Promise<ComparisonResult> {
    const all: ShoppingItem[] = [];
    for (const p of this.providers) {
      try {
        all.push(...(await p.search(query)));
      } catch {
        /* skip */
      }
    }
    const filtered = all.filter((i) => {
      if (query.minPrice !== undefined && i.price < query.minPrice) return false;
      if (query.maxPrice !== undefined && i.price > query.maxPrice) return false;
      return true;
    });
    const ranked = this.sortResults(filtered, query.sortBy);
    const bestPrice = ranked[0] ?? null;
    const bestRating =
      filtered.length > 0
        ? filtered.reduce((best, i) => (i.rating > best.rating ? i : best))
        : null;
    return { query: query.query, results: ranked, bestPrice, bestRating, searchedAt: Date.now() };
  }

  private sortResults(items: ShoppingItem[], sortBy?: SortBy): ShoppingItem[] {
    const sorted = [...items];
    switch (sortBy) {
      case SortBy.rating:
        return sorted.sort((a, b) => b.rating - a.rating);
      case SortBy.relevance:
        return sorted;
      case SortBy.delivery:
        return sorted.sort((a, b) => a.name.localeCompare(b.name));
      case SortBy.price:
      default:
        return sorted.sort((a, b) => a.price - b.price);
    }
  }

  getBestDeal(results: ComparisonResult): ShoppingItem | null {
    return results.bestPrice;
  }
}

export class MockMerchantProvider implements MerchantProvider {
  private items: ShoppingItem[] = [];
  setItems(items: ShoppingItem[]): void {
    this.items = items;
  }
  async search(): Promise<ShoppingItem[]> {
    return this.items;
  }
  async getProductDetails(id: string): Promise<ShoppingItem | null> {
    return this.items.find((i) => i.id === id) ?? null;
  }
  async checkStock(): Promise<boolean> {
    return true;
  }
}
