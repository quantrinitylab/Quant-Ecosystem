// ============================================================================
// QuantNeon - Shopping Page
// Shop with product grid, categories, wishlists, in-app checkout
// ============================================================================
//
// HONESTY NOTE: this page used to render a hardcoded MOCK_PRODUCTS array
// (invented products with invented prices) behind a fake 500ms loader, and
// checkout was never wired to anything. The catalog now comes from the real
// backend:
//
//   GET /api/shopping/products -> live product catalog (empty until products
//                                are actually listed — never invented)
//   GET /api/shopping/cart     -> the signed-in user's real cart
//   POST /api/shopping/cart    -> add a catalog product
//   DELETE /api/shopping/cart/:productId -> remove a line item
//   POST /api/shopping/checkout -> 501 until a payment provider is wired;
//                                the button says so honestly.

import React, { useState, useEffect, useCallback } from 'react';
import { PageTransition } from '@quant/shared-ui';
import { useAuth } from '../providers/auth-provider';
import { apiFetchRaw } from '@quant/api-client';

interface BackendProduct {
  id: string;
  storeId: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  images: string[];
  category: string;
  inStock: boolean;
  rating: number;
  reviewCount: number;
}

interface Product {
  id: string;
  name: string;
  brand: string;
  price: number;
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
  productId: string;
  quantity: number;
  product: BackendProduct;
}

interface ShoppingPageState {
  products: Product[];
  categories: ShoppingCategory[];
  activeCategory: string;
  cart: CartItem[];
  loading: boolean;
  error: string | null;
  searchQuery: string;
  showCart: boolean;
  notice: string | null;
}

const CATEGORIES: ShoppingCategory[] = [
  { id: 'all', name: 'All', icon: '🛍' },
  { id: 'fashion', name: 'Fashion', icon: '👗' },
  { id: 'beauty', name: 'Beauty', icon: '💄' },
  { id: 'tech', name: 'Tech', icon: '📱' },
  { id: 'home', name: 'Home', icon: '🏠' },
  { id: 'fitness', name: 'Fitness', icon: '💪' },
];

function mapProduct(p: BackendProduct): Product {
  return {
    id: p.id,
    name: p.name,
    brand: p.storeId,
    price: p.price,
    imageUrl: p.images[0] ?? '',
    category: p.category,
    rating: p.rating,
    reviewCount: p.reviewCount,
    isSaved: false,
    inStock: p.inStock,
  };
}

async function readJson(res: Response): Promise<any> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.success === false) {
    const msg =
      body?.error?.message ?? body?.error ?? `Request failed (${res.status})`;
    const err = new Error(typeof msg === 'string' ? msg : 'Request failed');
    (err as any).status = res.status;
    throw err;
  }
  return body?.data ?? body;
}

