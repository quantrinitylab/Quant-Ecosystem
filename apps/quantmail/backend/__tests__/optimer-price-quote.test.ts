import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerProduct,
  convertPrice,
  createSalesQuote,
  updateQuoteStatus,
  getQuote,
  clearQuotesForTesting,
} from '../services/price-book-quote.service';

describe('Optimer Price Book & Sales Quote Engine', () => {
  beforeEach(() => {
    clearQuotesForTesting();
  });

  describe('Product Registration & Currency Conversion', () => {
    it('should register a product', () => {
      const product = registerProduct({
        sku: 'OPT-PRO-001',
        name: 'Optimer Pro License',
        description: 'Annual license for Optimer Pro',
        basePriceUsd: 1000,
        category: 'Software',
      });
      expect(product.sku).toBe('OPT-PRO-001');
    });

    it('should convert prices to supported currencies correctly', () => {
      // USD 1.0, EUR 0.92, GBP 0.79, INR 83.5, AED 3.67, JPY 155.0
      expect(convertPrice(1000, 'USD')).toBe(1000);
      expect(convertPrice(1000, 'EUR')).toBe(920);
      expect(convertPrice(1000, 'GBP')).toBe(790);
      expect(convertPrice(1000, 'INR')).toBe(83500);
      expect(convertPrice(1000, 'AED')).toBe(3670);
      expect(convertPrice(1000, 'JPY')).toBe(155000);
    });

    it('should throw an error for unsupported currencies', () => {
      expect(() => convertPrice(100, 'XYZ')).toThrowError('Unsupported currency: XYZ');
    });
  });

  describe('Sales Quote Generation', () => {
    beforeEach(() => {
      registerProduct({
        sku: 'SRV-001',
        name: 'Implementation Service',
        description: 'Base setup and implementation',
        basePriceUsd: 500,
        category: 'Service',
      });
      registerProduct({
        sku: 'LIC-001',
        name: 'Enterprise License',
        description: 'Monthly enterprise license',
        basePriceUsd: 200,
        category: 'Software',
      });
    });

    it('should calculate subtotals, discounts, and taxes correctly', () => {
      const quote = createSalesQuote('ws-123', {
        clientName: 'Acme Corp',
        clientEmail: 'contact@acme.corp',
        currency: 'EUR',
        items: [
          { sku: 'SRV-001', quantity: 1, discountPercentage: 10, taxRatePercentage: 20 },
          { sku: 'LIC-001', quantity: 5, discountPercentage: 0, taxRatePercentage: 20 },
        ],
      });

      // Expected calculation for EUR
      // SRV-001: 500 USD = 460 EUR. Qty 1. Sub = 460.
      // Discount = 460 * 0.1 = 46. Taxable = 414. Tax = 414 * 0.2 = 82.8.

      // LIC-001: 200 USD = 184 EUR. Qty 5. Sub = 920.
      // Discount = 0. Taxable = 920. Tax = 920 * 0.2 = 184.

      // Totals:
      // Subtotal = 460 + 920 = 1380
      // Total Discount = 46 + 0 = 46
      // Total Tax = 82.8 + 184 = 266.8
      // Grand Total = 1380 - 46 + 266.8 = 1600.8

      expect(quote.status).toBe('DRAFT');
      expect(quote.currency).toBe('EUR');

      expect(quote.subtotal).toBe(1380);
      expect(quote.totalDiscount).toBe(46);
      expect(quote.totalTax).toBe(266.8);
      expect(quote.grandTotal).toBe(1600.8);

      // Mathematically check consistency
      expect(quote.grandTotal).toBeCloseTo(
        quote.subtotal - quote.totalDiscount + quote.totalTax,
        2,
      );
    });

    it('should generate accurate totals without discounts or taxes', () => {
      const quote = createSalesQuote('ws-123', {
        clientName: 'Startup Inc',
        clientEmail: 'hello@startup.inc',
        currency: 'INR',
        items: [{ sku: 'LIC-001', quantity: 2 }],
      });

      // LIC-001: 200 USD = 16700 INR. Qty 2 = 33400.
      expect(quote.subtotal).toBe(33400);
      expect(quote.totalDiscount).toBe(0);
      expect(quote.totalTax).toBe(0);
      expect(quote.grandTotal).toBe(33400);
    });

    it('should throw an error for non-existent SKU', () => {
      expect(() => {
        createSalesQuote('ws-123', {
          clientName: 'Missing',
          clientEmail: 'missing@error.com',
          currency: 'USD',
          items: [{ sku: 'NOT-REAL', quantity: 1 }],
        });
      }).toThrowError('Product not found for SKU: NOT-REAL');
    });
  });

  describe('Quote Status Management', () => {
    it('should transition status correctly', () => {
      registerProduct({
        sku: 'TEST',
        name: 'Test',
        description: 'Test product',
        basePriceUsd: 10,
        category: 'Test',
      });

      const quote = createSalesQuote('ws-123', {
        clientName: 'Transition Test',
        clientEmail: 'test@transition',
        currency: 'USD',
        items: [{ sku: 'TEST', quantity: 1 }],
      });

      expect(quote.status).toBe('DRAFT');

      const updated1 = updateQuoteStatus(quote.id, 'SENT');
      expect(updated1.status).toBe('SENT');

      const updated2 = updateQuoteStatus(quote.id, 'ACCEPTED');
      expect(updated2.status).toBe('ACCEPTED');

      const fetched = getQuote(quote.id);
      expect(fetched?.status).toBe('ACCEPTED');
    });

    it('should throw error when updating a non-existent quote', () => {
      expect(() => updateQuoteStatus('invalid-id', 'SENT')).toThrowError(
        'Quote not found: invalid-id',
      );
    });
  });
});
