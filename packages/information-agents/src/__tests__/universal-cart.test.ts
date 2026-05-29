import { UniversalCart } from '../cart/universal-cart.js';
import { getAvailableSources } from '../cart/cart-sources.js';
import type { CartItem } from '../types.js';

describe('UniversalCart', () => {
  let cart: UniversalCart;

  beforeEach(() => {
    cart = new UniversalCart();
  });

  it('adds items to a user cart', () => {
    const item: CartItem = {
      id: 'item-1',
      name: 'Keyboard',
      source: 'amazon',
      price: 79.99,
      url: 'https://amazon.com/keyboard',
      availability: 'in-stock',
      addedAt: Date.now(),
    };
    cart.addItem('user1', item);
    const data = cart.getCart('user1');
    expect(data.items).toHaveLength(1);
    expect(data.items[0]!.name).toBe('Keyboard');
    expect(data.totalEstimate).toBe(79.99);
  });

  it('removes items from cart', () => {
    cart.addItem('user1', {
      id: 'item-1',
      name: 'Mouse',
      source: 'ebay',
      price: 25,
      url: 'https://ebay.com/mouse',
      availability: 'in-stock',
      addedAt: Date.now(),
    });
    cart.addItem('user1', {
      id: 'item-2',
      name: 'Monitor',
      source: 'amazon',
      price: 300,
      url: 'https://amazon.com/monitor',
      availability: 'in-stock',
      addedAt: Date.now(),
    });
    cart.removeItem('user1', 'item-1');
    const data = cart.getCart('user1');
    expect(data.items).toHaveLength(1);
    expect(data.items[0]!.id).toBe('item-2');
  });

  it('searches across multiple sources', () => {
    const sources = getAvailableSources().slice(0, 2);
    const results = cart.search('laptop', sources);
    expect(results.length).toBeGreaterThan(0);
    const sourceNames = new Set(results.map((r) => r.source));
    expect(sourceNames.size).toBe(2);
  });

  it('generates checkout URLs grouped by source', () => {
    cart.addItem('user1', {
      id: 'a1',
      name: 'Item A',
      source: 'amazon',
      price: 50,
      url: 'https://amazon.com/a',
      availability: 'in-stock',
      addedAt: Date.now(),
    });
    cart.addItem('user1', {
      id: 'e1',
      name: 'Item B',
      source: 'ebay',
      price: 30,
      url: 'https://ebay.com/b',
      availability: 'in-stock',
      addedAt: Date.now(),
    });
    cart.addItem('user1', {
      id: 'a2',
      name: 'Item C',
      source: 'amazon',
      price: 25,
      url: 'https://amazon.com/c',
      availability: 'in-stock',
      addedAt: Date.now(),
    });

    const { redirectUrls } = cart.checkout('user1');
    expect(redirectUrls.size).toBe(2);
    expect(redirectUrls.has('amazon')).toBe(true);
    expect(redirectUrls.has('ebay')).toBe(true);
    expect(redirectUrls.get('amazon')).toContain('a1');
    expect(redirectUrls.get('amazon')).toContain('a2');
  });
});
