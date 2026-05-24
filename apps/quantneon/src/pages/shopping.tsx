// ============================================================================
// QuantNeon - Shopping Page
// Shop with product grid, categories, wishlists, in-app checkout
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';

interface Product {
  id: string;
  name: string;
  brand: string;
  price: number;
  salePrice: number | null;
  imageUrl: string;
  category: string;
  rating: number;
  reviewCount: number;
  isSaved: boolean;
  inStock: boolean;
}

interface ShoppingCategory {
  id: string;
  name: string;
  icon: string;
}

interface CartItem {
  product: Product;
  quantity: number;
}

interface ShoppingPageState {
  products: Product[];
  categories: ShoppingCategory[];
  activeCategory: string;
  wishlist: Product[];
  cart: CartItem[];
  loading: boolean;
  error: string | null;
  searchQuery: string;
  showCart: boolean;
  sortBy: 'popular' | 'price_low' | 'price_high' | 'newest';
}

const MOCK_CATEGORIES: ShoppingCategory[] = [
  { id: 'all', name: 'All', icon: '🛍' },
  { id: 'fashion', name: 'Fashion', icon: '👗' },
  { id: 'beauty', name: 'Beauty', icon: '💄' },
  { id: 'tech', name: 'Tech', icon: '📱' },
  { id: 'home', name: 'Home', icon: '🏠' },
  { id: 'fitness', name: 'Fitness', icon: '💪' },
];

const MOCK_PRODUCTS: Product[] = [
  { id: 'p1', name: 'Minimalist Watch', brand: 'NeonTime', price: 149.99, salePrice: 99.99, imageUrl: '/products/watch.jpg', category: 'fashion', rating: 4.8, reviewCount: 2340, isSaved: false, inStock: true },
  { id: 'p2', name: 'Wireless Earbuds Pro', brand: 'SoundNeon', price: 199.99, salePrice: null, imageUrl: '/products/earbuds.jpg', category: 'tech', rating: 4.6, reviewCount: 5670, isSaved: true, inStock: true },
  { id: 'p3', name: 'Vitamin C Serum', brand: 'GlowUp', price: 34.99, salePrice: 24.99, imageUrl: '/products/serum.jpg', category: 'beauty', rating: 4.9, reviewCount: 12000, isSaved: false, inStock: true },
  { id: 'p4', name: 'Yoga Mat Premium', brand: 'FlexFit', price: 79.99, salePrice: null, imageUrl: '/products/yogamat.jpg', category: 'fitness', rating: 4.7, reviewCount: 890, isSaved: false, inStock: true },
  { id: 'p5', name: 'LED Desk Lamp', brand: 'HomeNeon', price: 59.99, salePrice: 44.99, imageUrl: '/products/lamp.jpg', category: 'home', rating: 4.5, reviewCount: 3400, isSaved: true, inStock: false },
  { id: 'p6', name: 'Oversized Sunglasses', brand: 'VisionX', price: 89.99, salePrice: null, imageUrl: '/products/sunglasses.jpg', category: 'fashion', rating: 4.4, reviewCount: 1200, isSaved: false, inStock: true },
  { id: 'p7', name: 'Smart Water Bottle', brand: 'HydroTrack', price: 44.99, salePrice: 34.99, imageUrl: '/products/bottle.jpg', category: 'fitness', rating: 4.3, reviewCount: 670, isSaved: false, inStock: true },
  { id: 'p8', name: 'Face Roller Set', brand: 'GlowUp', price: 29.99, salePrice: null, imageUrl: '/products/roller.jpg', category: 'beauty', rating: 4.6, reviewCount: 4500, isSaved: false, inStock: true },
];

