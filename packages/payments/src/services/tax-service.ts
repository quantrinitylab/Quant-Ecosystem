// ============================================================================
// Payments - Tax Service
// Multi-jurisdiction tax calculation with VAT/GST/Sales tax
// ============================================================================

import type { TaxRate, TaxJurisdiction, TaxType, TaxBreakdown, CurrencyCode } from '../types';

interface TaxServiceConfig {
  defaultCountry: string;
  enableReverseCharge: boolean;
  enableDigitalServicesVAT: boolean;
  registeredJurisdictions: string[];
}

const DEFAULT_CONFIG: TaxServiceConfig = {
  defaultCountry: 'US',
  enableReverseCharge: true,
  enableDigitalServicesVAT: true,
  registeredJurisdictions: ['US', 'GB', 'DE', 'FR', 'AU', 'IN', 'CA'],
};

interface TaxCalculationResult {
  subtotal: number;
  taxAmount: number;
  total: number;
  effectiveRate: number;
  breakdown: { type: TaxType; rate: number; amount: number; jurisdiction: string }[];
  reverseCharge: boolean;
}

interface TaxReport {
  period: { start: number; end: number };
  jurisdiction: string;
  totalSales: number;
  taxableAmount: number;
  exemptAmount: number;
  taxCollected: number;
  byType: Record<string, { amount: number; taxCollected: number }>;
}

/**
 * TaxService - Multi-jurisdiction tax calculation engine
 *
 * Supports VAT, GST, sales tax, service tax, and withholding tax
 * across multiple jurisdictions with exemptions, reverse charge,
 * threshold tracking, and comprehensive reporting.
 */
export class TaxService {
  private config: TaxServiceConfig;
  private rates: Map<string, TaxRate>;
  private jurisdictions: Map<string, TaxJurisdiction>;
  private exemptions: Map<
    string,
    { customerId: string; jurisdiction: string; type: TaxType; validUntil: number }
  >;
  private taxHistory: Map<string, TaxCalculationResult[]>;
  private thresholds: Map<string, { jurisdiction: string; threshold: number; collected: number }>;

  constructor(config: Partial<TaxServiceConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.rates = new Map();
    this.jurisdictions = new Map();
    this.exemptions = new Map();
    this.taxHistory = new Map();
    this.thresholds = new Map();
    this.initializeDefaultRates();
  }

  /** Calculate tax for a given amount and jurisdiction */
  async calculateTax(params: {
    amount: number;
    currency: CurrencyCode;
    sellerCountry: string;
    buyerCountry: string;
    buyerState?: string;
    customerId?: string;
    productType?: string;
    isDigitalService?: boolean;
  }): Promise<TaxCalculationResult> {
    const { amount, sellerCountry, buyerCountry, buyerState, customerId, isDigitalService } =
      params;

    // Check for reverse charge eligibility
    const reverseCharge = this.shouldApplyReverseCharge(sellerCountry, buyerCountry);
    if (reverseCharge) {
      return {
        subtotal: amount,
        taxAmount: 0,
        total: amount,
        effectiveRate: 0,
        breakdown: [],
        reverseCharge: true,
      };
    }

    // Check exemptions
    if (customerId) {
      const isExempt = this.checkExemption(customerId, buyerCountry);
      if (isExempt) {
        return {
          subtotal: amount,
          taxAmount: 0,
          total: amount,
          effectiveRate: 0,
          breakdown: [],
          reverseCharge: false,
        };
      }
    }

    // Get applicable rates
    const rates = this.getApplicableRates(buyerCountry, buyerState, isDigitalService);
    const breakdown: { type: TaxType; rate: number; amount: number; jurisdiction: string }[] = [];
    let totalTax = 0;

    for (const rate of rates) {
      if (!rate.active) continue;
      const taxAmount = Math.round(amount * (rate.rate / 100) * 100) / 100;
      totalTax += taxAmount;
      breakdown.push({
        type: rate.type,
        rate: rate.rate,
        amount: taxAmount,
        jurisdiction: rate.jurisdiction,
      });
    }

    const result: TaxCalculationResult = {
      subtotal: amount,
      taxAmount: totalTax,
      total: amount + totalTax,
      effectiveRate: amount > 0 ? Math.round((totalTax / amount) * 10000) / 100 : 0,
      breakdown,
      reverseCharge: false,
    };

    // Record in history
    const historyKey = `${buyerCountry}_${buyerState || 'all'}`;
    const history = this.taxHistory.get(historyKey) || [];
    history.push(result);
    this.taxHistory.set(historyKey, history);

    return result;
  }

