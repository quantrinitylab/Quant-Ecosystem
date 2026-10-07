// ============================================================================
// Payments - Tax Service Extended Tests (GST, VAT, Sales Tax)
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { TaxService } from '../tax-service';

describe('TaxService - Extended Methods', () => {
  let service: TaxService;

  beforeEach(() => {
    service = new TaxService();
  });

  describe('calculateGST', () => {
    it('should calculate 18% GST for digital services (default)', () => {
      const result = service.calculateGST(1000, 'MH', '998314');

      expect(result.subtotal).toBe(1000);
      expect(result.taxType).toBe('gst');
      expect(result.taxRate).toBe(18);
      expect(result.taxAmount).toBe(180);
      expect(result.total).toBe(1180);
    });

    it('should calculate 0% GST for essential goods', () => {
      const result = service.calculateGST(500, 'DL', '0401');

      expect(result.taxRate).toBe(0);
      expect(result.taxAmount).toBe(0);
      expect(result.total).toBe(500);
    });

    it('should calculate 5% GST for basic necessities', () => {
      const result = service.calculateGST(200, 'KA', '4901');

      expect(result.taxRate).toBe(5);
      expect(result.taxAmount).toBe(10);
      expect(result.total).toBe(210);
    });

    it('should calculate 12% GST for standard goods', () => {
      const result = service.calculateGST(1000, 'TN', '8471');

      expect(result.taxRate).toBe(12);
      expect(result.taxAmount).toBe(120);
      expect(result.total).toBe(1120);
    });

    it('should calculate 28% GST for luxury/sin goods', () => {
      const result = service.calculateGST(5000, 'GJ', '9504');

      expect(result.taxRate).toBe(28);
      expect(result.taxAmount).toBe(1400);
      expect(result.total).toBe(6400);
    });

    it('should default to 18% for unknown HSN codes', () => {
      const result = service.calculateGST(100, 'MH', '9999');

      expect(result.taxRate).toBe(18);
      expect(result.taxAmount).toBe(18);
    });
  });

  describe('calculateVAT', () => {
    it('should calculate German VAT at 19%', () => {
      const result = service.calculateVAT(100, 'DE');

      expect(result.taxType).toBe('vat');
      expect(result.taxRate).toBe(19);
      expect(result.taxAmount).toBe(19);
      expect(result.total).toBe(119);
    });

    it('should calculate French VAT at 20%', () => {
      const result = service.calculateVAT(200, 'FR');

      expect(result.taxRate).toBe(20);
      expect(result.taxAmount).toBe(40);
      expect(result.total).toBe(240);
    });

    it('should calculate Hungarian VAT at 27% (highest in EU)', () => {
      const result = service.calculateVAT(100, 'HU');

      expect(result.taxRate).toBe(27);
      expect(result.taxAmount).toBe(27);
      expect(result.total).toBe(127);
    });

    it('should calculate UK VAT at 20%', () => {
      const result = service.calculateVAT(50, 'GB');

      expect(result.taxRate).toBe(20);
      expect(result.taxAmount).toBe(10);
      expect(result.total).toBe(60);
    });

    it('should calculate Luxembourg VAT at 17% (lowest in EU)', () => {
      const result = service.calculateVAT(100, 'LU');

      expect(result.taxRate).toBe(17);
      expect(result.taxAmount).toBe(17);
      expect(result.total).toBe(117);
    });

    it('should default to 20% for unknown country codes', () => {
      const result = service.calculateVAT(100, 'XX');

      expect(result.taxRate).toBe(20);
    });
  });

  describe('calculateSalesTax', () => {
    it('should calculate California sales tax at 7.25%', () => {
      const result = service.calculateSalesTax(100, 'CA');

      expect(result.taxType).toBe('sales_tax');
      expect(result.taxRate).toBe(7.25);
      expect(result.taxAmount).toBe(7.25);
      expect(result.total).toBe(107.25);
    });

    it('should calculate New York sales tax at 4%', () => {
      const result = service.calculateSalesTax(100, 'NY');

      expect(result.taxRate).toBe(4);
      expect(result.taxAmount).toBe(4);
      expect(result.total).toBe(104);
    });

    it('should calculate Texas sales tax at 6.25%', () => {
      const result = service.calculateSalesTax(200, 'TX');

      expect(result.taxRate).toBe(6.25);
      expect(result.taxAmount).toBe(12.5);
      expect(result.total).toBe(212.5);
    });

    it('should return 0% for Oregon (no sales tax)', () => {
      const result = service.calculateSalesTax(100, 'OR');

      expect(result.taxRate).toBe(0);
      expect(result.taxAmount).toBe(0);
      expect(result.total).toBe(100);
    });

    it('should return 0% for Delaware (no sales tax)', () => {
      const result = service.calculateSalesTax(100, 'DE');

      expect(result.taxRate).toBe(0);
      expect(result.taxAmount).toBe(0);
      expect(result.total).toBe(100);
    });

    it('should return 0% for unknown state', () => {
      const result = service.calculateSalesTax(100, 'ZZ');

      expect(result.taxRate).toBe(0);
      expect(result.taxAmount).toBe(0);
    });
  });

  describe('getFullTaxBreakdown', () => {
    it('should use GST for India', () => {
      const result = service.getFullTaxBreakdown(1000, { country: 'IN', state: 'MH' });

      expect(result.taxType).toBe('gst');
      expect(result.taxRate).toBe(18);
      expect(result.taxAmount).toBe(180);
    });

    it('should use VAT for EU countries', () => {
      const result = service.getFullTaxBreakdown(100, { country: 'DE' });

      expect(result.taxType).toBe('vat');
      expect(result.taxRate).toBe(19);
    });

    it('should use VAT for UK', () => {
      const result = service.getFullTaxBreakdown(100, { country: 'GB' });

      expect(result.taxType).toBe('vat');
      expect(result.taxRate).toBe(20);
    });

    it('should use sales tax for US with state', () => {
      const result = service.getFullTaxBreakdown(100, { country: 'US', state: 'CA' });

      expect(result.taxType).toBe('sales_tax');
      expect(result.taxRate).toBe(7.25);
    });

    it('should return zero tax for unknown jurisdiction', () => {
      const result = service.getFullTaxBreakdown(100, { country: 'JP' });

      expect(result.taxAmount).toBe(0);
      expect(result.total).toBe(100);
    });

    it('should use custom HSN code for India GST', () => {
      const result = service.getFullTaxBreakdown(1000, { country: 'IN', state: 'KA' }, '9504');

      expect(result.taxRate).toBe(28);
      expect(result.taxAmount).toBe(280);
    });

    it('should handle decimal amounts correctly', () => {
      const result = service.getFullTaxBreakdown(99.99, { country: 'DE' });

      expect(result.subtotal).toBe(99.99);
      expect(result.taxAmount).toBe(19);
      expect(result.total).toBe(118.99);
    });
  });
});
