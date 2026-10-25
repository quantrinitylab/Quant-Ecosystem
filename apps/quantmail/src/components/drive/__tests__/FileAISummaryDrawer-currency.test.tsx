import { describe, it, expect, vi } from 'vitest';
import { AISummaryManager } from '../FileAISummaryDrawer';

const RECEIPT_FILE = { id: 'file-1', name: 'receipt.pdf', mimeType: 'application/pdf', size: 1024 };

function managerWithPayload(payload: Record<string, unknown>) {
  const mockFetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => payload,
  });
  return new AISummaryManager({ fetchFn: mockFetch as unknown as typeof fetch });
}

describe('FileAISummaryDrawer extractEntities currency honesty', () => {
  it('never invents $ when the backend omits currency — marks amounts currency unknown', async () => {
    const manager = managerWithPayload({
      vendor: 'Blue Tokai Coffee',
      date: '2026-09-24',
      total: 1200,
      subtotal: 1000,
      taxAmount: 200,
    });
    const result = await manager.extractEntities(RECEIPT_FILE);
    expect(result?.amounts).toEqual([
      '1200 (currency unknown)',
      'Subtotal: 1000 (currency unknown)',
      'Tax: 200 (currency unknown)',
    ]);
    // No invented USD anywhere in the extracted amounts.
    expect(result?.amounts?.join(' ')).not.toContain('$');
  });

  it('treats an empty-string currency as unknown, not as $', async () => {
    const manager = managerWithPayload({ total: 50, currency: '' });
    const result = await manager.extractEntities(RECEIPT_FILE);
    expect(result?.amounts).toEqual(['50 (currency unknown)']);
  });

  it('invoice-shaped payloads use the `tax` field with the same honesty (no currency → unknown)', async () => {
    const manager = managerWithPayload({
      vendor: 'Quant Labs',
      dueDate: '2026-10-01',
      total: 590,
      subtotal: 500,
      tax: 90,
    });
    const result = await manager.extractEntities({ id: 'file-2', name: 'invoice.pdf', mimeType: 'application/pdf', size: 1024 });
    expect(result?.amounts).toEqual([
      '590 (currency unknown)',
      'Subtotal: 500 (currency unknown)',
      'Tax: 90 (currency unknown)',
    ]);
    expect(result?.amounts?.join(' ')).not.toContain('$');
  });

  it('invoice-shaped payloads use the reported currency on total, subtotal AND tax', async () => {
    const manager = managerWithPayload({
      total: 590,
      subtotal: 500,
      tax: 90,
      currency: '₹',
    });
    const result = await manager.extractEntities({ id: 'file-2', name: 'invoice.pdf', mimeType: 'application/pdf', size: 1024 });
    expect(result?.amounts).toEqual(['₹590', 'Subtotal: ₹500', 'Tax: ₹90']);
  });

  it('uses the reported currency for total, subtotal AND tax when present', async () => {
    const manager = managerWithPayload({
      total: 450,
      subtotal: 400,
      taxAmount: 50,
      currency: '₹',
    });
    const result = await manager.extractEntities(RECEIPT_FILE);
    expect(result?.amounts).toEqual(['₹450', 'Subtotal: ₹400', 'Tax: ₹50']);
  });
});
