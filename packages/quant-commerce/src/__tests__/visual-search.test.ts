import { VisualSearchEngine, VisualSearchProvider } from '../visual/visual-search.js';
import { ShoppingItem, ShoppingMerchant } from '../types.js';

function makeShoppingItem(overrides: Partial<ShoppingItem> = {}): ShoppingItem {
  return {
    id: 'item-1',
    name: 'Blue Sneakers',
    description: 'Running shoes',
    imageUrl: 'https://example.com/img.jpg',
    price: 3999,
    currency: 'INR',
    merchant: ShoppingMerchant.flipkart,
    category: 'footwear',
    url: 'https://example.com/product/item-1',
    rating: 4.3,
    reviewCount: 200,
    ...overrides,
  };
}

class MockVisualSearchProvider implements VisualSearchProvider {
  private identification = { name: 'unknown', category: 'unknown', confidence: 0 };
  private items: ShoppingItem[] = [];

  setIdentification(id: { name: string; category: string; confidence: number }): void {
    this.identification = id;
  }

  setItems(items: ShoppingItem[]): void {
    this.items = items;
  }

  async identifyItem(
    _imageData: string,
  ): Promise<{ name: string; category: string; confidence: number }> {
    return this.identification;
  }

  async findSimilar(_imageData: string): Promise<ShoppingItem[]> {
    return this.items;
  }
}

describe('VisualSearchEngine', () => {
  let engine: VisualSearchEngine;
  let provider: MockVisualSearchProvider;

  beforeEach(() => {
    engine = new VisualSearchEngine();
    provider = new MockVisualSearchProvider();
    engine.addProvider(provider);
  });

  describe('identifyItem', () => {
    it('should identify an item from image data', async () => {
      provider.setIdentification({ name: 'Nike Air Max', category: 'footwear', confidence: 0.92 });
      const result = await engine.identifyItem('base64-image-data');
      expect(result.name).toBe('Nike Air Max');
      expect(result.category).toBe('footwear');
      expect(result.confidence).toBe(0.92);
    });

    it('should return unknown when no provider matches', async () => {
      provider.setIdentification({ name: 'unknown', category: 'unknown', confidence: 0 });
      const result = await engine.identifyItem('base64-image-data');
      expect(result.name).toBe('unknown');
      expect(result.confidence).toBe(0);
    });

    it('should skip a failing provider and return fallback', async () => {
      const failingProvider = new MockVisualSearchProvider();
      failingProvider.identifyItem = () => Promise.reject(new Error('service down'));
      const engine2 = new VisualSearchEngine();
      engine2.addProvider(failingProvider);
      const result = await engine2.identifyItem('img');
      expect(result.name).toBe('unknown');
    });
  });

  describe('findOnline', () => {
    it('should find items online matching identified item', async () => {
      provider.setItems([
        makeShoppingItem({ id: 'v1', price: 2999 }),
        makeShoppingItem({ id: 'v2', price: 4500 }),
      ]);
      const results = await engine.findOnline({ name: 'sneakers', category: 'footwear' });
      expect(results).toHaveLength(2);
    });

    it('should return partial results when a provider fails', async () => {
      const failingProvider = new MockVisualSearchProvider();
      failingProvider.findSimilar = () => Promise.reject(new Error('timeout'));
      engine.addProvider(failingProvider);
      provider.setItems([makeShoppingItem({ id: 'v1' })]);
      const results = await engine.findOnline({ name: 'sneakers', category: 'footwear' });
      expect(results).toHaveLength(1);
    });
  });

  describe('compareVisualResults', () => {
    it('should compare results and identify best price and rating', () => {
      const items = [
        makeShoppingItem({ id: 'v1', price: 5000, rating: 4.8 }),
        makeShoppingItem({ id: 'v2', price: 2000, rating: 3.9 }),
        makeShoppingItem({ id: 'v3', price: 3500, rating: 4.5 }),
      ];
      const comparison = engine.compareVisualResults('sneakers', items);
      expect(comparison.query).toBe('sneakers');
      expect(comparison.results[0]!.id).toBe('v2');
      expect(comparison.bestPrice!.id).toBe('v2');
      expect(comparison.bestRating!.id).toBe('v1');
    });

    it('should handle empty results', () => {
      const comparison = engine.compareVisualResults('nothing', []);
      expect(comparison.results).toHaveLength(0);
      expect(comparison.bestPrice).toBeNull();
      expect(comparison.bestRating).toBeNull();
    });
  });
});
