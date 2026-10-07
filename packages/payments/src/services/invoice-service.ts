// ============================================================================
// Payments - Invoice Service
// Full invoice generation with line items, tax, and discounts
// ============================================================================

import type { Invoice, InvoiceItem, InvoiceStatus, CurrencyCode, DiscountInfo } from '../types';

interface InvoiceServiceConfig {
  defaultCurrency: CurrencyCode;
  invoicePrefix: string;
  defaultPaymentTermDays: number;
  autoFinalize: boolean;
  taxInclusive: boolean;
}

const DEFAULT_CONFIG: InvoiceServiceConfig = {
  defaultCurrency: 'USD',
  invoicePrefix: 'INV',
  defaultPaymentTermDays: 30,
  autoFinalize: false,
  taxInclusive: false,
};

/**
 * InvoiceService - Complete invoice lifecycle management
 *
 * Handles invoice generation, line item management, tax calculation,
 * discount application, finalization, voiding, and payment tracking.
 */
export class InvoiceService {
  private config: InvoiceServiceConfig;
  private invoices: Map<string, Invoice>;
  private invoiceCounter: number = 0;
  private discounts: Map<string, DiscountInfo>;
  private customerInvoices: Map<string, string[]>;

  constructor(config: Partial<InvoiceServiceConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.invoices = new Map();
    this.discounts = new Map();
    this.customerInvoices = new Map();
  }

  /** Generate a new invoice */
  async generate(params: {
    customerId: string;
    subscriptionId?: string;
    lineItems: { description: string; quantity: number; unitPrice: number; taxRate?: number }[];
    currency?: CurrencyCode;
    dueInDays?: number;
    notes?: string;
    metadata?: Record<string, string>;
  }): Promise<Invoice> {
    this.invoiceCounter++;
    const now = Date.now();
    const dueInDays = params.dueInDays || this.config.defaultPaymentTermDays;

    const lineItems: InvoiceItem[] = params.lineItems.map((item, idx) => {
      const amount = item.quantity * item.unitPrice;
      const taxRate = item.taxRate || 0;
      const taxAmount = Math.round(amount * taxRate) / 100;
      return {
        id: `li_${Date.now()}_${idx}`,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        amount,
        taxRate,
        taxAmount,
        discount: 0,
      };
    });

    const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);
    const taxAmount = lineItems.reduce((sum, item) => sum + item.taxAmount, 0);

    const invoice: Invoice = {
      id: `inv_${Date.now()}_${globalThis.crypto.randomUUID()}`,
      customerId: params.customerId,
      subscriptionId: params.subscriptionId,
      status: 'draft',
      number: `${this.config.invoicePrefix}-${String(this.invoiceCounter).padStart(6, '0')}`,
      lineItems,
      subtotal,
      taxAmount,
      discountAmount: 0,
      total: subtotal + taxAmount,
      currency: params.currency || this.config.defaultCurrency,
      dueDate: now + dueInDays * 86400000,
      notes: params.notes || '',
      metadata: params.metadata || {},
      createdAt: now,
      updatedAt: now,
    };

    this.invoices.set(invoice.id, invoice);
    const customerInvs = this.customerInvoices.get(params.customerId) || [];
    customerInvs.push(invoice.id);
    this.customerInvoices.set(params.customerId, customerInvs);

    if (this.config.autoFinalize) {
      invoice.status = 'open';
    }