  /** Get tax rate for a specific jurisdiction */
  async getRate(country: string, state?: string, type?: TaxType): Promise<TaxRate[]> {
    const rates: TaxRate[] = [];
    for (const [, rate] of this.rates) {
      if (rate.country === country && rate.active) {
        if (state && rate.state && rate.state !== state) continue;
        if (type && rate.type !== type) continue;
        rates.push(rate);
      }
    }
    return rates;
  }

  /** Validate a tax ID (VAT number, GST number, etc.) */
  async validateTaxId(
    taxId: string,
    country: string,
  ): Promise<{ valid: boolean; type: string; name?: string; address?: string }> {
    const formats: Record<string, RegExp> = {
      GB: /^GB\d{9}$|^GB\d{12}$|^GBGD\d{3}$|^GBHA\d{3}$/,
      DE: /^DE\d{9}$/,
      FR: /^FR[A-Z0-9]{2}\d{9}$/,
      IT: /^IT\d{11}$/,
      ES: /^ES[A-Z]\d{7}[A-Z0-9]$/,
      IN: /^\d{2}[A-Z]{5}\d{4}[A-Z]\d[A-Z]\d$/,
      AU: /^\d{11}$/,
      US: /^\d{2}-\d{7}$/,
      CA: /^\d{9}RT\d{4}$/,
    };

    const pattern = formats[country];
    if (!pattern) {
      return { valid: false, type: 'unknown' };
    }

    const valid = pattern.test(taxId);
    const typeMap: Record<string, string> = {
      GB: 'VAT',
      DE: 'VAT',
      FR: 'VAT',
      IT: 'VAT',
      ES: 'VAT',
      IN: 'GST',
      AU: 'ABN',
      US: 'EIN',
      CA: 'GST',
    };

    return { valid, type: typeMap[country] || 'TAX_ID' };
  }

  /** Generate tax report for a jurisdiction and period */
  async generateTaxReport(
    jurisdiction: string,
    startDate: number,
    endDate: number,
  ): Promise<TaxReport> {
    const history = this.taxHistory.get(jurisdiction) || [];
    const byType: Record<string, { amount: number; taxCollected: number }> = {};
    let totalSales = 0;
    let taxableAmount = 0;
    let exemptAmount = 0;
    let taxCollected = 0;

    for (const calc of history) {
      totalSales += calc.subtotal;
      if (calc.taxAmount > 0) {
        taxableAmount += calc.subtotal;
        taxCollected += calc.taxAmount;
      } else {
        exemptAmount += calc.subtotal;
      }
      for (const item of calc.breakdown) {
        const key = item.type;
        if (!byType[key]) byType[key] = { amount: 0, taxCollected: 0 };
        byType[key].amount += calc.subtotal;
        byType[key].taxCollected += item.amount;
      }
    }

    return {
      period: { start: startDate, end: endDate },
      jurisdiction,
      totalSales: Math.round(totalSales * 100) / 100,
      taxableAmount: Math.round(taxableAmount * 100) / 100,
      exemptAmount: Math.round(exemptAmount * 100) / 100,
      taxCollected: Math.round(taxCollected * 100) / 100,
      byType,
    };
  }

  /** Get jurisdiction details */
  async getJurisdiction(country: string, state?: string): Promise<TaxJurisdiction | null> {
    const key = state ? `${country}_${state}` : country;
    return this.jurisdictions.get(key) || null;
  }

  /** Apply tax exemption for a customer */
  async applyExemptions(
    customerId: string,
    jurisdiction: string,
    type: TaxType,
    validUntilDays: number = 365,
  ): Promise<void> {
    const key = `${customerId}_${jurisdiction}_${type}`;
    this.exemptions.set(key, {
      customerId,
      jurisdiction,
      type,
      validUntil: Date.now() + validUntilDays * 86400000,
    });
  }

