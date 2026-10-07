import type { GoodCategory, VirtualGood } from '../types.js';

export class VirtualGoodsCatalog {
  private items = new Map<string, VirtualGood>();

  addItem(good: VirtualGood): VirtualGood {
    this.items.set(good.id, good);
    return good;
  }

  listByCategory(category: GoodCategory): VirtualGood[] {
    return [...this.items.values()].filter((g) => g.category === category);
  }

  getItem(id: string): VirtualGood | undefined {
    return this.items.get(id);
  }

  search(query: string): VirtualGood[] {
    const lower = query.toLowerCase();
    return [...this.items.values()].filter(
      (g) => g.name.toLowerCase().includes(lower) || g.description.toLowerCase().includes(lower),
    );
  }

  getAllItems(): VirtualGood[] {
    return [...this.items.values()];
  }
}