    return invoice;
  }

  /** Send an invoice (mark as open and record send event) */
  async send(invoiceId: string): Promise<Invoice> {
    const invoice = this.getInvoiceOrThrow(invoiceId);
    if (invoice.status !== 'draft' && invoice.status !== 'open') {
      throw new Error(`Cannot send invoice with status: ${invoice.status}`);
    }
    invoice.status = 'open';
    invoice.updatedAt = Date.now();
    return invoice;
  }

  /** Mark an invoice as paid */
  async markPaid(invoiceId: string, paidAt?: number): Promise<Invoice> {
    const invoice = this.getInvoiceOrThrow(invoiceId);
    if (invoice.status === 'void') {
      throw new Error('Cannot mark a voided invoice as paid');
    }
    if (invoice.status === 'paid') {
      throw new Error('Invoice is already paid');
    }
    invoice.status = 'paid';
    invoice.paidAt = paidAt || Date.now();
    invoice.updatedAt = Date.now();
    return invoice;
  }

  /** Get all overdue invoices */
  async getOverdue(customerId?: string): Promise<Invoice[]> {
    const now = Date.now();
    const overdue: Invoice[] = [];

    for (const [, invoice] of this.invoices) {
      if (invoice.status === 'open' && invoice.dueDate < now) {
        if (!customerId || invoice.customerId === customerId) {
          invoice.status = 'overdue';
          overdue.push(invoice);
        }
      }
    }
    return overdue.sort((a, b) => a.dueDate - b.dueDate);
  }

  /** Apply a discount to an invoice */
  async applyDiscount(invoiceId: string, discountId: string): Promise<Invoice> {
    const invoice = this.getInvoiceOrThrow(invoiceId);
    if (invoice.status !== 'draft') {
      throw new Error('Discounts can only be applied to draft invoices');
    }

    const discount = this.discounts.get(discountId);
    if (!discount) throw new Error(`Discount not found: ${discountId}`);

    if (discount.usedCount >= discount.maxUses) {
      throw new Error('Discount has reached maximum uses');
    }
    const now = Date.now();
    if (now < discount.validFrom || now > discount.validUntil) {
      throw new Error('Discount is not currently valid');
    }

    let discountAmount: number;
    if (discount.type === 'percentage') {
      discountAmount = Math.round(invoice.subtotal * (discount.value / 100) * 100) / 100;
    } else {
      discountAmount = Math.min(discount.value, invoice.subtotal);
    }

    invoice.discountAmount = discountAmount;
    invoice.total = invoice.subtotal + invoice.taxAmount - discountAmount;
    invoice.updatedAt = Date.now();
    discount.usedCount++;
    return invoice;
  }

  /** Calculate total for an invoice with all adjustments */
  async calculateTotal(
    invoiceId: string,
  ): Promise<{ subtotal: number; tax: number; discount: number; total: number }> {
    const invoice = this.getInvoiceOrThrow(invoiceId);
    return {
      subtotal: invoice.subtotal,
      tax: invoice.taxAmount,
      discount: invoice.discountAmount,
      total: invoice.total,
    };
  }

  /** Add a line item to a draft invoice */
  async addLineItem(
    invoiceId: string,
    item: {
      description: string;
      quantity: number;
      unitPrice: number;
      taxRate?: number;
      periodStart?: number;
      periodEnd?: number;
    },
  ): Promise<Invoice> {
    const invoice = this.getInvoiceOrThrow(invoiceId);
    if (invoice.status !== 'draft') {
      throw new Error('Can only add line items to draft invoices');
    }

    const amount = item.quantity * item.unitPrice;
    const taxRate = item.taxRate || 0;
    const taxAmount = Math.round(amount * taxRate) / 100;

    const lineItem: InvoiceItem = {
      id: `li_${Date.now()}_${invoice.lineItems.length}`,
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      amount,
      taxRate,
      taxAmount,
      discount: 0,
      periodStart: item.periodStart,
      periodEnd: item.periodEnd,
    };

    invoice.lineItems.push(lineItem);
    this.recalculateInvoice(invoice);
    return invoice;
  }

  /** Finalize an invoice (no more edits allowed) */
  async finalize(invoiceId: string): Promise<Invoice> {
    const invoice = this.getInvoiceOrThrow(invoiceId);
    if (invoice.status !== 'draft') {
      throw new Error('Only draft invoices can be finalized');
    }
    if (invoice.lineItems.length === 0) {
      throw new Error('Cannot finalize invoice with no line items');
    }
    invoice.status = 'open';
    invoice.updatedAt = Date.now();
    return invoice;
  }

  /** Void an invoice */
  async void(invoiceId: string): Promise<Invoice> {
    const invoice = this.getInvoiceOrThrow(invoiceId);
    if (invoice.status === 'paid') {
      throw new Error('Cannot void a paid invoice - issue a refund instead');
    }
    invoice.status = 'void';
    invoice.voidedAt = Date.now();
    invoice.updatedAt = Date.now();
    return invoice;
  }

  /** Get invoice history for a customer */
  async getHistory(
    customerId: string,
    options?: { status?: InvoiceStatus; limit?: number; offset?: number },
  ): Promise<{ invoices: Invoice[]; total: number }> {
    const invoiceIds = this.customerInvoices.get(customerId) || [];
    let invoices = invoiceIds.map((id) => this.invoices.get(id)!).filter(Boolean);

    if (options?.status) {
      invoices = invoices.filter((inv) => inv.status === options.status);
    }

    const total = invoices.length;
    const offset = options?.offset || 0;
    const limit = options?.limit || 50;
    invoices = invoices.sort((a, b) => b.createdAt - a.createdAt).slice(offset, offset + limit);

    return { invoices, total };
  }

  /** Register a discount code */
  registerDiscount(discount: DiscountInfo): void {
    this.discounts.set(discount.id, discount);
  }

  // --- Private Helpers ---

  private getInvoiceOrThrow(id: string): Invoice {
    const invoice = this.invoices.get(id);
    if (!invoice) throw new Error(`Invoice not found: ${id}`);
    return invoice;
  }

  private recalculateInvoice(invoice: Invoice): void {
    invoice.subtotal = invoice.lineItems.reduce((sum, item) => sum + item.amount, 0);
    invoice.taxAmount = invoice.lineItems.reduce((sum, item) => sum + item.taxAmount, 0);
    invoice.total = invoice.subtotal + invoice.taxAmount - invoice.discountAmount;
    invoice.updatedAt = Date.now();
  }
}