  /** Check if reverse charge applies */
  async getReverseCharge(
    sellerCountry: string,
    buyerCountry: string,
  ): Promise<{ applies: boolean; reason: string }> {
    if (sellerCountry === buyerCountry) {
      return { applies: false, reason: 'Same country - reverse charge not applicable' };
    }
    const euCountries = [
      'DE',
      'FR',
      'IT',
      'ES',
      'NL',
      'BE',
      'AT',
      'PT',
      'IE',
      'FI',
      'SE',
      'DK',
      'PL',
      'CZ',
      'HU',
      'RO',
      'BG',
      'HR',
      'SK',
      'SI',
      'LT',
      'LV',
      'EE',
      'CY',
      'MT',
      'LU',
      'GR',
    ];
    const sellerInEU = euCountries.includes(sellerCountry);
    const buyerInEU = euCountries.includes(buyerCountry);

    if (sellerInEU && buyerInEU && sellerCountry !== buyerCountry) {
      return { applies: true, reason: 'Intra-EU B2B supply - reverse charge applies' };
    }
    if (sellerInEU && !buyerInEU) {
      return { applies: true, reason: 'Export outside EU - zero-rated' };
    }
    return { applies: false, reason: 'Reverse charge conditions not met' };
  }

  /** Get registration thresholds for jurisdictions */
  async getThresholds(): Promise<
    { jurisdiction: string; threshold: number; collected: number; registered: boolean }[]
  > {
    const result: {
      jurisdiction: string;
      threshold: number;
      collected: number;
      registered: boolean;
    }[] = [];
    for (const [, data] of this.thresholds) {
      result.push({
        jurisdiction: data.jurisdiction,
        threshold: data.threshold,
        collected: data.collected,
        registered: this.config.registeredJurisdictions.includes(data.jurisdiction),
      });
    }
    return result;
  }

  // --- GST / VAT / Sales Tax Extended Methods ---

  /** Calculate Indian GST for a given amount, state, and HSN code */
  calculateGST(amount: number, _state: string, hsnCode: string): TaxBreakdown {
    const rate = this.getGSTRate(hsnCode);
    const taxAmount = Math.round(amount * (rate / 100) * 100) / 100;
    return {
      subtotal: amount,
      taxType: 'gst',
      taxRate: rate,
      taxAmount,
      total: Math.round((amount + taxAmount) * 100) / 100,
    };
  }

  /** Calculate EU VAT for a given amount and country code */
  calculateVAT(amount: number, countryCode: string): TaxBreakdown {
    const rate = this.getEUVATRate(countryCode);
    const taxAmount = Math.round(amount * (rate / 100) * 100) / 100;
    return {
      subtotal: amount,
      taxType: 'vat',
      taxRate: rate,
      taxAmount,
      total: Math.round((amount + taxAmount) * 100) / 100,
    };
  }

  /** Calculate US state sales tax for a given amount, state, and zip code */
  calculateSalesTax(amount: number, state: string, _zipCode?: string): TaxBreakdown {
    const rate = this.getUSSalesTaxRate(state);
    const taxAmount = Math.round(amount * (rate / 100) * 100) / 100;
    return {
      subtotal: amount,
      taxType: 'sales_tax',
      taxRate: rate,
      taxAmount,
      total: Math.round((amount + taxAmount) * 100) / 100,
    };
  }

  /** Get full tax breakdown for a given amount, user location, and product type */
  getFullTaxBreakdown(
    amount: number,
    userLocation: { country: string; state?: string; zipCode?: string },
    productType?: string,
  ): TaxBreakdown {
    const { country, state, zipCode } = userLocation;

    if (country === 'IN' && state) {
      return this.calculateGST(amount, state, productType || '998314');
    }

    const euCountries = [
      'DE',
      'FR',
      'IT',
      'ES',
      'NL',
      'BE',
      'AT',
      'PT',
      'IE',
      'FI',
      'SE',
      'DK',
      'PL',
      'CZ',
      'HU',
      'RO',
      'BG',
      'HR',
      'SK',
      'SI',
      'LT',
      'LV',
      'EE',
      'CY',
      'MT',
      'LU',
      'GR',
      'GB',
    ];
    if (euCountries.includes(country)) {
      return this.calculateVAT(amount, country);
    }

    if (country === 'US' && state) {
      return this.calculateSalesTax(amount, state, zipCode);
    }

    // No tax for unknown jurisdictions
    return {
      subtotal: amount,
      taxType: 'sales_tax',
      taxRate: 0,
      taxAmount: 0,
      total: amount,
    };
  }

