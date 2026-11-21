// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@quant/server-core', () => ({
  createAppError: (message: string, status: number, code: string) => {
    const error = new Error(message) as Error & { status: number; code: string };
    error.status = status;
    error.code = code;
    return error;
  },
}));

const { inferMock } = vi.hoisted(() => ({ inferMock: vi.fn() }));

import { AIExtractDataService } from '../services/ai-extract-data.service';

const RECEIPT_BASE = {
  vendor: 'Blue Tokai Coffee',
  date: '2026-09-24',
  total: 1200,
  items: [{ description: 'Coffee', amount: 1200 }],
  taxAmount: 100,
};
const INVOICE_BASE = {
  invoiceNumber: 'INV-1',
  vendor: 'Quant Labs',
  dueDate: '2026-10-01',
  lineItems: [{ description: 'Service', quantity: 1, unitPrice: 500, total: 500 }],
  subtotal: 500,
  tax: 90,
  total: 590,
};

beforeEach(() => {
  inferMock.mockReset();
});

function service() {
  return new AIExtractDataService({ infer: inferMock } as never);
}

describe('AIExtractDataService currency nullability (upstream of the drawer)', () => {
  it('receipt: a missing currency key stays null, not a default', async () => {
    inferMock.mockResolvedValue({ content: JSON.stringify(RECEIPT_BASE) });
    const data = await service().extractFromReceipt('receipt text', 'user-1');
    expect(data.currency).toBeNull();
    expect(JSON.stringify(data)).not.toContain('$');
  });

  it('receipt: explicit null and blank currencies normalize to null', async () => {
    for (const currency of [null, '', '   ']) {
      inferMock.mockResolvedValue({ content: JSON.stringify({ ...RECEIPT_BASE, currency }) });
      const data = await service().extractFromReceipt('receipt text', 'user-1');
      expect(data.currency).toBeNull();
    }
  });

  it('receipt: a reported currency is trimmed and preserved, never replaced', async () => {
    inferMock.mockResolvedValue({ content: JSON.stringify({ ...RECEIPT_BASE, currency: ' ₹ ' }) });
    const data = await service().extractFromReceipt('receipt text', 'user-1');
    expect(data.currency).toBe('₹');
  });

  it('invoice: a missing currency key stays null, not a default', async () => {
    inferMock.mockResolvedValue({ content: JSON.stringify(INVOICE_BASE) });
    const data = await service().extractFromInvoice('invoice text', 'user-1');
    expect(data.currency).toBeNull();
  });

  it('invoice: a reported currency flows through unchanged', async () => {
    inferMock.mockResolvedValue({ content: JSON.stringify({ ...INVOICE_BASE, currency: '₹' }) });
    const data = await service().extractFromInvoice('invoice text', 'user-1');
    expect(data.currency).toBe('₹');
    expect(data.total).toBe(590);
    expect(data.subtotal).toBe(500);
    expect(data.tax).toBe(90);
  });

  it('a genuinely reported USD value is preserved (it is data, not a default)', async () => {
    inferMock.mockResolvedValue({ content: JSON.stringify({ ...RECEIPT_BASE, currency: 'USD' }) });
    const data = await service().extractFromReceipt('receipt text', 'user-1');
    expect(data.currency).toBe('USD');
  });

  it('prompts never steer the model toward USD', async () => {
    inferMock.mockResolvedValue({ content: JSON.stringify({ ...RECEIPT_BASE, currency: null }) });
    await service().extractFromReceipt('receipt text', 'user-1');
    const receiptCall = inferMock.mock.calls[0][0] as { prompt: string; systemPrompt: string };
    expect(receiptCall.prompt).not.toContain('USD');
    expect(receiptCall.prompt).toContain('"currency": null');
    expect(receiptCall.systemPrompt).toContain('Never invent a currency');

    inferMock.mockResolvedValue({ content: JSON.stringify({ ...INVOICE_BASE, currency: null }) });
    await service().extractFromInvoice('invoice text', 'user-1');
    const invoiceCall = inferMock.mock.calls[1][0] as { prompt: string; systemPrompt: string };
    expect(invoiceCall.prompt).not.toContain('USD');
    expect(invoiceCall.prompt).toContain('"currency": null');
    expect(invoiceCall.systemPrompt).toContain('Never invent a currency');
  });
});
