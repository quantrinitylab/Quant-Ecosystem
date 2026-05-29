import { describe, it, expect, beforeEach } from 'vitest';
import { InvoiceService } from './invoice-service';
import type { DiscountInfo } from '../types';

const discount = (over: Partial<DiscountInfo> = {}): DiscountInfo => ({
  id: 'disc_1',
  code: 'SAVE10',
  type: 'percentage',
  value: 10,
  maxUses: 5,
  usedCount: 0,
  validFrom: Date.now() - 1000,
  validUntil: Date.now() + 1_000_000,
  applicablePlans: [],
  ...over,
});

describe('InvoiceService', () => {
  let svc: InvoiceService;

  beforeEach(() => {
    svc = new InvoiceService();
  });

  const sampleItems = [
    { description: 'Seat', quantity: 2, unitPrice: 1000, taxRate: 10 },
    { description: 'Addon', quantity: 1, unitPrice: 500 },
  ];

  describe('generate', () => {
    it('creates a draft invoice with computed subtotal/tax/total and a sequential number', async () => {
      const inv = await svc.generate({ customerId: 'cust_1', lineItems: sampleItems });
      expect(inv.status).toBe('draft');
      expect(inv.number).toBe('INV-000001');
      expect(inv.subtotal).toBe(2500); // 2*1000 + 500
      // taxAmount = round(2000*10)/100 = 200 for first, 0 for second
      expect(inv.taxAmount).toBe(200);
      expect(inv.total).toBe(2700);
      expect(inv.currency).toBe('USD');
    });

    it('increments the invoice counter and tracks per-customer invoices', async () => {
      await svc.generate({ customerId: 'cust_1', lineItems: sampleItems });
      const second = await svc.generate({ customerId: 'cust_1', lineItems: sampleItems });
      expect(second.number).toBe('INV-000002');
      const history = await svc.getHistory('cust_1');
      expect(history.total).toBe(2);
    });

    it('respects autoFinalize config + custom currency/dueInDays', async () => {
      const auto = new InvoiceService({ autoFinalize: true, defaultCurrency: 'EUR' });
      const inv = await auto.generate({ customerId: 'c', lineItems: sampleItems, dueInDays: 7 });
      expect(inv.status).toBe('open');
      expect(inv.currency).toBe('EUR');
    });
  });

  describe('lifecycle: send / markPaid / void', () => {
    it('sends a draft invoice (-> open)', async () => {
      const inv = await svc.generate({ customerId: 'c', lineItems: sampleItems });
      const sent = await svc.send(inv.id);
      expect(sent.status).toBe('open');
    });

    it('throws when sending a paid invoice', async () => {
      const inv = await svc.generate({ customerId: 'c', lineItems: sampleItems });
      await svc.markPaid(inv.id);
      await expect(svc.send(inv.id)).rejects.toThrow(/Cannot send/);
    });

    it('marks an invoice paid and rejects double-pay / paying a void', async () => {
      const inv = await svc.generate({ customerId: 'c', lineItems: sampleItems });
      const paid = await svc.markPaid(inv.id, 12345);
      expect(paid.status).toBe('paid');
      expect(paid.paidAt).toBe(12345);
      await expect(svc.markPaid(inv.id)).rejects.toThrow(/already paid/);

      const inv2 = await svc.generate({ customerId: 'c', lineItems: sampleItems });
      await svc.void(inv2.id);
      await expect(svc.markPaid(inv2.id)).rejects.toThrow(/voided/);
    });

    it('voids a draft but not a paid invoice', async () => {
      const inv = await svc.generate({ customerId: 'c', lineItems: sampleItems });
      const voided = await svc.void(inv.id);
      expect(voided.status).toBe('void');
      expect(voided.voidedAt).toBeGreaterThan(0);

      const paid = await svc.generate({ customerId: 'c', lineItems: sampleItems });
      await svc.markPaid(paid.id);
      await expect(svc.void(paid.id)).rejects.toThrow(/refund/);
    });
  });

  describe('getOverdue', () => {
    it('flags open invoices past due date and filters by customer', async () => {
      const inv = await svc.generate({ customerId: 'cust_1', lineItems: sampleItems, dueInDays: -1 });
      await svc.send(inv.id); // open
      const overdue = await svc.getOverdue('cust_1');
      expect(overdue).toHaveLength(1);
      expect(overdue[0]?.status).toBe('overdue');
      expect(await svc.getOverdue('other')).toHaveLength(0);
    });
  });

  describe('discounts', () => {
    it('applies a percentage discount to a draft invoice', async () => {
      svc.registerDiscount(discount({ value: 10 }));
      const inv = await svc.generate({ customerId: 'c', lineItems: sampleItems });
      const updated = await svc.applyDiscount(inv.id, 'disc_1');
      expect(updated.discountAmount).toBe(250); // 10% of 2500
      expect(updated.total).toBe(2500 + 200 - 250);
    });

    it('applies a fixed-amount discount capped at subtotal', async () => {
      svc.registerDiscount(discount({ id: 'd2', type: 'fixed_amount', value: 100000 }));
      const inv = await svc.generate({ customerId: 'c', lineItems: sampleItems });
      const updated = await svc.applyDiscount(inv.id, 'd2');
      expect(updated.discountAmount).toBe(2500); // capped at subtotal
    });

    it('rejects unknown / exhausted / expired discounts and non-draft invoices', async () => {
      const inv = await svc.generate({ customerId: 'c', lineItems: sampleItems });
      await expect(svc.applyDiscount(inv.id, 'nope')).rejects.toThrow(/Discount not found/);

      svc.registerDiscount(discount({ id: 'used', usedCount: 5, maxUses: 5 }));
      await expect(svc.applyDiscount(inv.id, 'used')).rejects.toThrow(/maximum uses/);

      svc.registerDiscount(discount({ id: 'expired', validUntil: Date.now() - 1 }));
      await expect(svc.applyDiscount(inv.id, 'expired')).rejects.toThrow(/not currently valid/);

      await svc.send(inv.id);
      svc.registerDiscount(discount({ id: 'ok' }));
      await expect(svc.applyDiscount(inv.id, 'ok')).rejects.toThrow(/draft invoices/);
    });
  });

  describe('addLineItem + recalculate + calculateTotal', () => {
    it('adds a line item to a draft and recalculates totals', async () => {
      const inv = await svc.generate({ customerId: 'c', lineItems: sampleItems });
      const updated = await svc.addLineItem(inv.id, { description: 'Extra', quantity: 3, unitPrice: 100 });
      expect(updated.lineItems).toHaveLength(3);
      expect(updated.subtotal).toBe(2800); // +300
      const totals = await svc.calculateTotal(inv.id);
      expect(totals.total).toBe(updated.total);
    });

    it('refuses to add line items to non-draft invoices', async () => {
      const inv = await svc.generate({ customerId: 'c', lineItems: sampleItems });
      await svc.send(inv.id);
      await expect(
        svc.addLineItem(inv.id, { description: 'x', quantity: 1, unitPrice: 1 }),
      ).rejects.toThrow(/draft invoices/);
    });
  });

  describe('finalize', () => {
    it('finalizes a draft with line items (-> open)', async () => {
      const inv = await svc.generate({ customerId: 'c', lineItems: sampleItems });
      const fin = await svc.finalize(inv.id);
      expect(fin.status).toBe('open');
    });

    it('refuses to finalize a non-draft or an empty invoice', async () => {
      const empty = await svc.generate({ customerId: 'c', lineItems: [] });
      await expect(svc.finalize(empty.id)).rejects.toThrow(/no line items/);

      const inv = await svc.generate({ customerId: 'c', lineItems: sampleItems });
      await svc.send(inv.id);
      await expect(svc.finalize(inv.id)).rejects.toThrow(/draft invoices can be finalized/);
    });
  });

  describe('getHistory', () => {
    it('filters by status and paginates', async () => {
      const a = await svc.generate({ customerId: 'cust_1', lineItems: sampleItems });
      await svc.generate({ customerId: 'cust_1', lineItems: sampleItems });
      await svc.markPaid(a.id);

      const paid = await svc.getHistory('cust_1', { status: 'paid' });
      expect(paid.total).toBe(1);

      const page = await svc.getHistory('cust_1', { limit: 1, offset: 0 });
      expect(page.invoices).toHaveLength(1);
      expect(page.total).toBe(2);
    });

    it('returns empty history for an unknown customer', async () => {
      expect((await svc.getHistory('ghost')).total).toBe(0);
    });
  });

  it('getInvoiceOrThrow surfaces not-found errors', async () => {
    await expect(svc.send('missing')).rejects.toThrow(/Invoice not found/);
  });
});