  /** Get Indian GST rate based on HSN code */
  private getGSTRate(hsnCode: string): number {
    // Indian GST slabs: 0%, 5%, 12%, 18%, 28%
    const gstSlabs: Record<string, number> = {
      // Essential goods - 0%
      '0401': 0, // Milk
      '1001': 0, // Wheat
      '1006': 0, // Rice
      // Basic necessities - 5%
      '0402': 5, // Milk products
      '1905': 5, // Bread
      '4901': 5, // Books
      // Standard goods - 12%
      '1704': 12, // Sugar confectionery
      '2201': 12, // Mineral water
      '8471': 12, // Computers
      // Standard services - 18%
      '998311': 18, // IT services
      '998312': 18, // Hosting services
      '998313': 18, // SaaS
      '998314': 18, // Digital services (default for our platform)
      '998315': 18, // Online services
      // Luxury/sin goods - 28%
      '2402': 28, // Tobacco
      '8703': 28, // Motor vehicles
      '9504': 28, // Gaming
    };

    // Check for exact match first, then prefix match
    if (gstSlabs[hsnCode] !== undefined) {
      return gstSlabs[hsnCode];
    }

    // Check prefix matches (first 4 digits)
    const prefix = hsnCode.substring(0, 4);
    if (gstSlabs[prefix] !== undefined) {
      return gstSlabs[prefix];
    }

    // Default to 18% for digital services
    return 18;
  }

  /** Get EU VAT rate by country code */
  private getEUVATRate(countryCode: string): number {
    const euVATRates: Record<string, number> = {
      AT: 20, // Austria
      BE: 21, // Belgium
      BG: 20, // Bulgaria
      HR: 25, // Croatia
      CY: 19, // Cyprus
      CZ: 21, // Czech Republic
      DK: 25, // Denmark
      EE: 22, // Estonia
      FI: 24, // Finland
      FR: 20, // France
      DE: 19, // Germany
      GR: 24, // Greece
      HU: 27, // Hungary
      IE: 23, // Ireland
      IT: 22, // Italy
      LV: 21, // Latvia
      LT: 21, // Lithuania
      LU: 17, // Luxembourg
      MT: 18, // Malta
      NL: 21, // Netherlands
      PL: 23, // Poland
      PT: 23, // Portugal
      RO: 19, // Romania
      SK: 20, // Slovakia
      SI: 22, // Slovenia
      ES: 21, // Spain
      SE: 25, // Sweden
      GB: 20, // United Kingdom
    };

    return euVATRates[countryCode] || 20;
  }

  /** Get US state sales tax rate */
  private getUSSalesTaxRate(state: string): number {
    const usSalesTaxRates: Record<string, number> = {
      AL: 4.0,
      AZ: 5.6,
      AR: 6.5,
      CA: 7.25,
      CO: 2.9,
      CT: 6.35,
      FL: 6.0,
      GA: 4.0,
      HI: 4.0,
      ID: 6.0,
      IL: 6.25,
      IN: 7.0,
      IA: 6.0,
      KS: 6.5,
      KY: 6.0,
      LA: 4.45,
      ME: 5.5,
      MD: 6.0,
      MA: 6.25,
      MI: 6.0,
      MN: 6.875,
      MS: 7.0,
      MO: 4.225,
      NE: 5.5,
      NV: 6.85,
      NJ: 6.625,
      NM: 5.125,
      NY: 4.0,
      NC: 4.75,
      ND: 5.0,
      OH: 5.75,
      OK: 4.5,
      PA: 6.0,
      RI: 7.0,
      SC: 6.0,
      SD: 4.5,
      TN: 7.0,
      TX: 6.25,
      UT: 6.1,
      VT: 6.0,
      VA: 5.3,
      WA: 6.5,
      WV: 6.0,
      WI: 5.0,
      WY: 4.0,
      // No sales tax states
      AK: 0,
      DE: 0,
      MT: 0,
      NH: 0,
      OR: 0,
    };

    return usSalesTaxRates[state] || 0;
  }

  // --- Private Helpers ---

