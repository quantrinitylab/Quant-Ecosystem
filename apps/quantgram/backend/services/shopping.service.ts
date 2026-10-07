// ============================================================================
// QuantGram — Shopping service (real, not fabricated)
// ============================================================================
//
// HONESTY NOTE: the shopping frontend used to render a hardcoded MOCK_PRODUCTS
// array (invented products with invented prices) and the dead `useShopping`
// hook ran a fake checkout pipeline (1.5s sleep, then a locally-minted order
// with a fabricated estimated delivery). This module is the real backend the
// `/api/shopping/*` proxies now hit:
//
//   GET /shopping/products -> the live product catalog (empty until products
//                            are actually listed — never invented)
//   GET /shopping/cart     -> the caller's real cart
//   POST /shopping/cart    -> add a real catalog product to the cart
//   DELETE /shopping/cart/:productId -> remove a line item
//
// POST /shopping/checkout is deliberately NOT implemented: there is no payment
// provider wired, so the route answers 501 instead of fabricating orders.

export interface Product {
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

export interface CartLine {
  productId: string;
  quantity: number;
  product: Product;
}

export interface Cart {
  userId: string;
  lines: CartLine[];
  total: number;
  itemCount: number;
}

/** The live product catalog. Empty until products are actually listed. */
export class ProductCatalog {
  private products = new Map<string, Product>();

  listProducts(category?: string): Product[] {
    const all = [...this.products.values()];
    return category ? all.filter((p) => p.category === category) : all;
  }

  getProduct(id: string): Product | undefined {
    return this.products.get(id);
  }
}

/** Per-user shopping carts. Real user state, in-memory like the other
 *  QuantGram transactional services (no durable order schema yet). */
export class ShoppingCartService {
  private carts = new Map<string, Map<string, number>>();

  constructor(private readonly catalog: ProductCatalog) {}

  addItem(userId: string, productId: string, quantity: number): Cart {
    const product = this.catalog.getProduct(productId);
    if (!product) {
      throw new Error('PRODUCT_NOT_FOUND');
    }
    if (!product.inStock) {
      throw new Error('PRODUCT_OUT_OF_STOCK');
    }
    const qty = Math.max(1, Math.min(99, Math.floor(quantity)));
    let cart = this.carts.get(userId);
    if (!cart) {
      cart = new Map();
      this.carts.set(userId, cart);
    }
    cart.set(productId, (cart.get(productId) ?? 0) + qty);
    return this.getCart(userId);
  }

  removeItem(userId: string, productId: string): Cart {
    this.carts.get(userId)?.delete(productId);
    return this.getCart(userId);
  }

  clearCart(userId: string): Cart {
    this.carts.delete(userId);
    return this.getCart(userId);
  }

  getCart(userId: string): Cart {
    const entries = this.carts.get(userId);
    const lines: CartLine[] = [];
    if (entries) {
      for (const [productId, quantity] of entries) {
        const product = this.catalog.getProduct(productId);
        if (!product) continue;
        lines.push({ productId, quantity, product });
      }
    }
    const total = lines.reduce((sum, l) => sum + l.product.price * l.quantity, 0);
    const itemCount = lines.reduce((sum, l) => sum + l.quantity, 0);
    return { userId, lines, total, itemCount };
  }
}
