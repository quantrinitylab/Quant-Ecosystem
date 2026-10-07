import { describe, it, expect, beforeEach } from 'vitest';
import { TaxService } from '../tax-service';

describe('TaxService', () => {
  let service: TaxService;

  beforeEach(() => {
    service = new TaxService();
  });

  describe('calculateTax', () => {
    it('should calculate UK VAT', async () => {
      const result = await service.calculateTax({
        amount: 100,
        currency: 'GBP',
        sellerCountry: 'GB',
        buyerCountry: 'GB',
      });

      expect(result.subtotal).toBe(100);
      expect(result.taxAmount).toBeGreaterThan(0);
      expect(result.total).toBeGreaterThan(100);
      expect(result.reverseCharge).toBe(false);
      expect(result.breakdown.length).toBeGreaterThan(0);
    });

    it('should apply reverse charge for intra-EU transactions', async () => {
      const result = await service.calculateTax({
        amount: 100,
        currency: 'EUR',
        sellerCountry: 'DE',
        buyerCountry: 'FR',
      });

      expect(result.reverseCharge).toBe(true);
      expect(result.taxAmount).toBe(0);
      expect(result.total).toBe(100);
    });

    it('should not apply reverse charge for same country', async () => {
      const result = await service.calculateTax({
        amount: 100,
        currency: 'EUR',
        sellerCountry: 'DE',
        buyerCountry: 'DE',
      });

      expect(result.reverseCharge).toBe(false);
      expect(result.taxAmount).toBeGreaterThan(0);
    });

    it('should apply exemption when customer is exempt', async () => {
      await service.applyExemptions('cust-1', 'GB', 'vat');

      const result = await service.calculateTax({
        amount: 100,
        currency: 'GBP',
        sellerCountry: 'GB',
        buyerCountry: 'GB',
        customerId: 'cust-1',
      });

      expect(result.taxAmount).toBe(0);
      expect(result.total).toBe(100);
    });

    it('should calculate US state sales tax', async () => {
      const result = await service.calculateTax({
        amount: 100,
        currency: 'USD',
        sellerCountry: 'US',
        buyerCountry: 'US',
        buyerState: 'CA',
      });

      expect(result.taxAmount).toBeGreaterThan(0);
      expect(result.breakdown.some((b) => b.type === 'sales_tax')).toBe(true);
    });
  });

  describe('getRate', () => {
    it('should return rates for a country', async () => {
      const rates = await service.getRate('GB');
      expect(rates.length).toBeGreaterThan(0);
      expect(rates.every((r) => r.country === 'GB')).toBe(true);
    });

    it('should filter by state', async () => {
      const rates = await service.getRate('US', 'CA');
      expect(rates.length).toBeGreaterThan(0);
      expect(rates.every((r) => r.state === 'CA' || !r.state)).toBe(true);
    });

    it('should filter by type', async () => {
      const rates = await service.getRate('GB', undefined, 'vat');
      expect(rates.every((r) => r.type === 'vat')).toBe(true);
    });

    it('should return empty for unknown country', async () => {
      const rates = await service.getRate('XX');
      expect(rates).toEqual([]);
    });
  });

  describe('validateTaxId', () => {
    it('should validate UK VAT number', async () => {
      const result = await service.validateTaxId('GB123456789', 'GB');
      expect(result.valid).toBe(true);
      expect(result.type).toBe('VAT');
    });

    it('should reject invalid UK VAT number', async () => {
      const result = await service.validateTaxId('GBINVALID', 'GB');
      expect(result.valid).toBe(false);
    });

    it('should validate German VAT number', async () => {
      const result = await service.validateTaxId('DE123456789', 'DE');
      expect(result.valid).toBe(true);
      expect(result.type).toBe('VAT');
    });

    it('should validate Indian GST number', async () => {
      const result = await service.validateTaxId('27AAAAA0000A1Z5', 'IN');
      expect(result.valid).toBe(true);
      expect(result.type).toBe('GST');
    });

    it('should validate US EIN', async () => {
      const result = await service.validateTaxId('12-3456789', 'US');
      expect(result.valid).toBe(true);
      expect(result.type).toBe('EIN');
    });

    it('should return invalid for unknown country', async () => {
      const result = await service.validateTaxId('ANY123', 'XX');
      expect(result.valid).toBe(false);
      expect(result.type).toBe('unknown');
    });
  });

  describe('calculateGST', () => {
    it('should calculate 18% GST for digital services', () => {
      const result = service.calculateGST(1000, 'MH', '998314');
      expect(result.taxRate).toBe(18);
      expect(result.taxAmount).toBe(180);
      expect(result.total).toBe(1180);
      expect(result.taxType).toBe('gst');
    });

    it('should calculate 0% GST for essential goods', () => {
      const result = service.calculateGST(100, 'MH', '0401');
      expect(result.taxRate).toBe(0);
      expect(result.taxAmount).toBe(0);
      expect(result.total).toBe(100);
    });

    it('should calculate 28% GST for luxury goods', () => {
      const result = service.calculateGST(1000, 'MH', '2402');
      expect(result.taxRate).toBe(28);
      expect(result.taxAmount).toBe(280);
    });

    it('should default to 18% for unknown HSN codes', () => {
      const result = service.calculateGST(1000, 'MH', '999999');
      expect(result.taxRate).toBe(18);
    });
  });

  describe('calculateVAT', () => {
    it('should calculate German VAT at 19%', () => {
      const result = service.calculateVAT(100, 'DE');
      expect(result.taxRate).toBe(19);
      expect(result.taxAmount).toBe(19);
      expect(result.total).toBe(119);
    });

    it('should calculate Hungarian VAT at 27%', () => {
      const result = service.calculateVAT(100, 'HU');
      expect(result.taxRate).toBe(27);
      expect(result.taxAmount).toBe(27);
    });

    it('should default to 20% for unknown EU country', () => {
      const result = service.calculateVAT(100, 'XX');
      expect(result.taxRate).toBe(20);
    });
  });

  describe('calculateSalesTax', () => {
    it('should calculate California sales tax at 7.25%', () => {
      const result = service.calculateSalesTax(100, 'CA');
      expect(result.taxRate).toBe(7.25);
      expect(result.taxAmount).toBe(7.25);
      expect(result.total).toBe(107.25);
    });

    it('should return 0% for no-sales-tax states', () => {
      const result = service.calculateSalesTax(100, 'OR');
      expect(result.taxRate).toBe(0);
      expect(result.taxAmount).toBe(0);
    });

    it('should return 0% for unknown state', () => {
      const result = service.calculateSalesTax(100, 'XX');
      expect(result.taxRate).toBe(0);
    });
  });

  describe('getFullTaxBreakdown', () => {
    it('should use GST for Indian users', () => {
      const result = service.getFullTaxBreakdown(1000, { country: 'IN', state: 'MH' });
      expect(result.taxType).toBe('gst');
      expect(result.taxRate).toBe(18);
    });

    it('should use VAT for EU users', () => {
      const result = service.getFullTaxBreakdown(100, { country: 'DE' });
      expect(result.taxType).toBe('vat');
      expect(result.taxRate).toBe(19);
    });

    it('should use sales tax for US users', () => {
      const result = service.getFullTaxBreakdown(100, { country: 'US', state: 'CA' });
      expect(result.taxType).toBe('sales_tax');
      expect(result.taxRate).toBe(7.25);
    });

    it('should return 0% for unknown jurisdictions', () => {
      const result = service.getFullTaxBreakdown(100, { country: 'XX' });
      expect(result.taxRate).toBe(0);
      expect(result.taxAmount).toBe(0);
    });

    it('should include GB in VAT countries', () => {
      const result = service.getFullTaxBreakdown(100, { country: 'GB' });
      expect(result.taxType).toBe('vat');
      expect(result.taxRate).toBe(20);
    });
  });

  describe('getReverseCharge', () => {
    it('should not apply for same country', async () => {
      const result = await service.getReverseCharge('DE', 'DE');
      expect(result.applies).toBe(false);
    });

    it('should apply for intra-EU B2B', async () => {
      const result = await service.getReverseCharge('DE', 'FR');
      expect(result.applies).toBe(true);
      expect(result.reason).toContain('Intra-EU');
    });

    it('should apply for export outside EU', async () => {
      const result = await service.getReverseCharge('DE', 'US');
      expect(result.applies).toBe(true);
      expect(result.reason).toContain('Export');
    });

    it('should not apply for non-EU to non-EU', async () => {
      const result = await service.getReverseCharge('US', 'JP');
      expect(result.applies).toBe(false);
    });
  });

  describe('applyExemptions', () => {
    it('should apply and check exemption', async () => {
      await service.applyExemptions('cust-1', 'GB', 'vat', 365);

      const result = await service.calculateTax({
        amount: 100,
        currency: 'GBP',
        sellerCountry: 'GB',
        buyerCountry: 'GB',
        customerId: 'cust-1',
      });

      expect(result.taxAmount).toBe(0);
    });

    it('should not apply expired exemption', async () => {
      await service.applyExemptions('cust-1', 'GB', 'vat', 0);

      await new Promise((r) => setTimeout(r, 10));

      const result = await service.calculateTax({
        amount: 100,
        currency: 'GBP',
        sellerCountry: 'GB',
        buyerCountry: 'GB',
        customerId: 'cust-1',
      });

      expect(result.taxAmount).toBeGreaterThan(0);
    });
  });

  describe('generateTaxReport', () => {
    it('should generate report with recorded calculations', async () => {
      await service.calculateTax({
        amount: 100,
        currency: 'GBP',
        sellerCountry: 'GB',
        buyerCountry: 'GB',
      });

      const report = await service.generateTaxReport('GB_all', Date.now() - 86400000, Date.now());
      expect(report.jurisdiction).toBe('GB_all');
      expect(report.period).toBeDefined();
    });

    it('should return empty report for no history', async () => {
      const report = await service.generateTaxReport('XX', Date.now() - 86400000, Date.now());
      expect(report.totalSales).toBe(0);
      expect(report.taxCollected).toBe(0);
    });
  });

  describe('getJurisdiction', () => {
    it('should return null for unknown jurisdiction', async () => {
      const result = await service.getJurisdiction('XX');
      expect(result).toBeNull();
    });
  });

  describe('getThresholds', () => {
    it('should return threshold data', async () => {
      const thresholds = await service.getThresholds();
      expect(thresholds.length).toBeGreaterThan(0);
      expect(thresholds[0]).toHaveProperty('jurisdiction');
      expect(thresholds[0]).toHaveProperty('threshold');
      expect(thresholds[0]).toHaveProperty('registered');
    });
  });
});