  private initializeDefaultRates(): void {
    const defaultRates: Omit<TaxRate, 'id'>[] = [
      {
        name: 'UK VAT Standard',
        type: 'vat',
        rate: 20,
        jurisdiction: 'GB',
        country: 'GB',
        active: true,
        inclusive: true,
        description: 'UK standard VAT rate',
      },
      {
        name: 'UK VAT Reduced',
        type: 'vat',
        rate: 5,
        jurisdiction: 'GB',
        country: 'GB',
        active: true,
        inclusive: true,
        description: 'UK reduced VAT rate',
      },
      {
        name: 'Germany VAT',
        type: 'vat',
        rate: 19,
        jurisdiction: 'DE',
        country: 'DE',
        active: true,
        inclusive: true,
        description: 'German standard VAT',
      },
      {
        name: 'France VAT',
        type: 'vat',
        rate: 20,
        jurisdiction: 'FR',
        country: 'FR',
        active: true,
        inclusive: true,
        description: 'French standard VAT',
      },
      {
        name: 'India GST',
        type: 'gst',
        rate: 18,
        jurisdiction: 'IN',
        country: 'IN',
        active: true,
        inclusive: false,
        description: 'Indian GST standard rate',
      },
      {
        name: 'Australia GST',
        type: 'gst',
        rate: 10,
        jurisdiction: 'AU',
        country: 'AU',
        active: true,
        inclusive: true,
        description: 'Australian GST',
      },
      {
        name: 'Canada GST',
        type: 'gst',
        rate: 5,
        jurisdiction: 'CA',
        country: 'CA',
        active: true,
        inclusive: false,
        description: 'Canadian federal GST',
      },
      {
        name: 'California Sales Tax',
        type: 'sales_tax',
        rate: 7.25,
        jurisdiction: 'US_CA',
        country: 'US',
        state: 'CA',
        active: true,
        inclusive: false,
        description: 'California state sales tax',
      },
      {
        name: 'New York Sales Tax',
        type: 'sales_tax',
        rate: 8,
        jurisdiction: 'US_NY',
        country: 'US',
        state: 'NY',
        active: true,
        inclusive: false,
        description: 'New York state + city tax',
      },
      {
        name: 'Texas Sales Tax',
        type: 'sales_tax',
        rate: 6.25,
        jurisdiction: 'US_TX',
        country: 'US',
        state: 'TX',
        active: true,
        inclusive: false,
        description: 'Texas state sales tax',
      },
      {
        name: 'Japan Consumption Tax',
        type: 'vat',
        rate: 10,
        jurisdiction: 'JP',
        country: 'JP',
        active: true,
        inclusive: true,
        description: 'Japanese consumption tax',
      },
      {
        name: 'Brazil ICMS',
        type: 'vat',
        rate: 18,
        jurisdiction: 'BR',
        country: 'BR',
        active: true,
        inclusive: true,
        description: 'Brazilian ICMS standard',
      },
    ];

    for (const rate of defaultRates) {
      const id = `tax_${rate.jurisdiction}_${rate.type}`;
      this.rates.set(id, { ...rate, id });
    }

    // Set up thresholds
    this.thresholds.set('GB', { jurisdiction: 'GB', threshold: 85000, collected: 0 });
    this.thresholds.set('DE', { jurisdiction: 'DE', threshold: 22000, collected: 0 });
    this.thresholds.set('AU', { jurisdiction: 'AU', threshold: 75000, collected: 0 });
    this.thresholds.set('US_CA', { jurisdiction: 'US_CA', threshold: 500000, collected: 0 });
  }

  private getApplicableRates(
    country: string,
    state?: string,
    isDigitalService?: boolean,
  ): TaxRate[] {
    const rates: TaxRate[] = [];
    for (const [, rate] of this.rates) {
      if (rate.country === country && rate.active) {
        if (state && rate.state && rate.state !== state) continue;
        if (!state && rate.state) continue;
        rates.push(rate);
      }
    }

    // For digital services in EU, use destination country rate
    if (isDigitalService && this.config.enableDigitalServicesVAT) {
      return rates.filter((r) => r.type === 'vat' || r.type === 'gst');
    }

    return rates;
  }

  private shouldApplyReverseCharge(sellerCountry: string, buyerCountry: string): boolean {
    if (!this.config.enableReverseCharge) return false;
    if (sellerCountry === buyerCountry) return false;

    const euCountries = [
      'DE',
      'FR',
      'IT',
      'ES',
      'NL',
      'BE',
      'AT',
      'PT',
      'IE',
      'FI',
      'SE',
      'DK',
      'PL',
      'CZ',
      'HU',
      'RO',
      'BG',
      'HR',
      'SK',
      'SI',
      'LT',
      'LV',
      'EE',
      'CY',
      'MT',
      'LU',
      'GR',
    ];
    return euCountries.includes(sellerCountry) && euCountries.includes(buyerCountry);
  }

  private checkExemption(customerId: string, jurisdiction: string): boolean {
    for (const [, exemption] of this.exemptions) {
      if (
        exemption.customerId === customerId &&
        exemption.jurisdiction === jurisdiction &&
        exemption.validUntil > Date.now()
      ) {
        return true;
      }
    }
    return false;
  }
}
