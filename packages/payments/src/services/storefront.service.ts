// ============================================================================
// Payments - Storefront Service
// Course/product storefront for creators with 85/15 split
// Uses integer-cent arithmetic internally to avoid floating-point drift.
// ============================================================================

import { z } from 'zod';
import type { StorefrontProduct, ProductPurchase, ProductType, CurrencyCode } from '../types';

const CREATOR_SHARE = 0.85;

export const CreateProductSchema = z.object({
  creatorId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  type: z.enum(['digital_good', 'course', 'template', 'preset', 'ebook']),
  price: z.number().positive(),
  currency: z.string().optional(),
  downloadUrl: z.string().optional(),
  thumbnailUrl: z.string().optional(),
});

export const PurchaseProductSchema = z.object({
  userId: z.string().min(1),
  productId: z.string().min(1),
});

/** Convert a dollar amount to integer cents */
function toCents(amount: number): number {
  return Math.round(amount * 100);
}

/** Convert integer cents to a dollar amount */
function toDollars(cents: number): number {
  return cents / 100;
}

/**
 * StorefrontService - Course/product storefront for creators
 *
 * Creators can list digital goods, courses, templates, presets, and ebooks.
 * Purchases use an 85/15 creator/platform split.
 * Revenue is tracked internally in integer cents to avoid floating-point drift.
 */
export class StorefrontService {
  private readonly products: Map<string, StorefrontProduct> = new Map();
  private readonly purchases: ProductPurchase[] = [];
  /** Internal revenue in integer cents, keyed by product id */
  private readonly revenueCents: Map<string, number> = new Map();

  /**
   * Create a new product listing
   */
  createProduct(params: {
    creatorId: string;
    name: string;
    description: string;
    type: ProductType;
    price: number;
    currency?: CurrencyCode;
    downloadUrl?: string;
    thumbnailUrl?: string;
  }): StorefrontProduct {
    const validated = CreateProductSchema.parse(params);

    const product: StorefrontProduct = {
      id: `prod_${Date.now()}_${globalThis.crypto.randomUUID()}`,
      creatorId: validated.creatorId,
      name: validated.name,
      description: validated.description,
      type: validated.type as ProductType,
      price: validated.price,
      currency: (validated.currency as CurrencyCode) || 'USD',
      downloadUrl: validated.downloadUrl,
      thumbnailUrl: validated.thumbnailUrl,
      salesCount: 0,
      revenue: 0,
      active: true,
      createdAt: Date.now(),
    };

    this.products.set(product.id, product);
    this.revenueCents.set(product.id, 0);
    return product;
  }

  /**
   * List all active products for a creator
   */
  listProducts(creatorId: string): StorefrontProduct[] {
    const results: StorefrontProduct[] = [];
    for (const [, product] of this.products) {
      if (product.creatorId === creatorId && product.active) {
        results.push(product);
      }
    }
    return results.sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Purchase a product
   */
  purchaseProduct(params: { userId: string; productId: string }): ProductPurchase {
    const validated = PurchaseProductSchema.parse(params);

    const product = this.products.get(validated.productId);
    if (!product) {
      throw new Error(`Product not found: ${validated.productId}`);
    }

    if (!product.active) {
      throw new Error('Product is no longer available');
    }

    // Compute shares in integer cents to avoid float drift
    const priceCents = toCents(product.price);
    const creatorShareCents = Math.round(priceCents * CREATOR_SHARE);
    const platformShareCents = priceCents - creatorShareCents;

    const purchase: ProductPurchase = {
      id: `purchase_${Date.now()}_${globalThis.crypto.randomUUID()}`,
      userId: validated.userId,
      productId: validated.productId,
      creatorId: product.creatorId,
      amount: product.price,
      creatorShare: toDollars(creatorShareCents),
      platformShare: toDollars(platformShareCents),
      purchasedAt: Date.now(),
    };

    // Update product stats using integer-cent accumulation
    product.salesCount += 1;
    const currentCents = this.revenueCents.get(product.id) ?? 0;
    const newCents = currentCents + creatorShareCents;
    this.revenueCents.set(product.id, newCents);
    product.revenue = toDollars(newCents);

    this.purchases.push(purchase);
    return purchase;
  }

  /**
   * Get order history for a user
   */
  getOrderHistory(userId: string): ProductPurchase[] {
    return this.purchases
      .filter((p) => p.userId === userId)
      .sort((a, b) => b.purchasedAt - a.purchasedAt);
  }

  /**
   * Get sales summary for a creator
   */
  getCreatorSales(creatorId: string): {
    totalSales: number;
    totalRevenue: number;
    products: StorefrontProduct[];
  } {
    const products = this.listProducts(creatorId);
    let totalRevenueCents = 0;
    for (const p of products) {
      totalRevenueCents += this.revenueCents.get(p.id) ?? 0;
    }
    const totalSales = products.reduce((sum, p) => sum + p.salesCount, 0);

    return { totalSales, totalRevenue: toDollars(totalRevenueCents), products };
  }
}
