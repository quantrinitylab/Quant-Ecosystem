import { MerchantAggregator, MockMerchantProvider } from '../shopping/merchant-search.js';
import { ShoppingItem, ShoppingMerchant, SortBy } from '../types.js';

function makeShoppingItem(overrides: Partial<ShoppingItem> = {}): ShoppingItem {
  return {
    id: 'item-1',
    name: 'Wireless Headphones',
    description: 'Bluetooth over-ear headphones',
    imageUrl: 'https://example.com/img.jpg',
    price: 2999,
    currency: 'INR',
    merchant: ShoppingMerchant.amazon,
    category: 'electronics',
    url: 'https://example.com/product/item-1',
    rating: 4.2,
    reviewCount: 150,
    ...overrides,
  };
}

describe('MerchantAggregator', () => {
  let aggregator: MerchantAggregator;
  let provider1: MockMerchantProvider;
  let provider2: MockMerchantProvider;

  beforeEach(() => {
    aggregator = new MerchantAggregator();
    provider1 = new MockMerchantProvider();
    provider2 = new MockMerchantProvider();
    aggregator.addProvider(provider1);
    aggregator.addProvider(provider2);
  });

  it('should aggregate results from multiple providers', async () => {
    provider1.setItems([makeShoppingItem({ id: 'a1', price: 2999 })]);
    provider2.setItems([makeShoppingItem({ id: 'b1', price: 3499 })]);

    const result = await aggregator.search({ query: 'headphones', sortBy: SortBy.price });
    expect(result.results).toHaveLength(2);
  });

  it('should rank results by price (lowest first)', async () => {
    provider1.setItems([makeShoppingItem({ id: 'a1', price: 5000 })]);
    provider2.setItems([makeShoppingItem({ id: 'b1', price: 2000 })]);

    const result = await aggregator.search({ query: 'headphones', sortBy: SortBy.price });
    expect(result.results[0]!.id).toBe('b1');
    expect(result.results[1]!.id).toBe('a1');
  });

  it('should identify best deal (lowest price)', async () => {
    provider1.setItems([
      makeShoppingItem({ id: 'a1', price: 5000 }),
      makeShoppingItem({ id: 'a2', price: 1500 }),
    ]);

    const result = await aggregator.search({ query: 'headphones' });
    const bestDeal = aggregator.getBestDeal(result);
    expect(bestDeal).not.toBeNull();
    expect(bestDeal!.id).toBe('a2');
  });

  it('should filter results by minPrice and maxPrice', async () => {
    provider1.setItems([
      makeShoppingItem({ id: 'a1', price: 500 }),
      makeShoppingItem({ id: 'a2', price: 2000 }),
      makeShoppingItem({ id: 'a3', price: 5000 }),
    ]);

    const result = await aggregator.search({
      query: 'headphones',
      minPrice: 1000,
      maxPrice: 3000,
    });
    expect(result.results).toHaveLength(1);
    expect(result.results[0]!.id).toBe('a2');
  });

  it('should identify best rating', async () => {
    provider1.setItems([
      makeShoppingItem({ id: 'a1', rating: 3.5 }),
      makeShoppingItem({ id: 'a2', rating: 4.8 }),
    ]);

    const result = await aggregator.search({ query: 'headphones' });
    expect(result.bestRating!.id).toBe('a2');
  });

  it('should sort results by rating when sortBy is rating', async () => {
    provider1.setItems([
      makeShoppingItem({ id: 'a1', rating: 3.0, price: 1000 }),
      makeShoppingItem({ id: 'a2', rating: 4.9, price: 5000 }),
      makeShoppingItem({ id: 'a3', rating: 4.2, price: 3000 }),
    ]);

    const result = await aggregator.search({ query: 'headphones', sortBy: SortBy.rating });
    expect(result.results[0]!.id).toBe('a2');
    expect(result.results[1]!.id).toBe('a3');
    expect(result.results[2]!.id).toBe('a1');
  });

  it('should return partial results when a provider throws', async () => {
    provider1.setItems([makeShoppingItem({ id: 'a1', price: 2000 })]);
    const failingProvider = {
      search: () => Promise.reject(new Error('service unavailable')),
      getProductDetails: () => Promise.resolve(null),
      checkStock: () => Promise.resolve(false),
    };
    aggregator.addProvider(failingProvider);

    const result = await aggregator.search({ query: 'headphones', sortBy: SortBy.price });
    expect(result.results).toHaveLength(1);
    expect(result.results[0]!.id).toBe('a1');
  });
});
