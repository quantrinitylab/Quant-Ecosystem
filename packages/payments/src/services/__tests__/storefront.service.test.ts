// ============================================================================
// Payments - Storefront Service Tests
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { StorefrontService } from '../storefront.service';

describe('StorefrontService', () => {
  let service: StorefrontService;

  beforeEach(() => {
    service = new StorefrontService();
  });

  describe('createProduct', () => {
    it('should create a product listing', () => {
      const product = service.createProduct({
        creatorId: 'creator_1',
        name: 'TypeScript Course',
        description: 'Learn advanced TS patterns',
        type: 'course',
        price: 49.99,
      });

      expect(product.creatorId).toBe('creator_1');
      expect(product.name).toBe('TypeScript Course');
      expect(product.description).toBe('Learn advanced TS patterns');
      expect(product.type).toBe('course');
      expect(product.price).toBe(49.99);
      expect(product.currency).toBe('USD');
      expect(product.salesCount).toBe(0);
      expect(product.revenue).toBe(0);
      expect(product.active).toBe(true);
    });

    it('should reject invalid price', () => {
      expect(() =>
        service.createProduct({
          creatorId: 'creator_1',
          name: 'Free Item',
          description: 'Should fail',
          type: 'ebook',
          price: 0,
        }),
      ).toThrow();
    });

    it('should reject empty name', () => {
      expect(() =>
        service.createProduct({
          creatorId: 'creator_1',
          name: '',
          description: 'Valid',
          type: 'template',
          price: 10,
        }),
      ).toThrow();
    });
  });

  describe('listProducts', () => {
    it('should list products for a creator', () => {
      service.createProduct({
        creatorId: 'creator_1',
        name: 'Course A',
        description: 'Desc A',
        type: 'course',
        price: 29.99,
      });
      service.createProduct({
        creatorId: 'creator_1',
        name: 'Template B',
        description: 'Desc B',
        type: 'template',
        price: 9.99,
      });
      service.createProduct({
        creatorId: 'creator_2',
        name: 'Other',
        description: 'Other creator',
        type: 'ebook',
        price: 14.99,
      });

      const products = service.listProducts('creator_1');
      expect(products).toHaveLength(2);
      expect(products.every((p) => p.creatorId === 'creator_1')).toBe(true);
    });

    it('should return empty array for no products', () => {
      expect(service.listProducts('creator_1')).toHaveLength(0);
    });
  });

  describe('purchaseProduct', () => {
    it('should purchase a product with 85/15 split', () => {
      const product = service.createProduct({
        creatorId: 'creator_1',
        name: 'Course',
        description: 'Desc',
        type: 'course',
        price: 100,
      });

      const purchase = service.purchaseProduct({
        userId: 'user_1',
        productId: product.id,
      });

      expect(purchase.userId).toBe('user_1');
      expect(purchase.productId).toBe(product.id);
      expect(purchase.creatorId).toBe('creator_1');
      expect(purchase.amount).toBe(100);
      expect(purchase.creatorShare).toBe(85);
      expect(purchase.platformShare).toBe(15);
    });

    it('should throw for non-existent product', () => {
      expect(() => service.purchaseProduct({ userId: 'user_1', productId: 'fake_id' })).toThrow(
        'Product not found',
      );
    });

    it('should increment sales count and revenue', () => {
      const product = service.createProduct({
        creatorId: 'creator_1',
        name: 'Template',
        description: 'Desc',
        type: 'template',
        price: 20,
      });

      service.purchaseProduct({ userId: 'user_1', productId: product.id });
      service.purchaseProduct({ userId: 'user_2', productId: product.id });

      const sales = service.getCreatorSales('creator_1');
      expect(sales.totalSales).toBe(2);
      expect(sales.totalRevenue).toBe(34); // 20 * 0.85 * 2
    });
  });

  describe('getOrderHistory', () => {
    it('should return order history for a user', () => {
      const p1 = service.createProduct({
        creatorId: 'creator_1',
        name: 'P1',
        description: 'D1',
        type: 'course',
        price: 10,
      });
      const p2 = service.createProduct({
        creatorId: 'creator_2',
        name: 'P2',
        description: 'D2',
        type: 'ebook',
        price: 15,
      });

      service.purchaseProduct({ userId: 'user_1', productId: p1.id });
      service.purchaseProduct({ userId: 'user_1', productId: p2.id });
      service.purchaseProduct({ userId: 'user_2', productId: p1.id });

      const history = service.getOrderHistory('user_1');
      expect(history).toHaveLength(2);
      expect(history.every((h) => h.userId === 'user_1')).toBe(true);
    });

    it('should return empty array for no purchases', () => {
      expect(service.getOrderHistory('user_1')).toHaveLength(0);
    });
  });

  describe('getCreatorSales', () => {
    it('should return sales summary for a creator', () => {
      const product = service.createProduct({
        creatorId: 'creator_1',
        name: 'Course',
        description: 'Desc',
        type: 'course',
        price: 50,
      });

      service.purchaseProduct({ userId: 'user_1', productId: product.id });
      service.purchaseProduct({ userId: 'user_2', productId: product.id });
      service.purchaseProduct({ userId: 'user_3', productId: product.id });

      const sales = service.getCreatorSales('creator_1');
      expect(sales.totalSales).toBe(3);
      expect(sales.totalRevenue).toBe(127.5); // 50 * 0.85 * 3
      expect(sales.products).toHaveLength(1);
    });
  });
});
