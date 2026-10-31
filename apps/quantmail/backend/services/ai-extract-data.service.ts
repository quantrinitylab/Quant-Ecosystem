import { z } from 'zod';
import type { AIEngine } from '@quant/ai';
import { createAppError } from '@quant/server-core';

export interface ReceiptData {
  vendor: string;
  date: string;
  total: number;
  // Nullable by design: a receipt that shows no currency must stay null
  // through the whole chain (service → API → renderer) so no layer ever
  // invents a currency for an amount the document never tagged with one.
  currency: string | null;
  items: Array<{ description: string; amount: number }>;
  taxAmount: number;
}

export interface InvoiceData {
  invoiceNumber: string;
  vendor: string;
  dueDate: string;
  lineItems: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
  subtotal: number;
  tax: number;
  total: number;
  // Nullable by design: see ReceiptData.currency.
  currency: string | null;
}

// The model may omit the key, return null, or return a blank string when
// the document shows no currency. All three mean "unknown", never a default.
const nullableCurrency = z.string().nullable().optional();

const ReceiptDataSchema = z.object({
  vendor: z.string(),
  date: z.string(),
  total: z.number(),
  currency: nullableCurrency,
  items: z.array(z.object({ description: z.string(), amount: z.number() })),
  taxAmount: z.number(),
});

const InvoiceDataSchema = z.object({
  invoiceNumber: z.string(),
  vendor: z.string(),
  dueDate: z.string(),
  lineItems: z.array(
    z.object({
      description: z.string(),
      quantity: z.number(),
      unitPrice: z.number(),
      total: z.number(),
    }),
  ),
  subtotal: z.number(),
  tax: z.number(),
  total: z.number(),
  currency: nullableCurrency,
});

/** Canonicalize a reported currency: trimmed when present, null otherwise. */
function normalizeCurrency(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export class AIExtractDataService {
  constructor(private readonly ai: AIEngine) {}

  async extractFromReceipt(content: string, userId: string): Promise<ReceiptData> {
    const response = await this.ai.infer({
      prompt: `Extract structured data from the following receipt content.\n\nReceipt Content:\n${content.slice(0, 3000)}\n\nRespond ONLY with valid JSON:\n{\n  "vendor": "store/business name",\n  "date": "YYYY-MM-DD",\n  "total": 0.00,\n  "currency": null,\n  "items": [{"description": "item name", "amount": 0.00}],\n  "taxAmount": 0.00\n}\n\nSet "currency" to the currency exactly as shown on the document, or null when the document shows no currency. Never guess, infer, or default a currency for an untagged amount.`,
      systemPrompt:
        'You are a data extraction assistant specializing in receipts. Extract structured data from receipt text accurately. Always respond with valid JSON only. Never invent a currency: report only a currency shown on the document, otherwise null.',
      userId,
      app: 'quantmail',
      feature: 'drive-ai-extract',
      stateless: true,
      temperature: 0.2,
      maxTokens: 1024,
    });
    const data = this.parse(response.content, ReceiptDataSchema, 'receipt');
    return { ...data, currency: normalizeCurrency(data.currency) };
  }

  async extractFromInvoice(content: string, userId: string): Promise<InvoiceData> {
    const response = await this.ai.infer({
      prompt: `Extract structured data from the following invoice content.\n\nInvoice Content:\n${content.slice(0, 3000)}\n\nRespond ONLY with valid JSON:\n{\n  "invoiceNumber": "INV-001",\n  "vendor": "company name",\n  "dueDate": "YYYY-MM-DD",\n  "lineItems": [{"description": "item", "quantity": 1, "unitPrice": 0.00, "total": 0.00}],\n  "subtotal": 0.00,\n  "tax": 0.00,\n  "total": 0.00,\n  "currency": null\n}\n\nSet "currency" to the currency exactly as shown on the document, or null when the document shows no currency. Never guess, infer, or default a currency for an untagged amount.`,
      systemPrompt:
        'You are a data extraction assistant specializing in invoices. Extract structured data from invoice text accurately. Always respond with valid JSON only. Never invent a currency: report only a currency shown on the document, otherwise null.',
      userId,
      app: 'quantmail',
      feature: 'drive-ai-extract',
      stateless: true,
      temperature: 0.2,
      maxTokens: 1024,
    });
    const data = this.parse(response.content, InvoiceDataSchema, 'invoice');
    return { ...data, currency: normalizeCurrency(data.currency) };
  }

  private parse<T>(content: string, schema: z.ZodType<T>, kind: string): T {
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw createAppError('Failed to parse AI extract response', 500, 'AI_PARSE_ERROR');
    }
    const result = schema.safeParse(parsed);
    if (!result.success) {
      throw createAppError(
        `AI returned invalid ${kind} extraction result`,
        500,
        'AI_VALIDATION_ERROR',
      );
    }
    return result.data;
  }
}
