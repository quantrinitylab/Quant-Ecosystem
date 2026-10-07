// @vitest-environment node
// ============================================================================
// ERPGo Automated Invoice & Receipt Generator Unit & Integration Tests
// ============================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import { errorHandlerPlugin } from '@quant/server-core';
import { InvoiceGeneratorService } from '../services/invoice-generator.service';
import invoicesRoutes from '../routes/invoices';

describe('ERPGo Invoice & Receipt Generator Engine', () => {
  let service: InvoiceGeneratorService;

  beforeEach(() => {
    service = new InvoiceGeneratorService();
  });

  it('calculates subtotal, percentage taxes, and grand total correctly with multi-item orders', () => {
    const items = [
      { quantity: 2, unitPrice: 50, taxRate: 10 }, // Amount: 100, Tax: 10
      { quantity: 1, unitPrice: 200, taxRate: 20 }, // Amount: 200, Tax: 40
      { quantity: 4, unitPrice: 25, taxRate: 0 }, // Amount: 100, Tax: 0
    ];

    const result = service.calculateInvoiceTotals(items);

    expect(result.subtotal).toBe(400); // 100 + 200 + 100
    expect(result.taxTotal).toBe(50); // 10 + 40 + 0
    expect(result.grandTotal).toBe(450); // 400 + 50
    expect(result.items).toHaveLength(3);
    expect(result.items[0].amount).toBe(100);
    expect(result.items[1].amount).toBe(200);
    expect(result.items[2].amount).toBe(100);
  });

  it('creates invoice with sequential format INV-2026-XXXX', () => {
    const inv1 = service.createInvoice('ws-1', {
      customer: {
        name: 'Acme Corp',
        email: 'billing@acme.com',
        address: '100 Tech Way',
      },
      items: [{ quantity: 1, unitPrice: 1500, taxRate: 15 }],
    });

    const inv2 = service.createInvoice('ws-1', {
      customer: {
        name: 'Beta LLC',
        email: 'finance@beta.io',
        address: '200 Startup Ave',
      },
      items: [{ quantity: 2, unitPrice: 500, taxRate: 10 }],
    });

    expect(inv1.invoiceNumber).toMatch(/^INV-2026-\d{4}$/);
    expect(inv2.invoiceNumber).toMatch(/^INV-2026-\d{4}$/);
    expect(inv1.invoiceNumber).not.toBe(inv2.invoiceNumber);
    expect(inv1.workspaceId).toBe('ws-1');
    expect(inv1.grandTotal).toBe(1725); // 1500 + 225 tax
  });

  it('renders HTML template containing customer name, total amount, and line items', () => {
    const invoice = service.createInvoice('ws-test', {
      customer: {
        name: 'Globex Corporation',
        email: 'ap@globex.com',
        address: '742 Evergreen Terrace',
      },
      items: [
        { description: 'Enterprise Cloud License', quantity: 1, unitPrice: 999, taxRate: 10 },
      ],
    });

    const html = service.renderInvoiceHtml(invoice);

    expect(html).toContain('Globex Corporation');
    expect(html).toContain('Enterprise Cloud License');
    expect(html).toContain(invoice.invoiceNumber);
    expect(html).toContain('1098.90'); // 999 + 99.90 tax = 1098.90
    expect(html).toContain('Pay Now');
  });

  describe('Invoices API Routes Integration', () => {
    let app: any;

    beforeEach(async () => {
      app = Fastify();
      await app.register(errorHandlerPlugin);
      await app.register(invoicesRoutes);
    });

    afterEach(async () => {
      await app.close();
    });

    it('handles POST and GET invoice endpoints successfully', async () => {
      const payload = {
        customer: {
          name: 'Stark Industries',
          email: 'tony@stark.com',
          address: '10880 Malibu Point',
        },
        items: [{ description: 'Arc Reactor Core', quantity: 1, unitPrice: 50000, taxRate: 20 }],
      };

      const createRes = await app.inject({
        method: 'POST',
        url: '/api/workspaces/ws-stark/invoices',
        payload,
      });

      expect(createRes.statusCode).toBe(201);
      const createData = JSON.parse(createRes.payload);
      expect(createData.success).toBe(true);
      const invoiceId = createData.data.id;
      const invoiceNum = createData.data.invoiceNumber;
      expect(invoiceNum).toMatch(/^INV-2026-\d{4}$/);
      expect(createData.data.grandTotal).toBe(60000);

      const getRes = await app.inject({
        method: 'GET',
        url: `/api/workspaces/ws-stark/invoices/${invoiceId}`,
      });

      expect(getRes.statusCode).toBe(200);
      const getData = JSON.parse(getRes.payload);
      expect(getData.data.id).toBe(invoiceId);
      expect(getData.data.customer.name).toBe('Stark Industries');

      const htmlRes = await app.inject({
        method: 'GET',
        url: `/api/workspaces/ws-stark/invoices/${invoiceId}/html`,
      });

      expect(htmlRes.statusCode).toBe(200);
      expect(htmlRes.headers['content-type']).toContain('text/html');
      expect(htmlRes.payload).toContain('Stark Industries');
      expect(htmlRes.payload).toContain('Arc Reactor Core');
      expect(htmlRes.payload).toContain('60000.00');
    });
  });
});