const ShoppingPage: React.FC = () => {
  const [state, setState] = useState<ShoppingPageState>({
    products: [],
    categories: MOCK_CATEGORIES,
    activeCategory: 'all',
    wishlist: [],
    cart: [],
    loading: true,
    error: null,
    searchQuery: '',
    showCart: false,
    sortBy: 'popular',
  });

  useEffect(() => {
    const load = async () => {
      try {
        setState(prev => ({ ...prev, loading: true }));
        await new Promise(resolve => setTimeout(resolve, 500));
        setState(prev => ({ ...prev, products: MOCK_PRODUCTS, wishlist: MOCK_PRODUCTS.filter(p => p.isSaved), loading: false }));
      } catch (err) {
        setState(prev => ({ ...prev, error: 'Failed to load shop', loading: false }));
      }
    };
    load();
  }, []);

  const toggleSave = useCallback((productId: string) => {
    setState(prev => {
      const updated = prev.products.map(p => p.id === productId ? { ...p, isSaved: !p.isSaved } : p);
      return { ...prev, products: updated, wishlist: updated.filter(p => p.isSaved) };
    });
  }, []);

  const addToCart = useCallback((product: Product) => {
    setState(prev => {
      const existing = prev.cart.find(item => item.product.id === product.id);
      if (existing) {
        return { ...prev, cart: prev.cart.map(item => item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item) };
      }
      return { ...prev, cart: [...prev.cart, { product, quantity: 1 }] };
    });
  }, []);

  const removeFromCart = useCallback((productId: string) => {
    setState(prev => ({ ...prev, cart: prev.cart.filter(item => item.product.id !== productId) }));
  }, []);

  const setCategory = useCallback((categoryId: string) => {
    setState(prev => ({ ...prev, activeCategory: categoryId }));
  }, []);

  if (state.loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black">
        <div className="w-10 h-10 border-3 border-pink-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black">
        <div className="text-center space-y-3">
          <p className="text-white">{state.error}</p>
          <button onClick={() => window.location.reload()} className="px-4 py-2 bg-pink-600 text-white rounded-lg text-sm">Retry</button>
        </div>
      </div>
    );
  }

  const filteredProducts = state.activeCategory === 'all'
    ? state.products
    : state.products.filter(p => p.category === state.activeCategory);

  const cartTotal = state.cart.reduce((sum, item) => sum + (item.product.salePrice || item.product.price) * item.quantity, 0);

  return (
    <div className="min-h-screen bg-black text-white pb-20">
      <header className="sticky top-0 bg-black/95 backdrop-blur-sm border-b border-gray-800 px-4 py-3 z-10">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-bold">Shop</h1>
          <div className="flex items-center space-x-3">
            <button onClick={() => setState(prev => ({ ...prev, showCart: !prev.showCart }))} className="relative p-2">
              <span className="text-xl">🛒</span>
              {state.cart.length > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-pink-600 rounded-full text-xs flex items-center justify-center">{state.cart.length}</span>
              )}
            </button>
          </div>
        </div>
        <input
          type="text"
          value={state.searchQuery}
          onChange={(e) => setState(prev => ({ ...prev, searchQuery: e.target.value }))}
          placeholder="Search products..."
          className="w-full bg-gray-900 text-white rounded-lg px-4 py-2 text-sm outline-none focus:ring-1 focus:ring-pink-500"
        />
      </header>

      {/* Categories */}
      <div className="flex space-x-3 px-4 py-3 overflow-x-auto scrollbar-hide">
        {state.categories.map(cat => (
          <button
            key={cat.id}
            onClick={() => setCategory(cat.id)}
            className={`flex items-center space-x-1 px-3 py-2 rounded-full text-xs whitespace-nowrap ${
              state.activeCategory === cat.id ? 'bg-pink-600 text-white' : 'bg-gray-800 text-gray-300'
            }`}
          >
            <span>{cat.icon}</span>
            <span>{cat.name}</span>
          </button>
        ))}
      </div>

      {/* Product Grid */}
      <div className="grid grid-cols-2 gap-3 px-4 py-2">
        {filteredProducts.map(product => (
          <div key={product.id} className="bg-gray-900 rounded-xl overflow-hidden group">
            <div className="relative aspect-square bg-gray-800">
              <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
              <button
                onClick={() => toggleSave(product.id)}
                className="absolute top-2 right-2 w-8 h-8 bg-black/50 rounded-full flex items-center justify-center"
              >
                <span className={product.isSaved ? 'text-red-500' : 'text-white'}>{product.isSaved ? '♥' : '♡'}</span>
              </button>
              {product.salePrice && (
                <span className="absolute top-2 left-2 bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">SALE</span>
              )}
              {!product.inStock && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                  <span className="text-white text-sm font-medium">Sold Out</span>
                </div>
              )}
            </div>
            <div className="p-3">
              <p className="text-xs text-gray-400">{product.brand}</p>
              <p className="text-sm font-medium truncate">{product.name}</p>
              <div className="flex items-center justify-between mt-2">
                <div className="flex items-center space-x-2">
                  {product.salePrice ? (
                    <>
                      <span className="text-sm font-bold text-pink-400">${product.salePrice}</span>
                      <span className="text-xs text-gray-500 line-through">${product.price}</span>
                    </>
                  ) : (
                    <span className="text-sm font-bold">${product.price}</span>
                  )}
                </div>
                <div className="flex items-center space-x-1">
                  <span className="text-yellow-400 text-xs">★</span>
                  <span className="text-xs text-gray-400">{product.rating}</span>
                </div>
              </div>
              <button
                onClick={() => addToCart(product)}
                disabled={!product.inStock}
                className="w-full mt-2 py-1.5 bg-pink-600 text-white rounded-lg text-xs font-medium hover:bg-pink-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add to Cart
              </button>
            </div>
          </div>
        ))}
      </div>

      {filteredProducts.length === 0 && (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">🛍</div>
          <p className="text-gray-400">No products found</p>
        </div>
      )}

      {/* Cart Drawer */}
      {state.showCart && (
        <div className="fixed inset-0 bg-black/80 z-50 flex justify-end">
          <div className="w-80 bg-gray-900 h-full flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-800">
              <h2 className="font-bold">Cart ({state.cart.length})</h2>
              <button onClick={() => setState(prev => ({ ...prev, showCart: false }))} className="text-gray-400 hover:text-white">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {state.cart.length === 0 ? (
                <p className="text-gray-500 text-center text-sm py-8">Your cart is empty</p>
              ) : (
                state.cart.map(item => (
                  <div key={item.product.id} className="flex items-center space-x-3">
                    <div className="w-14 h-14 rounded-lg bg-gray-800 overflow-hidden">
                      <img src={item.product.imageUrl} alt="" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{item.product.name}</p>
                      <p className="text-xs text-pink-400">${(item.product.salePrice || item.product.price).toFixed(2)} x {item.quantity}</p>
                    </div>
                    <button onClick={() => removeFromCart(item.product.id)} className="text-gray-500 hover:text-red-400 text-xs">✕</button>
                  </div>
                ))
              )}
            </div>
            {state.cart.length > 0 && (
              <div className="p-4 border-t border-gray-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-400">Total</span>
                  <span className="text-lg font-bold">${cartTotal.toFixed(2)}</span>
                </div>
                <button className="w-full py-3 bg-pink-600 text-white rounded-xl font-semibold hover:bg-pink-700">
                  Checkout
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ShoppingPage;
