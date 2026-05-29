import type { CartItem, CartSource, UniversalCartData } from '../types.js';
import { searchSource } from './cart-sources.js';

export class UniversalCart {
  private carts: Map<string, CartItem[]> = new Map();

  addItem(userId: string, item: CartItem): void {
    const items = this.carts.get(userId) ?? [];
    items.push(item);
    this.carts.set(userId, items);
  }

  removeItem(userId: string, itemId: string): void {
    const items = this.carts.get(userId) ?? [];
    this.carts.set(
      userId,
      items.filter((i) => i.id !== itemId),
    );
  }

  search(query: string, sources: CartSource[]): CartItem[] {
    const results: CartItem[] = [];
    for (const source of sources) {
      results.push(...searchSource(source, query));
    }
    return results;
  }

  getCart(userId: string): UniversalCartData {
    const items = this.carts.get(userId) ?? [];
    const sources = [...new Set(items.map((i) => i.source))];
    const totalEstimate = items.reduce((sum, i) => sum + i.price, 0);
    return {
      id: `cart-${userId}`,
      userId,
      items,
      totalEstimate,
      sources,
    };
  }

  checkout(userId: string): { redirectUrls: Map<string, string> } {
    const items = this.carts.get(userId) ?? [];
    const grouped = new Map<string, CartItem[]>();
    for (const item of items) {
      const existing = grouped.get(item.source) ?? [];
      existing.push(item);
      grouped.set(item.source, existing);
    }

    const redirectUrls = new Map<string, string>();
    for (const [source, sourceItems] of grouped) {
      const ids = sourceItems.map((i) => i.id).join(',');
      redirectUrls.set(source, `https://${source}/checkout?items=${ids}`);
    }
    return { redirectUrls };
  }
}
