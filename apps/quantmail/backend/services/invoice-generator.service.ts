// ============================================================================
// QuantMail & ERPGo — Automated Invoice & Receipt Generator Service
// ============================================================================

export interface InvoiceLineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate?: number; // percentage, e.g. 20 for 20%
  amount: number; // quantity * unitPrice
}

export interface InvoiceCustomer {
  name: string;
  email: string;
  address: string;
  taxId?: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string; // e.g. INV-2026-0001
  workspaceId: string;
  customer: InvoiceCustomer;
  items: InvoiceLineItem[];
  currency: string;
  subtotal: number;
  taxTotal: number;
  grandTotal: number;
  issueDate: string;
  dueDate: string;
  status: 'DRAFT' | 'SENT' | 'PAID' | 'OVERDUE';
  paymentLink?: string;
}

export interface CalculateTotalsInput {
  quantity: number;
  unitPrice: number;
  taxRate?: number;
  description?: string;
  id?: string;
}

export class InvoiceGeneratorService {
  private static invoicesStore = new Map<string, Invoice>();
  private static sequenceCounter = 1000;

  constructor(private prisma?: any) {}

  public calculateInvoiceTotals(items: CalculateTotalsInput[]): {
    subtotal: number;
    taxTotal: number;
    grandTotal: number;
    items: InvoiceLineItem[];
  } {
    let subtotal = 0;
    let taxTotal = 0;

    const processedItems: InvoiceLineItem[] = items.map((item, idx) => {
      const quantity = Number(item.quantity) || 0;
      const unitPrice = Number(item.unitPrice) || 0;
      const taxRate = Number(item.taxRate) || 0;
      const amount = Number((quantity * unitPrice).toFixed(2));
      const taxAmount = Number((amount * (taxRate / 100)).toFixed(2));

      subtotal += amount;
      taxTotal += taxAmount;

      return {
        id: item.id || `item-${idx + 1}`,
        description: item.description || `Line Item ${idx + 1}`,
        quantity,
        unitPrice,
        taxRate,
        amount,
      };
    });

    subtotal = Number(subtotal.toFixed(2));
    taxTotal = Number(taxTotal.toFixed(2));
    const grandTotal = Number((subtotal + taxTotal).toFixed(2));

    return {
      subtotal,
      taxTotal,
      grandTotal,
      items: processedItems,
    };
  }

  public createInvoice(
    workspaceId: string,
    data: {
      customer: InvoiceCustomer;
      items: CalculateTotalsInput[];
      currency?: string;
      issueDate?: string;
      dueDate?: string;
      status?: 'DRAFT' | 'SENT' | 'PAID' | 'OVERDUE';
      paymentLink?: string;
    },
  ): Invoice {
    InvoiceGeneratorService.sequenceCounter++;
    const seqNum = String(InvoiceGeneratorService.sequenceCounter).padStart(4, '0');
    const invoiceNumber = `INV-2026-${seqNum}`;
    const invoiceId = `inv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const totals = this.calculateInvoiceTotals(data.items);

    const invoice: Invoice = {
      id: invoiceId,
      invoiceNumber,
      workspaceId,
      customer: {
        name: data.customer?.name || 'Valued Customer',
        email: data.customer?.email || 'customer@example.com',
        address: data.customer?.address || '123 Business Rd',
        taxId: data.customer?.taxId,
      },
      items: totals.items,
      currency: data.currency || 'USD',
      subtotal: totals.subtotal,
      taxTotal: totals.taxTotal,
      grandTotal: totals.grandTotal,
      issueDate: data.issueDate || new Date().toISOString().split('T')[0],
      dueDate:
        data.dueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      status: data.status || 'DRAFT',
      paymentLink: data.paymentLink || `https://quantmail.in/pay/${invoiceId}`,
    };

    InvoiceGeneratorService.invoicesStore.set(invoiceId, invoice);
    InvoiceGeneratorService.invoicesStore.set(invoiceNumber, invoice);

