// ============================================================================
// QuantNeon - useShopping Hook
// Cart, wishlist, checkout, order tracking
// ============================================================================

import { useState, useCallback } from 'react';

interface Product {
  id: string;
  name: string;
  brand: string;
  price: number;
  salePrice: number | null;
  imageUrl: string;
  category: string;
  inStock: boolean;
}

interface CartItem {
  product: Product;
  quantity: number;
  selectedSize: string | null;
  selectedColor: string | null;
}

interface Order {
  id: string;
  items: CartItem[];
  total: number;
  status: 'processing' | 'shipped' | 'delivered' | 'cancelled';
  trackingNumber: string | null;
  orderedAt: string;
  estimatedDelivery: string | null;
}

interface ShippingAddress {
  fullName: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}

interface ShoppingState {
  cart: CartItem[];
  wishlist: Product[];
  orders: Order[];
  cartTotal: number;
  cartCount: number;
  checkingOut: boolean;
  shippingAddress: ShippingAddress | null;
  loading: boolean;
  error: string | null;
}

interface ShoppingActions {
  addToCart: (product: Product, quantity?: number, size?: string, color?: string) => void;
  removeFromCart: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  addToWishlist: (product: Product) => void;
  removeFromWishlist: (productId: string) => void;
  moveToCart: (productId: string) => void;
  startCheckout: () => void;
  cancelCheckout: () => void;
  setShippingAddress: (address: ShippingAddress) => void;
  placeOrder: () => Promise<Order>;
  getOrderStatus: (orderId: string) => Order | null;
}

export function useShopping(): [ShoppingState, ShoppingActions] {
  const [state, setState] = useState<ShoppingState>({
    cart: [],
    wishlist: [],
    orders: [],
    cartTotal: 0,
    cartCount: 0,
    checkingOut: false,
    shippingAddress: null,
    loading: false,
    error: null,
  });

  const recalculateCart = (cart: CartItem[]): { total: number; count: number } => {
    const total = cart.reduce((sum, item) => sum + (item.product.salePrice || item.product.price) * item.quantity, 0);
    const count = cart.reduce((sum, item) => sum + item.quantity, 0);
    return { total: parseFloat(total.toFixed(2)), count };
  };

  const addToCart = useCallback((product: Product, quantity = 1, size?: string, color?: string) => {
    setState(prev => {
      const existing = prev.cart.find(item => item.product.id === product.id);
      let newCart: CartItem[];
      if (existing) {
        newCart = prev.cart.map(item => item.product.id === product.id ? { ...item, quantity: item.quantity + quantity } : item);
      } else {
        newCart = [...prev.cart, { product, quantity, selectedSize: size || null, selectedColor: color || null }];
      }
      const { total, count } = recalculateCart(newCart);
      return { ...prev, cart: newCart, cartTotal: total, cartCount: count };
    });
  }, []);

  const removeFromCart = useCallback((productId: string) => {
    setState(prev => {
      const newCart = prev.cart.filter(item => item.product.id !== productId);
      const { total, count } = recalculateCart(newCart);
      return { ...prev, cart: newCart, cartTotal: total, cartCount: count };
    });
  }, []);

  const updateQuantity = useCallback((productId: string, quantity: number) => {
    setState(prev => {
      const newCart = quantity <= 0
        ? prev.cart.filter(item => item.product.id !== productId)
        : prev.cart.map(item => item.product.id === productId ? { ...item, quantity } : item);
      const { total, count } = recalculateCart(newCart);
      return { ...prev, cart: newCart, cartTotal: total, cartCount: count };
    });
  }, []);

  const clearCart = useCallback(() => {
    setState(prev => ({ ...prev, cart: [], cartTotal: 0, cartCount: 0 }));
  }, []);

  const addToWishlist = useCallback((product: Product) => {
    setState(prev => {
      if (prev.wishlist.some(p => p.id === product.id)) return prev;
      return { ...prev, wishlist: [...prev.wishlist, product] };
    });
  }, []);

  const removeFromWishlist = useCallback((productId: string) => {
    setState(prev => ({ ...prev, wishlist: prev.wishlist.filter(p => p.id !== productId) }));
  }, []);

  const moveToCart = useCallback((productId: string) => {
    setState(prev => {
      const product = prev.wishlist.find(p => p.id === productId);
      if (!product) return prev;
      const newWishlist = prev.wishlist.filter(p => p.id !== productId);
      const existing = prev.cart.find(item => item.product.id === productId);
      let newCart: CartItem[];
      if (existing) {
        newCart = prev.cart.map(item => item.product.id === productId ? { ...item, quantity: item.quantity + 1 } : item);
      } else {
        newCart = [...prev.cart, { product, quantity: 1, selectedSize: null, selectedColor: null }];
      }
      const { total, count } = recalculateCart(newCart);
      return { ...prev, wishlist: newWishlist, cart: newCart, cartTotal: total, cartCount: count };
    });
  }, []);

  const startCheckout = useCallback(() => {
    setState(prev => ({ ...prev, checkingOut: true }));
  }, []);

  const cancelCheckout = useCallback(() => {
    setState(prev => ({ ...prev, checkingOut: false }));
  }, []);

  const setShippingAddress = useCallback((address: ShippingAddress) => {
    setState(prev => ({ ...prev, shippingAddress: address }));
  }, []);

  const placeOrder = useCallback(async (): Promise<Order> => {
    setState(prev => ({ ...prev, loading: true }));
    await new Promise(resolve => setTimeout(resolve, 1500));
    const order: Order = {
      id: `order_${Date.now()}`,
      items: [...state.cart],
      total: state.cartTotal,
      status: 'processing',
      trackingNumber: null,
      orderedAt: new Date().toISOString(),
      estimatedDelivery: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    };
    setState(prev => ({
      ...prev,
      orders: [order, ...prev.orders],
      cart: [],
      cartTotal: 0,
      cartCount: 0,
      checkingOut: false,
      loading: false,
    }));
    return order;
  }, [state.cart, state.cartTotal]);

  const getOrderStatus = useCallback((orderId: string): Order | null => {
    return state.orders.find(o => o.id === orderId) || null;
  }, [state.orders]);

  const actions: ShoppingActions = {
    addToCart, removeFromCart, updateQuantity, clearCart,
    addToWishlist, removeFromWishlist, moveToCart,
    startCheckout, cancelCheckout, setShippingAddress,
    placeOrder, getOrderStatus,
  };

  return [state, actions];
}

export default useShopping;