const ShoppingPage: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const [state, setState] = useState<ShoppingPageState>({
    products: [],
    categories: CATEGORIES,
    activeCategory: 'all',
    cart: [],
    loading: true,
    error: null,
    searchQuery: '',
    showCart: false,
    notice: null,
  });

  const loadCatalog = useCallback(async () => {
    const data = await readJson(await apiFetchRaw('/api/shopping/products'));
    const products: BackendProduct[] = data?.products ?? [];
    return products.map(mapProduct);
  }, []);

  const loadCart = useCallback(async (): Promise<CartItem[]> => {
    if (!isAuthenticated) return [];
    const data = await readJson(await apiFetchRaw('/api/shopping/cart'));
    return data?.lines ?? [];
  }, [isAuthenticated]);

  useEffect(() => {
    const load = async () => {
      try {
        setState((prev) => ({ ...prev, loading: true, error: null }));
        const [products, cart] = await Promise.all([loadCatalog(), loadCart()]);
        setState((prev) => ({ ...prev, products, cart, loading: false }));
      } catch (e) {
        setState((prev) => ({
          ...prev,
          error: e instanceof Error ? e.message : 'Failed to load shop',
          loading: false,
        }));
      }
    };
    load();
  }, [loadCatalog, loadCart]);

  const toggleSave = useCallback((productId: string) => {
    setState((prev) => ({
      ...prev,
      products: prev.products.map((p) =>
        p.id === productId ? { ...p, isSaved: !p.isSaved } : p,
      ),
    }));
  }, []);

  const refreshCart = useCallback(async () => {
    try {
      const cart = await loadCart();
      setState((prev) => ({ ...prev, cart }));
    } catch {
      /* keep existing cart on transient failure */
    }
  }, [loadCart]);

  const addToCart = useCallback(
    async (product: Product) => {
      if (!isAuthenticated) {
        setState((prev) => ({ ...prev, notice: 'Sign in to add items to your cart.' }));
        return;
      }
      try {
        const data = await readJson(
          await apiFetchRaw('/api/shopping/cart', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ productId: product.id, quantity: 1 }),
          }),
        );
        setState((prev) => ({ ...prev, cart: data?.lines ?? prev.cart, notice: null }));
      } catch (e) {
        setState((prev) => ({
          ...prev,
          notice: e instanceof Error ? e.message : 'Could not add item to cart.',
        }));
      }
    },
    [isAuthenticated],
  );

  const removeFromCart = useCallback(
    async (productId: string) => {
      try {
        const data = await readJson(
          await apiFetchRaw(`/api/shopping/cart/${encodeURIComponent(productId)}`, {
            method: 'DELETE',
          }),
        );
        setState((prev) => ({ ...prev, cart: data?.lines ?? prev.cart, notice: null }));
      } catch (e) {
        setState((prev) => ({
          ...prev,
          notice: e instanceof Error ? e.message : 'Could not remove item.',
        }));
      }
    },
    [],
  );

  const checkout = useCallback(async () => {
    if (!isAuthenticated) {
      setState((prev) => ({ ...prev, notice: 'Sign in to check out.' }));
      return;
    }
    try {
      await readJson(
        await apiFetchRaw('/api/shopping/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        }),
      );
      setState((prev) => ({ ...prev, notice: 'Order placed.' }));
      await refreshCart();
    } catch (e) {
      // 501 until a payment provider is wired — surface that honestly.
      setState((prev) => ({
        ...prev,
        notice:
          e instanceof Error
            ? e.message
            : 'Checkout is not available yet — no payment provider is wired.',
      }));
    }
  }, [isAuthenticated, refreshCart]);

  const setCategory = useCallback((categoryId: string) => {
    setState((prev) => ({ ...prev, activeCategory: categoryId }));
  }, []);

  if (state.loading) {
    return (
      <PageTransition>
        <div className="flex items-center justify-center min-h-screen bg-black dark:bg-[#0F0F14]">
          <div className="w-10 h-10 border-3 border-pink-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </PageTransition>
    );
  }

  if (state.error) {
    return (
      <PageTransition>
        <div className="flex items-center justify-center min-h-screen bg-black dark:bg-[#0F0F14]">
          <div className="text-center space-y-3">
            <p className="text-white">{state.error}</p>
            <button
              onClick={() => window.location.reload()}
              className="min-h-[44px] px-4 py-2 bg-pink-600 text-white rounded-lg text-sm"
            >
              Retry
            </button>
          </div>
        </div>
      </PageTransition>
    );
  }

  const filteredProducts =
    state.activeCategory === 'all'
      ? state.products
      : state.products.filter((p) => p.category === state.activeCategory);

  const cartTotal = state.cart.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0,
  );

  return (
    <PageTransition>
      <div className="min-h-screen bg-black dark:bg-[#0F0F14] text-white pb-20">
        <header className="sticky top-0 bg-black/95 dark:bg-[#0F0F14]/95 backdrop-blur-sm border-b border-gray-800 px-4 py-3 z-10">
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center justify-between mb-3">
              <h1 className="text-xl font-bold">Shop</h1>
              <div className="flex items-center space-x-3">
                <button
                  onClick={() => setState((prev) => ({ ...prev, showCart: !prev.showCart }))}
                  className="relative min-w-[44px] min-h-[44px] flex items-center justify-center"
                >
                  <span className="text-xl">🛒</span>
                  {state.cart.length > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-pink-600 rounded-full text-xs flex items-center justify-center">
                      {state.cart.length}
                    </span>
                  )}
                </button>
              </div>
            </div>
            <input
              type="text"
              value={state.searchQuery}
              onChange={(e) => setState((prev) => ({ ...prev, searchQuery: e.target.value }))}
              placeholder="Search products..."
              className="w-full h-11 bg-gray-900 dark:bg-gray-800 text-white rounded-xl px-4 text-sm outline-none focus:ring-2 focus:ring-pink-500"
            />
          </div>
        </header>

        <div className="max-w-2xl mx-auto px-4">
          {state.notice && (
            <div className="mt-3 px-4 py-3 bg-gray-900 border border-gray-800 rounded-xl">
              <p className="text-sm text-gray-300">{state.notice}</p>
            </div>
          )}

          {/* Categories */}
          <div className="flex space-x-3 py-3 overflow-x-auto scrollbar-hide">
            {state.categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setCategory(cat.id)}
                className={`flex items-center space-x-1 min-h-[44px] px-3 py-2 rounded-full text-xs whitespace-nowrap ${
                  state.activeCategory === cat.id
                    ? 'bg-pink-600 text-white'
                    : 'bg-gray-800 text-gray-300'
                }`}
              >
                <span>{cat.icon}</span>
                <span>{cat.name}</span>
              </button>
            ))}
          </div>

          {/* Product Grid */}
          <div className="grid grid-cols-2 gap-3 py-2">
            {filteredProducts.map((product) => (
              <div
                key={product.id}
                className="bg-gray-900 dark:bg-gray-800 rounded-xl overflow-hidden group"
              >
                <div className="relative aspect-square bg-gray-800 dark:bg-gray-700">
                  {product.imageUrl ? (
                    <img
                      src={product.imageUrl}
                      alt={product.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-600 text-3xl">
                      🛍
                    </div>
                  )}
                  <button
                    onClick={() => toggleSave(product.id)}
                    className="absolute top-2 right-2 min-w-[44px] min-h-[44px] bg-black/50 rounded-full flex items-center justify-center"
                  >
                    <span className={product.isSaved ? 'text-red-500' : 'text-white'}>
                      {product.isSaved ? '♥' : '♡'}
                    </span>
                  </button>
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
                    <span className="text-sm font-bold">${product.price.toFixed(2)}</span>
                    <div className="flex items-center space-x-1">
                      <span className="text-yellow-400 text-xs">★</span>
                      <span className="text-xs text-gray-400">{product.rating}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => void addToCart(product)}
                    disabled={!product.inStock}
                    className="w-full min-h-[44px] mt-2 py-1.5 bg-pink-600 text-white rounded-lg text-xs font-medium hover:bg-pink-700 disabled:opacity-50 disabled:cursor-not-allowed"
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
              <p className="text-gray-400">No products listed yet</p>
              <p className="text-gray-500 text-sm mt-1">
                Products will appear here once sellers list them.
              </p>
            </div>
          )}
        </div>

        {/* Cart Drawer */}
        {state.showCart && (
          <div className="fixed inset-0 bg-black/80 z-50 flex justify-end">
            <div className="w-80 bg-gray-900 h-full flex flex-col">
              <div className="flex items-center justify-between p-4 border-b border-gray-800">
                <h2 className="font-bold">Cart ({state.cart.length})</h2>
                <button
                  onClick={() => setState((prev) => ({ ...prev, showCart: false }))}
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-white"
                >
                  ✕
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {state.cart.length === 0 ? (
                  <p className="text-gray-500 text-center text-sm py-8">Your cart is empty</p>
                ) : (
                  state.cart.map((item) => (
                    <div key={item.productId} className="flex items-center space-x-3">
                      <div className="w-14 h-14 rounded-lg bg-gray-800 overflow-hidden">
                        {item.product.images[0] ? (
                          <img
                            src={item.product.images[0]}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-600">
                            🛍
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{item.product.name}</p>
                        <p className="text-xs text-pink-400">
                          ${item.product.price.toFixed(2)} x {item.quantity}
                        </p>
                      </div>
                      <button
                        onClick={() => void removeFromCart(item.productId)}
                        className="text-gray-500 hover:text-red-400 text-xs"
                      >
                        ✕
                      </button>
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
                  <button
                    onClick={() => void checkout()}
                    className="w-full min-h-[44px] py-3 bg-pink-600 text-white rounded-xl font-semibold hover:bg-pink-700"
                  >
                    Checkout
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </PageTransition>
  );
};

export default ShoppingPage;