    return invoice;
  }

  public getInvoice(invoiceId: string): Invoice | null {
    return InvoiceGeneratorService.invoicesStore.get(invoiceId) || null;
  }

  public renderInvoiceHtml(invoice: Invoice): string {
    const escape = (str: string) =>
      String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const itemsHtml = invoice.items
      .map(
        (item) => `
        <tr>
          <td style="padding: 12px 16px; border-bottom: 1px solid #334155; color: #f8fafc;">${escape(item.description)}</td>
          <td style="padding: 12px 16px; border-bottom: 1px solid #334155; text-align: right; color: #cbd5e1;">${item.quantity}</td>
          <td style="padding: 12px 16px; border-bottom: 1px solid #334155; text-align: right; color: #cbd5e1;">${invoice.currency} ${item.unitPrice.toFixed(2)}</td>
          <td style="padding: 12px 16px; border-bottom: 1px solid #334155; text-align: right; color: #cbd5e1;">${item.taxRate ?? 0}%</td>
          <td style="padding: 12px 16px; border-bottom: 1px solid #334155; text-align: right; color: #f8fafc; font-weight: 600;">${invoice.currency} ${item.amount.toFixed(2)}</td>
        </tr>
      `,
      )
      .join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Invoice ${escape(invoice.invoiceNumber)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0f19; color: #f1f5f9; margin: 0; padding: 40px; }
    .invoice-card { max-width: 800px; margin: 0 auto; background: #111827; border: 1px solid #1f2937; border-radius: 12px; padding: 40px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.3); }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1f2937; padding-bottom: 24px; margin-bottom: 24px; }
    .brand { font-size: 24px; font-weight: 800; color: #38bdf8; letter-spacing: -0.5px; }
    .invoice-meta { text-align: right; }
    .invoice-meta h1 { margin: 0 0 8px 0; font-size: 28px; color: #f8fafc; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: 600; text-transform: uppercase; }
    .badge-draft { background: #374151; color: #9ca3af; }
    .badge-sent { background: #1e3a8a; color: #93c5fd; }
    .badge-paid { background: #065f46; color: #6ee7b7; }
    .badge-overdue { background: #7f1d1d; color: #fca5a5; }
    .parties { display: flex; justify-content: space-between; margin-bottom: 32px; font-size: 14px; color: #94a3b8; }
    .parties h3 { color: #f8fafc; margin-bottom: 6px; font-size: 15px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 32px; }
    th { background: #1f2937; color: #cbd5e1; font-weight: 600; text-align: left; padding: 12px 16px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; }
    th:nth-child(2), th:nth-child(3), th:nth-child(4), th:nth-child(5) { text-align: right; }
    .totals { width: 300px; margin-left: auto; font-size: 14px; margin-bottom: 40px; }
    .totals-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #1f2937; color: #94a3b8; }
    .totals-row.grand { font-size: 18px; font-weight: 700; color: #f8fafc; border-bottom: 2px solid #38bdf8; border-top: 1px solid #38bdf8; margin-top: 8px; padding-top: 12px; padding-bottom: 12px; }
    .footer { text-align: center; border-top: 1px solid #1f2937; padding-top: 24px; }
    .btn { display: inline-block; background: #38bdf8; color: #0b0f19; font-weight: 700; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-size: 15px; box-shadow: 0 4px 12px rgba(56,189,248,0.3); transition: background 0.2s; }
    .btn:hover { background: #0ea5e9; }
  </style>
</head>
<body>
  <div class="invoice-card">
    <div class="header">
      <div>
        <div class="brand">QuantMail ERPGo</div>
        <p style="margin: 4px 0 0; color: #94a3b8; font-size: 13px;">Enterprise Invoicing & Billing</p>
      </div>
      <div class="invoice-meta">
        <h1>${escape(invoice.invoiceNumber)}</h1>
        <span class="badge badge-${invoice.status.toLowerCase()}">${escape(invoice.status)}</span>
      </div>
    </div>

    <div class="parties">
      <div>
        <h3>Billed To:</h3>
        <p style="margin: 0; font-weight: 600; color: #f8fafc;">${escape(invoice.customer.name)}</p>
        <p style="margin: 2px 0;">${escape(invoice.customer.email)}</p>
        <p style="margin: 2px 0; white-space: pre-line;">${escape(invoice.customer.address)}</p>
        ${invoice.customer.taxId ? `<p style="margin: 2px 0;">Tax ID: ${escape(invoice.customer.taxId)}</p>` : ''}
      </div>
      <div style="text-align: right;">
        <h3>Invoice Details:</h3>
        <p style="margin: 0;"><strong>Issue Date:</strong> ${escape(invoice.issueDate)}</p>
        <p style="margin: 2px 0;"><strong>Due Date:</strong> ${escape(invoice.dueDate)}</p>
        <p style="margin: 2px 0;"><strong>Workspace:</strong> ${escape(invoice.workspaceId)}</p>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Description</th>
          <th style="text-align: right;">Qty</th>
          <th style="text-align: right;">Unit Price</th>
          <th style="text-align: right;">Tax Rate</th>
          <th style="text-align: right;">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHtml}
      </tbody>
    </table>

    <div class="totals">
      <div class="totals-row">
        <span>Subtotal</span>
        <span>${invoice.currency} ${invoice.subtotal.toFixed(2)}</span>
      </div>
      <div class="totals-row">
        <span>Tax Total</span>
        <span>${invoice.currency} ${invoice.taxTotal.toFixed(2)}</span>
      </div>
      <div class="totals-row grand">
        <span>Grand Total</span>
        <span>${invoice.currency} ${invoice.grandTotal.toFixed(2)}</span>
      </div>
    </div>

    ${
      invoice.paymentLink
        ? `
    <div class="footer">
      <a href="${escape(invoice.paymentLink)}" class="btn">Pay Now (${invoice.currency} ${invoice.grandTotal.toFixed(2)})</a>
      <p style="margin: 16px 0 0; color: #64748b; font-size: 12px;">Thank you for your business with Quant Ecosystem & ERPGo.</p>
    </div>
    `
        : ''
    }
  </div>
</body>
</html>`;
  }
}
